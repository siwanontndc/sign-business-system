"use client";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "../../lib/supabase";
import {readSlipLocally} from "../../lib/localSlipOcr";

const CATEGORIES=["รายได้งานป้าย","เงินมัดจำ","ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","อื่น ๆ"];
const input={width:"100%",padding:11,border:"1px solid #d1d5db",borderRadius:9,boxSizing:"border-box",background:"white"};
const btn={padding:"11px 14px",border:0,borderRadius:9,fontWeight:800,cursor:"pointer"};
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/(\d{2})\/(\d{2})\/(\d{4})/,"$3-$1-$2");}
function makeId(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;}

export default function MobileFinanceImportPage(){
  const router=useRouter();
  const [ready,setReady]=useState(false),[items,setItems]=useState([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(""),[saved,setSaved]=useState(0);

  useEffect(()=>{(async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session){router.replace("/login");return;}setReady(true);})();},[router]);
  const pending=useMemo(()=>items.filter(x=>!x.saved),[items]);

  async function choose(e){
    const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith("image/"));
    if(!files.length)return;
    setBusy(true);setError("");setProgress(0);
    const next=[];
    try{
      for(let i=0;i<files.length;i++){
        const file=files[i];
        const result=await readSlipLocally(file,p=>setProgress(Math.round(((i+p/100)/files.length)*100)));
        const f=result.fields||{};
        next.push({
          id:makeId(),file,preview:URL.createObjectURL(file),raw:result.text||"",saved:false,
          direction:f.direction||"expense",amount:f.amount||"",category:f.direction==="income"?"รายได้งานป้าย":"ค่าวัสดุ",
          transaction_date:f.transaction_date||today(),project_name:"",counterparty:"",bank_name:f.bank_name||"",reference_no:f.reference_no||"",description:""
        });
      }
      setItems(prev=>[...next,...prev]);
    }catch(err){setError(err?.message||"อ่านรูปไม่สำเร็จ");}
    finally{setBusy(false);setProgress(100);e.target.value="";}
  }

  function change(id,key,value){setItems(prev=>prev.map(x=>x.id===id?{...x,[key]:value}:x));}
  function remove(id){setItems(prev=>{const x=prev.find(v=>v.id===id);if(x?.preview)URL.revokeObjectURL(x.preview);return prev.filter(v=>v.id!==id);});}

  async function saveOne(item){
    if(!(Number(item.amount)>0)){setError("กรุณาตรวจสอบจำนวนเงินก่อนบันทึก");return;}
    setBusy(true);setError("");
    try{
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("กรุณาเข้าสู่ระบบใหม่");
      const safe=`${Date.now()}-${makeId()}-${String(item.file.name||"slip.jpg").replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const path=`gallery/${session.user.id}/${safe}`;
      const up=await supabase.storage.from("finance-evidence").upload(path,item.file,{contentType:item.file.type||"image/jpeg",upsert:false});
      if(up.error)throw up.error;
      const row={
        direction:item.direction,amount:Number(item.amount),category:item.category||"อื่น ๆ",description:item.description||"",
        project_name:item.project_name||"",transaction_date:new Date(`${item.transaction_date}T12:00:00+07:00`).toISOString(),
        counterparty:item.counterparty||"",bank_name:item.bank_name||"",reference_no:item.reference_no||"",
        source:"gallery",status:"confirmed",evidence_path:path,raw_text:item.raw||null,created_by:session.user.id
      };
      const {error:e}=await supabase.from("finance_transactions").insert(row);if(e)throw e;
      setItems(prev=>prev.map(x=>x.id===item.id?{...x,saved:true}:x));setSaved(v=>v+1);
    }catch(err){setError(err?.message||"บันทึกไม่สำเร็จ");}
    finally{setBusy(false);}
  }

  if(!ready)return <main style={{padding:24}}>กำลังเปิดระบบ...</main>;
  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:16,color:"#111827"}}><div style={{maxWidth:980,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><h1 style={{margin:"0 0 4px"}}>📱 นำเข้าสลิปจากมือถือ</h1><div style={{color:"#6b7280"}}>เลือกรูปจาก Gallery หรือถ่ายรูป → OCR บนอุปกรณ์ → ตรวจข้อมูล → บันทึกเข้าบัญชีเดียวกับ LINE</div></div><button style={{...btn,background:"white",border:"1px solid #d1d5db"}} onClick={()=>router.push("/finance")}>← กลับการเงิน</button></div>

    <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      <label style={{...btn,background:"#111827",color:"white",textAlign:"center"}}>🖼️ เลือกจาก Gallery<input type="file" accept="image/*" multiple onChange={choose} disabled={busy} style={{display:"none"}}/></label>
      <label style={{...btn,background:"#2563eb",color:"white",textAlign:"center"}}>📷 ถ่ายรูปสลิป<input type="file" accept="image/*" capture="environment" onChange={choose} disabled={busy} style={{display:"none"}}/></label>
    </div>
    {busy&&<div style={{marginTop:12,padding:12,background:"#eff6ff",borderRadius:10}}>กำลังประมวลผล {progress}%</div>}
    {saved>0&&<div style={{marginTop:12,padding:12,background:"#ecfdf5",color:"#166534",borderRadius:10}}>บันทึกเข้าบัญชีแล้ว {saved} รายการ — จะแสดงรวมในหน้าการเงินและรายงานทันที</div>}
    {error&&<div style={{marginTop:12,padding:12,background:"#fef2f2",color:"#b91c1c",borderRadius:10}}>{error}</div>}

    <div style={{marginTop:16,display:"grid",gap:14}}>{items.length===0?<div style={{background:"white",padding:28,borderRadius:12,textAlign:"center",color:"#6b7280"}}>ยังไม่มีรูป — กดเลือกจาก Gallery หรือถ่ายรูปได้เลย</div>:items.map(item=><section key={item.id} style={{background:"white",borderRadius:14,padding:14,border:`2px solid ${item.direction==="income"?"#93c5fd":"#fca5a5"}`,opacity:item.saved?.72:1}}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(150px,260px) 1fr",gap:14}}>
        <img src={item.preview} alt="สลิป" style={{width:"100%",maxHeight:360,objectFit:"contain",background:"#f9fafb",borderRadius:10}}/>
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}><button disabled={item.saved} onClick={()=>change(item.id,"direction","income")} style={{...btn,background:item.direction==="income"?"#2563eb":"#dbeafe",color:item.direction==="income"?"white":"#1d4ed8"}}>รายรับ</button><button disabled={item.saved} onClick={()=>change(item.id,"direction","expense")} style={{...btn,background:item.direction==="expense"?"#dc2626":"#fee2e2",color:item.direction==="expense"?"white":"#b91c1c"}}>รายจ่าย</button></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:9}}>
            <label>จำนวนเงิน<input disabled={item.saved} type="number" step="0.01" value={item.amount} onChange={e=>change(item.id,"amount",e.target.value)} style={input}/></label>
            <label>วันที่<input disabled={item.saved} type="date" value={item.transaction_date} onChange={e=>change(item.id,"transaction_date",e.target.value)} style={input}/></label>
            <label>หมวดหมู่<select disabled={item.saved} value={item.category} onChange={e=>change(item.id,"category",e.target.value)} style={input}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>ธนาคาร<input disabled={item.saved} value={item.bank_name} onChange={e=>change(item.id,"bank_name",e.target.value)} style={input}/></label>
            <label>เลขอ้างอิง<input disabled={item.saved} value={item.reference_no} onChange={e=>change(item.id,"reference_no",e.target.value)} style={input}/></label>
            <label>คู่ค้า / ผู้โอน<input disabled={item.saved} value={item.counterparty} onChange={e=>change(item.id,"counterparty",e.target.value)} style={input}/></label>
            <label>งาน / Job<input disabled={item.saved} value={item.project_name} onChange={e=>change(item.id,"project_name",e.target.value)} style={input}/></label>
            <label>รายละเอียด<input disabled={item.saved} value={item.description} onChange={e=>change(item.id,"description",e.target.value)} style={input}/></label>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>{item.saved?<b style={{color:"#15803d"}}>✓ บันทึกแล้ว</b>:<><button disabled={busy} onClick={()=>saveOne(item)} style={{...btn,background:item.direction==="income"?"#2563eb":"#dc2626",color:"white"}}>ยืนยันและบันทึกเข้าบัญชี</button><button disabled={busy} onClick={()=>remove(item.id)} style={{...btn,background:"#f3f4f6"}}>ลบ</button></>}</div>
          {item.raw&&<details style={{marginTop:10}}><summary>ดูข้อความ OCR</summary><pre style={{whiteSpace:"pre-wrap",fontSize:11,overflowWrap:"anywhere"}}>{item.raw}</pre></details>}
        </div>
      </div>
    </section>)}</div>
    {pending.length>0&&<p style={{fontSize:13,color:"#6b7280"}}>มี {pending.length} รายการที่ยังไม่ได้บันทึก กรุณาตรวจยอดและประเภทก่อนกดยืนยัน</p>}
  </div></main>;
}
