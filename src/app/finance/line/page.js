"use client";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";
import {readSlipLocally} from "../../lib/localSlipOcr";

const INCOME=["รายได้งานป้าย","เงินมัดจำ","โอนจากลูกค้า","เงินสดรับ","อื่น ๆ"];
const EXPENSE=["ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","ค่าเช่า","ค่าโฆษณา/การตลาด","ค่าสาธารณูปโภค","ค่าโทรศัพท์/อินเทอร์เน็ต","ค่างวด/ยานพาหนะ","อื่น ๆ"];
const input={padding:"11px 12px",border:"1px solid #d1d5db",borderRadius:10,width:"100%",minWidth:0,boxSizing:"border-box",background:"#fff",fontSize:16,lineHeight:1.4};
const btn={padding:"12px 10px",borderRadius:10,fontWeight:800,fontSize:16,minHeight:48,whiteSpace:"normal",overflowWrap:"anywhere",wordBreak:"break-word",lineHeight:1.25,textAlign:"center"};

function date(v){
  if(!v)return"";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return"";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const g=t=>parts.find(x=>x.type===t)?.value||"";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function initial(r){
  const note=r.linked_note||r.message_text||"";
  const direction=r.entry_type==="income"||r.entry_type==="expense"?r.entry_type:(/รายรับ|โอนเข้า|รับเงิน/.test(note)?"income":"");
  return{
    direction,
    amount:r.amount??"",
    category:r.category||(direction==="income"?"รายได้งานป้าย":direction==="expense"?"":""),
    transaction_date:date(r.suggested_transaction_date),
    project_name:r.job_reference||"",
    counterparty:r.suggested_counterparty||"",
    bank_name:r.suggested_bank_name||"",
    reference_no:r.suggested_reference_no||"",
    description:r.suggested_description||note,
    ai_confidence:null
  };
}
function goodAmount(v){const n=Number(v);return Number.isFinite(n)&&n>0&&n<100000000;}
function categoryForDirection(old,dir){
  if(dir==="income")return INCOME.includes(old)?old:"รายได้งานป้าย";
  if(dir==="expense")return EXPENSE.includes(old)?old:"";
  return"";
}
function validCategory(v,dir){return dir==="income"?INCOME.includes(v):dir==="expense"?EXPENSE.includes(v):false;}

export default function LineFinancePage(){
  const[rows,setRows]=useState([]),[drafts,setDrafts]=useState({}),[media,setMedia]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reading,setReading]=useState(null),[progress,setProgress]=useState(0),[error,setError]=useState(""),[filter,setFilter]=useState("pending"),[raw,setRaw]=useState({}),[notice,setNotice]=useState({});

  async function load(){
    setLoading(true);setError("");
    const{data,error:e}=await supabase.from("line_account_entries").select("*").order("created_at",{ascending:false}).limit(200);
    if(e){setError(e.message);setLoading(false);return;}
    const list=(data||[]).filter(r=>!r.is_context_note);setRows(list);
    setDrafts(p=>{const n={};for(const r of list)n[r.id]=p[r.id]||initial(r);return n;});
    const signed={};
    await Promise.all(list.filter(r=>r.storage_path).map(async r=>{const{data}=await supabase.storage.from("line-account").createSignedUrl(r.storage_path,900);if(data?.signedUrl)signed[r.storage_path]=data.signedUrl;}));
    setMedia(signed);setLoading(false);
  }
  useEffect(()=>{load();},[]);

  function change(id,key,value){
    setDrafts(p=>({...p,[id]:{...p[id],[key]:value,...(key==="direction"?{category:categoryForDirection(p[id]?.category||"",value)}:{})}}));
  }

  async function analyze(r){
    setReading(r.id);setProgress(0);setError("");
    try{
      if(!r.storage_path)throw new Error("รายการนี้ไม่มีรูปสลิป");
      const{data,error:e}=await supabase.storage.from("line-account").download(r.storage_path);if(e)throw e;
      const result=await readSlipLocally(data,p=>setProgress(p));
      setRaw(p=>({...p,[r.id]:result.text}));
      setDrafts(p=>{
        const old=p[r.id]||initial(r),f=result.fields;
        const direction=f.direction||old.direction||"";
        const category=validCategory(f.category,direction)?f.category:categoryForDirection(old.category,direction);
        return{...p,[r.id]:{
          ...old,
          direction,
          amount:goodAmount(f.amount)?String(f.amount):old.amount,
          category,
          transaction_date:f.transaction_date||old.transaction_date,
          counterparty:f.counterparty||old.counterparty,
          bank_name:f.bank_name||old.bank_name,
          reference_no:f.reference_no||old.reference_no,
          description:f.description||old.description,
          ai_confidence:Number.isFinite(Number(f.confidence))?Number(f.confidence):null
        }};
      });
      const f=result.fields,missing=[];
      if(!f.direction)missing.push("ประเภท");
      if(!goodAmount(f.amount))missing.push("จำนวนเงิน");
      if(!f.transaction_date)missing.push("วันที่");
      const source=f.ai_used?`AI Vision + OCR${f.confidence!=null?` (ความมั่นใจ ${Math.round(Number(f.confidence)*100)}%)`:""}`:"OCR ในเครื่อง (AI Vision ยังไม่พร้อม)";
      setNotice(p=>({...p,[r.id]:missing.length?`${source}: ยังไม่ยืนยัน ${missing.join(" / ")} กรุณาตรวจสอบ`:`${source}: อ่านข้อมูลแล้ว กรุณาตรวจสอบก่อนบันทึก`}));
      if(!result.text.trim())setError("OCR ไม่พบข้อความ กรุณาตรวจสอบภาพและกรอกข้อมูลด้วยมือ");
    }catch(e){setError("อ่านสลิปไม่สำเร็จ: "+(e.message||"ไม่ทราบสาเหตุ"));}
    finally{setReading(null);}
  }

  async function review(r,action){
    const d=drafts[r.id]||{};
    if(action==="approve"&&(!d.direction||!goodAmount(d.amount)||!d.transaction_date)){setError("กรุณาตรวจสอบ ประเภท จำนวนเงิน และวันที่ทำรายการให้ครบก่อนบันทึก");return;}
    if(!confirm(action==="approve"?"ยืนยันว่าตรวจสอบข้อมูลบนสลิปแล้ว และบันทึกรายการเงินจริง?":"ปฏิเสธรายการนี้?"))return;
    setBusy(true);setError("");
    const{error:e}=await supabase.rpc("review_line_account_entry_v2",{p_id:r.id,p_action:action,p_direction:d.direction||null,p_amount:d.amount===""?null:Number(d.amount),p_category:d.category||null,p_description:d.description||null,p_project_name:d.project_name||null,p_transaction_date:d.transaction_date?new Date(d.transaction_date+"T12:00:00+07:00").toISOString():null,p_counterparty:d.counterparty||null,p_bank_name:d.bank_name||null,p_reference_no:d.reference_no||null,p_ai_confidence:d.ai_confidence==null?null:Number(d.ai_confidence)});
    if(e)setError(e.message);else await load();setBusy(false);
  }

  const visible=rows.filter(r=>filter==="all"||r.status===filter);
  return <main className="line-finance-page" style={{minHeight:"100vh",background:"#f4f6f8",padding:"14px 10px 90px",color:"#111827"}}>
    <style>{`
      .line-finance-page, .line-finance-page * { box-sizing: border-box; }
      .line-finance-page { overflow-x: hidden; }
      .line-finance-page label, .line-finance-page a, .line-finance-page button, .line-finance-page div, .line-finance-page strong, .line-finance-page summary { overflow-wrap: anywhere; word-break: break-word; }
      .line-finance-page input, .line-finance-page select, .line-finance-page button { max-width: 100%; }
      .line-finance-page .lf-grid > *, .line-finance-page .lf-form-grid > * { min-width: 0; }
      .line-finance-page .lf-top-nav a { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:8px 10px; border:1px solid #d1d5db; border-radius:9px; background:#fff; text-decoration:none; color:#111827; line-height:1.2; text-align:center; }
      @media (max-width: 640px) {
        .line-finance-page { padding:10px 8px 80px !important; }
        .line-finance-page .lf-shell { width:100%; max-width:100%; }
        .line-finance-page .lf-header { display:block !important; }
        .line-finance-page .lf-header h1 { font-size:23px !important; line-height:1.2; }
        .line-finance-page .lf-top-nav { display:grid !important; grid-template-columns:repeat(3,minmax(0,1fr)); width:100%; gap:6px !important; margin-top:10px; }
        .line-finance-page .lf-top-nav a { width:100%; min-width:0; font-size:13px; padding:8px 5px; }
        .line-finance-page .lf-filter { display:grid !important; grid-template-columns:minmax(0,1fr) auto; width:100%; }
        .line-finance-page .lf-filter select { width:100% !important; min-width:0; }
        .line-finance-page .lf-card { padding:10px !important; border-radius:12px !important; }
        .line-finance-page .lf-card-head { display:block !important; }
        .line-finance-page .lf-status { display:inline-flex; margin-top:8px; max-width:100%; white-space:normal; }
        .line-finance-page .lf-grid { display:block !important; }
        .line-finance-page .lf-grid > div + div { margin-top:12px; }
        .line-finance-page .lf-form-grid { display:grid !important; grid-template-columns:minmax(0,1fr) !important; gap:10px !important; }
        .line-finance-page .lf-direction-buttons { grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; }
        .line-finance-page .lf-actions { display:grid !important; grid-template-columns:minmax(0,1fr) !important; }
        .line-finance-page .lf-actions button { width:100%; }
        .line-finance-page img { max-width:100%; height:auto; }
        .line-finance-page pre { max-width:100%; overflow:auto; }
      }
      @media (max-width: 360px) {
        .line-finance-page .lf-top-nav { grid-template-columns:minmax(0,1fr); }
        .line-finance-page .lf-filter { grid-template-columns:minmax(0,1fr); }
        .line-finance-page .lf-filter button { width:100%; }
        .line-finance-page .lf-direction-buttons { grid-template-columns:minmax(0,1fr) !important; }
      }
    `}</style>
    <div className="lf-shell" style={{maxWidth:1180,margin:"auto"}}>
    <div className="lf-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <div style={{minWidth:0}}><h1 style={{margin:"0 0 4px",fontSize:28}}>💬 บัญชีจาก LINE</h1><div style={{color:"#6b7280"}}>อ่านสลิปด้วย OCR + AI Vision และตรวจสอบก่อนบันทึกเงินจริง</div></div>
      <div className="lf-top-nav" style={{display:"flex",gap:8,flexWrap:"wrap"}}><a href="/finance">การเงิน</a><a href="/finance/reports">📊 รายงาน</a><a href="/finance/categories">🏷️ หมวดหมู่</a></div>
    </div>
    <div className="lf-filter" style={{display:"flex",gap:8,margin:"12px 0 16px",flexWrap:"wrap"}}><select style={{...input,width:190}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">รอตรวจสอบ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="all">ทั้งหมด</option></select><button onClick={load} disabled={loading} style={{...btn,border:"1px solid #d1d5db",background:"white"}}>รีเฟรช</button></div>
    {error&&<div role="alert" style={{color:"#b91c1c",padding:12,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,marginBottom:12}}>{error}</div>}
    {loading?<p>กำลังโหลด...</p>:visible.length===0?<div style={{background:"white",padding:28,borderRadius:12,textAlign:"center"}}>ไม่มีรายการ</div>:visible.map(r=>{
      const d=drafts[r.id]||initial(r),known=d.direction==="income"||d.direction==="expense",isIncome=d.direction==="income";
      const accent=!known?"#64748b":isIncome?"#0b6cff":"#e11d48",soft=!known?"#f1f5f9":isIncome?"#eff6ff":"#fff1f2",cats=isIncome?INCOME:d.direction==="expense"?EXPENSE:[];
      return <section className="lf-card" key={r.id} style={{background:"white",border:`1px solid ${!known?"#cbd5e1":isIncome?"#bfdbfe":"#fecdd3"}`,borderRadius:16,padding:14,marginBottom:14,boxShadow:"0 2px 8px rgba(15,23,42,.05)"}}>
        <div className="lf-card-head" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><div style={{minWidth:0}}><strong>{r.message_type==="text"?"ข้อความ LINE":"สลิป / หลักฐานจาก LINE"}</strong><div style={{fontSize:12,color:"#6b7280",marginTop:3}}>{new Date(r.event_at||r.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})} • {r.status}</div></div><div className="lf-status" style={{fontWeight:800,color:accent,background:soft,padding:"8px 12px",borderRadius:999}}>{!known?"⚠ ยังไม่ทราบประเภท":isIncome?"↑ รายรับ":"↓ รายจ่าย"}</div></div>
        <div className="lf-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:16,marginTop:12}}>
          <div style={{minWidth:0}}>{r.storage_path&&media[r.storage_path]&&r.mime_type?.startsWith("image/")?<img src={media[r.storage_path]} alt="สลิปจาก LINE" style={{width:"100%",maxHeight:520,objectFit:"contain",borderRadius:10,background:"#f9fafb"}}/>:<div style={{padding:20,background:"#f9fafb",borderRadius:10}}>ไม่มีรูปสลิป</div>}{r.linked_note&&<p style={{fontSize:13,overflowWrap:"anywhere"}}><b>คำอธิบาย:</b> {r.linked_note}</p>}</div>
          <div style={{minWidth:0}}>{r.status==="pending"?<>
            <button disabled={!!reading||!r.storage_path||!r.mime_type?.startsWith("image/")} onClick={()=>analyze(r)} style={{...btn,background:"#0f172a",color:"white",border:0,width:"100%"}}>{reading===r.id?`กำลังอ่าน ${progress}%`:"อ่านสลิปด้วย OCR + AI"}</button>
            {notice[r.id]&&<div style={{marginTop:8,padding:10,borderRadius:9,background:notice[r.id].includes("ยังไม่")?"#fff7ed":"#ecfdf5",color:notice[r.id].includes("ยังไม่")?"#9a3412":"#166534",fontSize:13}}>{notice[r.id]}</div>}
            {raw[r.id]&&<details style={{marginTop:8}}><summary>ดูข้อความที่ OCR อ่านได้</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12,background:"#f8fafc",padding:10,borderRadius:8}}>{raw[r.id]}</pre></details>}
            <div className="lf-form-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:10,marginTop:12}}>
              <label style={{fontWeight:700,minWidth:0}}>ประเภท<div className="lf-direction-buttons" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:5}}><button type="button" onClick={()=>change(r.id,"direction","income")} style={{...btn,border:d.direction==="income"?"2px solid #0b6cff":"1px solid #d1d5db",background:d.direction==="income"?"#0b6cff":"white",color:d.direction==="income"?"white":"#111827"}}>↑ รายรับ</button><button type="button" onClick={()=>change(r.id,"direction","expense")} style={{...btn,border:d.direction==="expense"?"2px solid #e11d48":"1px solid #d1d5db",background:d.direction==="expense"?"#e11d48":"white",color:d.direction==="expense"?"white":"#111827"}}>↓ รายจ่าย</button></div></label>
              <label style={{fontWeight:700,minWidth:0}}>จำนวนเงิน<input style={{...input,marginTop:5,fontWeight:900,fontSize:22,color:accent}} type="number" step="0.01" value={d.amount??""} onChange={e=>change(r.id,"amount",e.target.value)}/></label>
              <label style={{minWidth:0}}>หมวดหมู่<select style={{...input,marginTop:5}} value={d.category||""} disabled={!known} onChange={e=>change(r.id,"category",e.target.value)}><option value="">เลือกหมวดหมู่</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
              <label style={{minWidth:0}}>วันที่ทำรายการ<input style={{...input,marginTop:5}} type="date" value={d.transaction_date||""} onChange={e=>change(r.id,"transaction_date",e.target.value)}/></label>
              <label style={{minWidth:0}}>งาน / Job<input style={{...input,marginTop:5}} value={d.project_name||""} onChange={e=>change(r.id,"project_name",e.target.value)}/></label>
              <label style={{minWidth:0}}>คู่ค้า / ผู้โอน<input style={{...input,marginTop:5}} value={d.counterparty||""} onChange={e=>change(r.id,"counterparty",e.target.value)}/></label>
              <label style={{minWidth:0}}>ธนาคาร<input style={{...input,marginTop:5}} value={d.bank_name||""} onChange={e=>change(r.id,"bank_name",e.target.value)}/></label>
              <label style={{minWidth:0}}>เลขอ้างอิง<input style={{...input,marginTop:5}} value={d.reference_no||""} onChange={e=>change(r.id,"reference_no",e.target.value)}/></label>
              <label style={{gridColumn:"1/-1",minWidth:0}}>รายละเอียด<input style={{...input,marginTop:5}} value={d.description||""} onChange={e=>change(r.id,"description",e.target.value)}/></label>
            </div>
            <div className="lf-actions" style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}><button disabled={busy||!known||!goodAmount(d.amount)||!d.transaction_date} onClick={()=>review(r,"approve")} style={{...btn,border:0,background:known?"#16a34a":"#94a3b8",color:"white",flex:"1 1 180px"}}>ยืนยันและบันทึก</button><button disabled={busy} onClick={()=>review(r,"reject")} style={{...btn,border:"1px solid #d1d5db",background:"white",flex:"1 1 120px"}}>ปฏิเสธ</button></div>
          </>:<div style={{padding:12,background:"#f8fafc",borderRadius:10}}>รายการนี้ตรวจสอบแล้ว</div>}</div>
        </div>
      </section>;
    })}
  </div></main>;
}
