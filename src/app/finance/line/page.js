"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const categories=["รายได้งานป้าย","เงินมัดจำ","ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","อื่น ๆ"];

function parse(text=""){
  const t=text.replace(/\s+/g," ").trim();
  const direction=/รายรับ|โอนเข้า|รับเงิน|ยอดเข้า/.test(t)?"income":/รายจ่าย|โอนออก|จ่าย|ซื้อ|ค่าวัสดุ|ค่าแรง|ค่าน้ำมัน/.test(t)?"expense":"";
  const near=t.match(/(?:รายรับ|รายจ่าย|โอนเข้า|โอนออก|รับเงิน|ยอดเข้า|จ่าย|ซื้อ|ค่าวัสดุ|ค่าแรง|ค่าน้ำมัน)[^\d]{0,30}([\d,]+(?:\.\d{1,2})?)/);
  const any=t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)/);
  let category="อื่น ๆ";
  if(direction==="income") category=/มัดจำ/.test(t)?"เงินมัดจำ":"รายได้งานป้าย";
  if(direction==="expense") category=/วัสดุ/.test(t)?"ค่าวัสดุ":/ค่าแรง/.test(t)?"ค่าแรง":/น้ำมัน|เดินทาง/.test(t)?"ค่าน้ำมัน/เดินทาง":"อื่น ๆ";
  return {direction,amount:(near?.[1]||any?.[1]||"").replaceAll(",",""),category,description:text,project_name:"",transaction_date:""};
}

export default function LineFinancePage(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("pending");
  const [drafts,setDrafts]=useState({});
  const [media,setMedia]=useState({});

  async function load(){
    setLoading(true); setError("");
    const {data,error}=await supabase.from("line_account_entries").select("*").order("created_at",{ascending:false}).limit(200);
    if(error){setError(error.message);setLoading(false);return;}
    const list=data||[];
    setRows(list);
    setDrafts(Object.fromEntries(list.map(x=>{
      const p=parse(x.message_text||"");
      return [x.id,{...p,direction:x.entry_type||p.direction,amount:x.amount??p.amount,category:x.category||p.category,project_name:x.job_reference||""}];
    })));
    const paths=list.filter(x=>x.storage_path).map(x=>x.storage_path);
    if(paths.length){
      const signed={};
      await Promise.all(paths.map(async path=>{
        const {data}=await supabase.storage.from("line-account").createSignedUrl(path,600);
        if(data?.signedUrl) signed[path]=data.signedUrl;
      }));
      setMedia(signed);
    } else setMedia({});
    setLoading(false);
  }

  useEffect(()=>{load();},[]);
  function change(id,key,value){setDrafts(p=>({...p,[id]:{...p[id],[key]:value}}));}

  async function review(row,action){
    if(!confirm(action==="reject"?"ปฏิเสธรายการนี้?":"ยืนยันบันทึกรายการเงินจริง?"))return;
    setBusy(true); setError("");
    const d=drafts[row.id]||{};
    const {error}=await supabase.rpc("review_line_account_entry",{
      p_id:row.id,p_action:action,p_direction:d.direction||null,p_amount:d.amount===""?null:Number(d.amount),p_category:d.category||null,p_description:d.description||null,p_project_name:d.project_name||null,p_transaction_date:d.transaction_date?new Date(d.transaction_date+"T12:00:00+07:00").toISOString():null
    });
    if(error)setError(error.message); else await load();
    setBusy(false);
  }

  const visible=useMemo(()=>rows.filter(x=>filter==="all"||x.status===filter),[rows,filter]);
  const counts=useMemo(()=>({pending:rows.filter(x=>x.status==="pending").length,approved:rows.filter(x=>x.status==="approved").length,rejected:rows.filter(x=>x.status==="rejected").length}),[rows]);
  const input={padding:9,border:"1px solid #d1d5db",borderRadius:7,width:"100%",boxSizing:"border-box",fontSize:14};

  return <main style={{padding:24,maxWidth:1200,margin:"auto",color:"#111827"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h1 style={{marginBottom:4}}>บัญชีจาก LINE</h1><p style={{marginTop:0,color:"#6b7280"}}>ตรวจสอบข้อความและหลักฐานก่อนบันทึกเป็นรายรับรายจ่ายจริง</p></div><a href="/finance">← กลับหน้าการเงิน</a></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,margin:"16px 0"}}><Stat label="รอตรวจสอบ" value={counts.pending}/><Stat label="อนุมัติแล้ว" value={counts.approved}/><Stat label="ปฏิเสธ" value={counts.rejected}/></div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><select style={{...input,width:190}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">รอตรวจสอบ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="all">ทั้งหมด</option></select><button onClick={load} disabled={loading}>รีเฟรช</button></div>
    {error&&<p role="alert" style={{color:"#b91c1c",background:"#fef2f2",padding:12,borderRadius:8}}>{error}</p>}
    {loading?<p>กำลังโหลด...</p>:visible.length===0?<p>ไม่มีรายการในสถานะนี้</p>:visible.map(row=>{
      const d=drafts[row.id]||parse(row.message_text||"");
      const test=/ทดสอบ\s*\d*/i.test(row.message_text||"");
      const url=row.storage_path?media[row.storage_path]:null;
      return <section key={row.id} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong>{row.message_type==="text"?"ข้อความ LINE":"หลักฐาน "+row.message_type}</strong><span>{row.status}</span></div>
        <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{row.message_text||"ไฟล์แนบจาก LINE"}</p>
        {url&&row.mime_type?.startsWith("image/")&&<a href={url} target="_blank" rel="noreferrer"><img src={url} alt="หลักฐานจาก LINE" style={{maxWidth:360,width:"100%",maxHeight:420,objectFit:"contain",borderRadius:8,border:"1px solid #e5e7eb"}}/></a>}
        {url&&row.mime_type==="application/pdf"&&<p><a href={url} target="_blank" rel="noreferrer">เปิดไฟล์ PDF หลักฐาน</a></p>}
        {!url&&row.storage_path&&<p style={{color:"#6b7280"}}>มีไฟล์หลักฐาน แต่ไม่สามารถสร้างลิงก์ดูได้</p>}
        <div><small>{new Date(row.event_at||row.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></div>
        {test&&<p style={{color:"#b45309",fontWeight:700}}>ข้อความทดสอบ — ระบบจะไม่อนุญาตให้บันทึกเป็นเงินจริง</p>}
        {row.status==="pending"&&<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12}}>
          <label>ประเภท<select style={input} value={d.direction} onChange={e=>change(row.id,"direction",e.target.value)}><option value="">เลือกประเภท</option><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></label>
          <label>จำนวนเงิน<input style={input} type="number" min="0.01" step="0.01" value={d.amount} onChange={e=>change(row.id,"amount",e.target.value)}/></label>
          <label>หมวดหมู่<select style={input} value={d.category} onChange={e=>change(row.id,"category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>วันที่ทำรายการ<input style={input} type="date" value={d.transaction_date} onChange={e=>change(row.id,"transaction_date",e.target.value)}/></label>
          <label>งาน / Job<input style={input} value={d.project_name} onChange={e=>change(row.id,"project_name",e.target.value)} placeholder="เช่น ป้ายหน้าร้าน ABC"/></label>
          <label>รายละเอียด<input style={input} value={d.description} onChange={e=>change(row.id,"description",e.target.value)}/></label>
        </div><div style={{display:"flex",gap:8,marginTop:14}}><button disabled={busy||test||!d.direction||!(Number(d.amount)>0)} onClick={()=>review(row,"approve")} style={{padding:"10px 16px",background:"#15803d",color:"white",border:0,borderRadius:7,opacity:busy||test?0.5:1}}>อนุมัติ</button><button disabled={busy} onClick={()=>review(row,"reject")} style={{padding:"10px 16px"}}>ปฏิเสธ</button></div></>}
      </section>;
    })}
  </main>;
}

function Stat({label,value}){return <div style={{background:"white",border:"1px solid #e5e7eb",borderRadius:10,padding:14}}><div style={{fontSize:13,color:"#6b7280"}}>{label}</div><div style={{fontSize:26,fontWeight:800}}>{value}</div></div>}
