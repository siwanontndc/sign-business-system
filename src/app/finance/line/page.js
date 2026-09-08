"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const CATEGORIES=["รายได้งานป้าย","เงินมัดจำ","ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","อื่น ๆ"];
const input={padding:10,border:"1px solid #d1d5db",borderRadius:8,width:"100%",boxSizing:"border-box"};

function toLocalDate(v){
  if(!v) return "";
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function fallbackFromText(text=""){
  const t=String(text).replace(/\s+/g," ").trim();
  const direction=/รายรับ|โอนเข้า|รับเงิน|ยอดเข้า/.test(t)?"income":/รายจ่าย|โอนออก|จ่าย|ซื้อ|ชำระ|ค่าน้ำมัน|ค่าแรง|ค่าวัสดุ|ค่าสี|ค่าไฟ/.test(t)?"expense":"";
  let category="อื่น ๆ";
  if(direction==="income") category=/มัดจำ/.test(t)?"เงินมัดจำ":"รายได้งานป้าย";
  if(direction==="expense") category=/น้ำมัน|เดินทาง/.test(t)?"ค่าน้ำมัน/เดินทาง":/ค่าแรง/.test(t)?"ค่าแรง":/สี|ไฟ|วัสดุ/.test(t)?"ค่าวัสดุ":"อื่น ๆ";
  return {direction,category,amount:"",transaction_date:"",project_name:"",counterparty:"",bank_name:"",reference_no:"",description:text,ai_confidence:null};
}

export default function LineFinancePage(){
  const [rows,setRows]=useState([]);
  const [drafts,setDrafts]=useState({});
  const [media,setMedia]=useState({});
  const [loading,setLoading]=useState(true);
  const [analyzing,setAnalyzing]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("pending");

  async function load(){
    setLoading(true);
    const {data,error}=await supabase.from("line_account_entries").select("*").order("created_at",{ascending:false}).limit(200);
    if(error){setError(error.message);setLoading(false);return;}
    const list=data||[];
    setRows(list);
    const nextDrafts={};
    for(const x of list){
      const f=fallbackFromText(x.linked_note||x.message_text||"");
      nextDrafts[x.id]={
        ...f,
        direction:x.entry_type||f.direction,
        amount:x.amount??"",
        category:x.category||f.category,
        transaction_date:toLocalDate(x.suggested_transaction_date),
        project_name:x.job_reference||"",
        counterparty:x.suggested_counterparty||"",
        bank_name:x.suggested_bank_name||"",
        reference_no:x.suggested_reference_no||"",
        description:x.suggested_description||x.linked_note||x.message_text||"",
        ai_confidence:x.ai_confidence??null,
      };
    }
    setDrafts(nextDrafts);
    const signed={};
    await Promise.all(list.filter(x=>x.storage_path).map(async x=>{
      const {data}=await supabase.storage.from("line-account").createSignedUrl(x.storage_path,900);
      if(data?.signedUrl) signed[x.storage_path]=data.signedUrl;
    }));
    setMedia(signed);
    setLoading(false);
  }

  useEffect(()=>{load();},[]);

  function change(id,key,value){setDrafts(p=>({...p,[id]:{...p[id],[key]:value}}));}

  async function analyze(row){
    setAnalyzing(row.id);
    setError("");
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),45000);
      let response;
      try{
        response=await fetch("https://ddhcazbnrzxqotplzdvh.supabase.co/functions/v1/finance-line-analyze",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${session.access_token}`,
          },
          body:JSON.stringify({id:row.id}),
          signal:controller.signal,
        });
      } finally { clearTimeout(timer); }
      const text=await response.text();
      let payload={};
      try{payload=JSON.parse(text);}catch{payload={error:text};}
      if(!response.ok) throw new Error(payload.error||`HTTP ${response.status}`);
      if(payload.error) throw new Error(payload.error);
      await load();
    }catch(e){
      const msg=e?.name==="AbortError"?"AI ใช้เวลานานเกิน 45 วินาที":e?.message||"AI วิเคราะห์ไม่สำเร็จ";
      setError(`อ่านสลิปไม่สำเร็จ: ${msg}`);
    }finally{setAnalyzing(null);}
  }

  async function review(row,action){
    if(action==="approve"&&!confirm("ยืนยันบันทึกรายการเงินจริง?")) return;
    if(action==="reject"&&!confirm("ปฏิเสธรายการนี้?")) return;
    setBusy(true);setError("");
    const d=drafts[row.id]||{};
    const {error}=await supabase.rpc("review_line_account_entry_v2",{
      p_id:row.id,p_action:action,p_direction:d.direction||null,p_amount:d.amount===""?null:Number(d.amount),p_category:d.category||null,p_description:d.description||null,p_project_name:d.project_name||null,p_transaction_date:d.transaction_date?new Date(d.transaction_date+"T12:00:00+07:00").toISOString():null,p_counterparty:d.counterparty||null,p_bank_name:d.bank_name||null,p_reference_no:d.reference_no||null,p_ai_confidence:d.ai_confidence==null?null:Number(d.ai_confidence)
    });
    if(error)setError(error.message);else await load();
    setBusy(false);
  }

  const visible=useMemo(()=>rows.filter(x=>filter==="all"||x.status===filter),[rows,filter]);
  const counts=useMemo(()=>({pending:rows.filter(x=>x.status==="pending").length,approved:rows.filter(x=>x.status==="approved").length,rejected:rows.filter(x=>x.status==="rejected").length,analyzed:rows.filter(x=>x.analyzed_at).length}),[rows]);

  return <main style={{padding:24,maxWidth:1240,margin:"auto",color:"#111827"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><h1 style={{marginBottom:4}}>บัญชีจาก LINE</h1><p style={{marginTop:0,color:"#6b7280"}}>อ่านสลิปด้วย AI จาก Supabase โดยตรง แล้วตรวจแก้ก่อนบันทึกเงินจริง</p></div>
      <a href="/finance">← กลับหน้าการเงิน</a>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,margin:"16px 0"}}>
      <Stat label="รอตรวจสอบ" value={counts.pending}/><Stat label="AI วิเคราะห์แล้ว" value={counts.analyzed}/><Stat label="อนุมัติแล้ว" value={counts.approved}/><Stat label="ปฏิเสธ" value={counts.rejected}/>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={{...input,width:190}}><option value="pending">รอตรวจสอบ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="all">ทั้งหมด</option></select>
      <button onClick={load} disabled={loading}>รีเฟรช</button>
      {analyzing&&<span style={{padding:"8px 0",color:"#6b7280"}}>AI กำลังอ่านยอด วันที่ ธนาคาร และเลขอ้างอิง...</span>}
    </div>

    {error&&<p style={{color:"#b91c1c",background:"#fef2f2",padding:12,borderRadius:8,fontWeight:700}}>{error}</p>}

    {loading?<p>กำลังโหลด...</p>:visible.length===0?<p>ไม่มีรายการในสถานะนี้</p>:visible.map(row=>{
      const d=drafts[row.id]||fallbackFromText(row.linked_note||row.message_text||"");
      const url=row.storage_path?media[row.storage_path]:null;
      const test=/ทดสอบ\s*\d*/i.test(row.message_text||"");
      return <section key={row.id} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:16,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong>{row.message_type==="text"?"ข้อความ LINE":"สลิป / หลักฐานจาก LINE"}</strong><span>{row.status}{row.analyzed_at?" · AI วิเคราะห์แล้ว":""}</span></div>
        {row.linked_note&&<p style={{background:"#f3f4f6",padding:10,borderRadius:8}}><b>คำอธิบายจาก LINE:</b> {row.linked_note}</p>}
        {url&&row.mime_type?.startsWith("image/")&&<img src={url} alt="สลิปจาก LINE" style={{maxWidth:360,width:"100%",maxHeight:430,objectFit:"contain",borderRadius:8,border:"1px solid #e5e7eb"}}/>}
        <div style={{marginTop:6}}><small>{new Date(row.event_at||row.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></div>
        {row.status==="pending"&&<>
          <div style={{marginTop:12}}><button onClick={()=>analyze(row)} disabled={analyzing===row.id||test} style={{padding:"10px 14px",background:"#111827",color:"white",border:0,borderRadius:8}}>{analyzing===row.id?"กำลังอ่านสลิป...":"อ่านสลิปด้วย AI"}</button>{d.ai_confidence!=null&&<span style={{marginLeft:10,color:"#6b7280"}}>ความมั่นใจ {Math.round(Number(d.ai_confidence)*100)}%</span>}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12}}>
            <label>ประเภท<select style={input} value={d.direction} onChange={e=>change(row.id,"direction",e.target.value)}><option value="">เลือกประเภท</option><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></label>
            <label>จำนวนเงิน<input style={input} type="number" step="0.01" value={d.amount} onChange={e=>change(row.id,"amount",e.target.value)}/></label>
            <label>หมวดหมู่<select style={input} value={d.category} onChange={e=>change(row.id,"category",e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>วันที่ทำรายการ<input style={input} type="date" value={d.transaction_date} onChange={e=>change(row.id,"transaction_date",e.target.value)}/></label>
            <label>งาน / Job<input style={input} value={d.project_name} onChange={e=>change(row.id,"project_name",e.target.value)}/></label>
            <label>คู่ค้า / ผู้โอน<input style={input} value={d.counterparty} onChange={e=>change(row.id,"counterparty",e.target.value)}/></label>
            <label>ธนาคาร<input style={input} value={d.bank_name} onChange={e=>change(row.id,"bank_name",e.target.value)}/></label>
            <label>เลขอ้างอิง<input style={input} value={d.reference_no} onChange={e=>change(row.id,"reference_no",e.target.value)}/></label>
            <label style={{gridColumn:"1/-1"}}>รายละเอียด<input style={input} value={d.description} onChange={e=>change(row.id,"description",e.target.value)}/></label>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}><button disabled={busy||test||!d.direction||!(Number(d.amount)>0)} onClick={()=>review(row,"approve")} style={{padding:"10px 16px",background:"#15803d",color:"white",border:0,borderRadius:8}}>อนุมัติและบันทึกเงินจริง</button><button disabled={busy} onClick={()=>review(row,"reject")} style={{padding:"10px 16px"}}>ปฏิเสธ</button></div>
        </>}
      </section>;
    })}
  </main>;
}

function Stat({label,value}){return <div style={{background:"white",border:"1px solid #e5e7eb",borderRadius:10,padding:14}}><div style={{fontSize:13,color:"#6b7280"}}>{label}</div><div style={{fontSize:26,fontWeight:800}}>{value}</div></div>}
