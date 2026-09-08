"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const categories=["รายได้งานป้าย","เงินมัดจำ","ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","อื่น ๆ"];
function localDate(v){if(!v)return "";const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const z=new Date(d.toLocaleString("en-US",{timeZone:"Asia/Bangkok"}));return `${z.getFullYear()}-${String(z.getMonth()+1).padStart(2,"0")}-${String(z.getDate()).padStart(2,"0")}`;}
function parse(text=""){
  const t=text.replace(/\s+/g," ").trim();
  const direction=/รายรับ|โอนเข้า|รับเงิน|ยอดเข้า/.test(t)?"income":/รายจ่าย|โอนออก|จ่าย|ซื้อ|ค่าวัสดุ|ค่าแรง|ค่าน้ำมัน|ค่าสี|ค่าไฟ/.test(t)?"expense":"";
  const near=t.match(/(?:รายรับ|รายจ่าย|โอนเข้า|โอนออก|รับเงิน|ยอดเข้า|จ่าย|ซื้อ|ค่าวัสดุ|ค่าแรง|ค่าน้ำมัน)[^\d]{0,30}([\d,]+(?:\.\d{1,2})?)/);
  const any=t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)/);
  let category="อื่น ๆ";
  if(direction==="income") category=/มัดจำ/.test(t)?"เงินมัดจำ":"รายได้งานป้าย";
  if(direction==="expense") category=/วัสดุ|สี|ไฟ/.test(t)?"ค่าวัสดุ":/ค่าแรง/.test(t)?"ค่าแรง":/น้ำมัน|เดินทาง/.test(t)?"ค่าน้ำมัน/เดินทาง":"อื่น ๆ";
  return {direction,amount:(near?.[1]||any?.[1]||"").replaceAll(",",""),category,description:text,project_name:"",transaction_date:"",counterparty:"",bank_name:"",reference_no:"",ai_confidence:null};
}

export default function LineFinancePage(){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[analyzing,setAnalyzing]=useState(null),[error,setError]=useState(""),[filter,setFilter]=useState("pending"),[drafts,setDrafts]=useState({}),[media,setMedia]=useState({});
  const attempted=useRef(new Set());

  async function load(){
    setLoading(true);
    const {data,error}=await supabase.from("line_account_entries").select("*").order("created_at",{ascending:false}).limit(200);
    if(error){setError(error.message);setLoading(false);return;}
    const list=data||[];setRows(list);
    setDrafts(Object.fromEntries(list.map(x=>{const p=parse(x.linked_note||x.message_text||"");return [x.id,{...p,direction:x.entry_type||p.direction,amount:x.amount??p.amount,category:x.category||p.category,project_name:x.job_reference||"",description:x.suggested_description||x.linked_note||p.description,transaction_date:localDate(x.suggested_transaction_date),counterparty:x.suggested_counterparty||"",bank_name:x.suggested_bank_name||"",reference_no:x.suggested_reference_no||"",ai_confidence:x.ai_confidence??null}]})));
    const signed={};
    await Promise.all(list.filter(x=>x.storage_path).map(async x=>{const {data}=await supabase.storage.from("line-account").createSignedUrl(x.storage_path,600);if(data?.signedUrl)signed[x.storage_path]=data.signedUrl;}));
    setMedia(signed);setLoading(false);
  }

  useEffect(()=>{load();},[]);
  function change(id,key,value){setDrafts(p=>({...p,[id]:{...p[id],[key]:value}}));}

  async function analyzeViaVercel(row,session){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),35000);
    try{
      const res=await fetch("/api/finance/line-analyze",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({id:row.id})});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(payload.error||`Server ${res.status}`);
      if(payload?.error)throw new Error(payload.error);
      return payload;
    }catch(e){
      if(e?.name==="AbortError")throw new Error("AI ใช้เวลานานเกิน 35 วินาที");
      throw e;
    }finally{clearTimeout(timer);}
  }

  async function analyze(row,{silent=false}={}){
    setAnalyzing(row.id);if(!silent)setError("");
    try{
      if(!row.mime_type?.startsWith("image/")) throw new Error("AI อ่านอัตโนมัติใช้กับรูปสลิปเท่านั้น");
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error("กรุณาเข้าสู่ระบบใหม่");
      let firstError=null;
      try{
        await analyzeViaVercel(row,session);
      }catch(e){
        firstError=e;
        const edge=await Promise.race([
          supabase.functions.invoke("finance-line-analyze",{body:{id:row.id}}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("Supabase AI timeout")),20000))
        ]);
        if(edge?.error)throw new Error(`${firstError?.message||"Vercel AI ล้มเหลว"} / ${edge.error.message||"Supabase AI ล้มเหลว"}`);
        if(edge?.data?.error)throw new Error(`${firstError?.message||"Vercel AI ล้มเหลว"} / ${edge.data.error}`);
      }
      setError("");
      await load();
    }catch(e){setError(`อ่านสลิปไม่สำเร็จ: ${e.message||"AI วิเคราะห์ไม่สำเร็จ"}`);}finally{setAnalyzing(null);}
  }

  useEffect(()=>{
    if(loading||analyzing)return;
    const next=rows.find(x=>x.status==="pending"&&!x.analyzed_at&&!attempted.current.has(x.id)&&x.mime_type?.startsWith("image/"));
    if(next){attempted.current.add(next.id);analyze(next,{silent:true});}
  },[rows,loading,analyzing]);

  async function review(row,action){
    if(!confirm(action==="reject"?"ปฏิเสธรายการนี้?":"ยืนยันบันทึกรายการเงินจริง?"))return;
    setBusy(true);setError("");const d=drafts[row.id]||{};
    const {error}=await supabase.rpc("review_line_account_entry_v2",{p_id:row.id,p_action:action,p_direction:d.direction||null,p_amount:d.amount===""?null:Number(d.amount),p_category:d.category||null,p_description:d.description||null,p_project_name:d.project_name||null,p_transaction_date:d.transaction_date?new Date(d.transaction_date+"T12:00:00+07:00").toISOString():null,p_counterparty:d.counterparty||null,p_bank_name:d.bank_name||null,p_reference_no:d.reference_no||null,p_ai_confidence:d.ai_confidence==null?null:Number(d.ai_confidence)});
    if(error)setError(error.message);else await load();setBusy(false);
  }

  const visible=useMemo(()=>rows.filter(x=>filter==="all"||x.status===filter),[rows,filter]);
  const counts=useMemo(()=>({pending:rows.filter(x=>x.status==="pending").length,approved:rows.filter(x=>x.status==="approved").length,rejected:rows.filter(x=>x.status==="rejected").length,analyzed:rows.filter(x=>x.analyzed_at).length}),[rows]);
  const input={padding:9,border:"1px solid #d1d5db",borderRadius:7,width:"100%",boxSizing:"border-box",fontSize:14};

  return <main style={{padding:24,maxWidth:1240,margin:"auto",color:"#111827"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h1 style={{marginBottom:4}}>บัญชีจาก LINE</h1><p style={{marginTop:0,color:"#6b7280"}}>สลิปใหม่จะถูกอ่านด้วย AI อัตโนมัติ แล้วให้ตรวจแก้ก่อนบันทึกเงินจริง</p></div><a href="/finance">← กลับหน้าการเงิน</a></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,margin:"16px 0"}}><Stat label="รอตรวจสอบ" value={counts.pending}/><Stat label="AI วิเคราะห์แล้ว" value={counts.analyzed}/><Stat label="อนุมัติแล้ว" value={counts.approved}/><Stat label="ปฏิเสธ" value={counts.rejected}/></div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><select style={{...input,width:190}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">รอตรวจสอบ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option><option value="all">ทั้งหมด</option></select><button onClick={load} disabled={loading}>รีเฟรช</button>{analyzing&&<span style={{padding:"8px 0",color:"#6b7280"}}>AI กำลังอ่านยอด วันที่ ธนาคาร และเลขอ้างอิง...</span>}</div>
    {error&&<p role="alert" style={{color:"#b91c1c",background:"#fef2f2",padding:12,borderRadius:8,fontWeight:700}}>{error}</p>}
    {loading?<p>กำลังโหลด...</p>:visible.length===0?<p>ไม่มีรายการในสถานะนี้</p>:visible.map(row=>{
      const d=drafts[row.id]||parse(row.linked_note||row.message_text||"");const test=/ทดสอบ\s*\d*/i.test(row.message_text||"");const url=row.storage_path?media[row.storage_path]:null;const canAnalyze=!test&&row.status==="pending"&&row.mime_type?.startsWith("image/");
      return <section key={row.id} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong>{row.message_type==="text"?"ข้อความ LINE":"สลิป / หลักฐานจาก LINE"}</strong><span>{row.status}{row.analyzed_at?" · AI วิเคราะห์แล้ว":""}</span></div>
        {row.linked_note&&<p style={{background:"#f3f4f6",padding:10,borderRadius:8}}><b>คำอธิบายจาก LINE:</b> {row.linked_note}</p>}
        {row.message_text&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{row.message_text}</p>}
        {url&&row.mime_type?.startsWith("image/")&&<a href={url} target="_blank" rel="noreferrer"><img src={url} alt="หลักฐานจาก LINE" style={{maxWidth:360,width:"100%",maxHeight:420,objectFit:"contain",borderRadius:8,border:"1px solid #e5e7eb"}}/></a>}
        {url&&row.mime_type==="application/pdf"&&<p><a href={url} target="_blank" rel="noreferrer">เปิดไฟล์ PDF หลักฐาน</a></p>}
        <div><small>{new Date(row.event_at||row.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></div>
        {test&&<p style={{color:"#b45309",fontWeight:700}}>ข้อความทดสอบ — ระบบล็อกไม่ให้บันทึกเป็นเงินจริง</p>}
        {row.status==="pending"&&<>
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>{canAnalyze&&<button onClick={()=>analyze(row)} disabled={analyzing===row.id} style={{padding:"9px 14px",background:"#111827",color:"white",border:0,borderRadius:7}}>{analyzing===row.id?"กำลังอ่านสลิป...":row.analyzed_at?"อ่านสลิปใหม่ด้วย AI":"อ่านสลิปด้วย AI"}</button>}{row.ai_confidence!=null&&<span style={{padding:"9px 0",color:"#6b7280"}}>ความมั่นใจ AI {Math.round(Number(row.ai_confidence)*100)}%</span>}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12}}>
            <label>ประเภท<select style={input} value={d.direction} onChange={e=>change(row.id,"direction",e.target.value)}><option value="">เลือกประเภท</option><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></label>
            <label>จำนวนเงิน<input style={input} type="number" min="0.01" step="0.01" value={d.amount} onChange={e=>change(row.id,"amount",e.target.value)}/></label>
            <label>หมวดหมู่<select style={input} value={d.category} onChange={e=>change(row.id,"category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>วันที่ทำรายการ<input style={input} type="date" value={d.transaction_date} onChange={e=>change(row.id,"transaction_date",e.target.value)}/></label>
            <label>งาน / Job<input style={input} value={d.project_name} onChange={e=>change(row.id,"project_name",e.target.value)} placeholder="เช่น ป้ายหน้าร้าน ABC"/></label>
            <label>คู่ค้า / ผู้โอน<input style={input} value={d.counterparty} onChange={e=>change(row.id,"counterparty",e.target.value)}/></label>
            <label>ธนาคาร<input style={input} value={d.bank_name} onChange={e=>change(row.id,"bank_name",e.target.value)}/></label>
            <label>เลขอ้างอิง<input style={input} value={d.reference_no} onChange={e=>change(row.id,"reference_no",e.target.value)}/></label>
            <label style={{gridColumn:"1/-1"}}>รายละเอียด<input style={input} value={d.description} onChange={e=>change(row.id,"description",e.target.value)}/></label>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}><button disabled={busy||test||!d.direction||!(Number(d.amount)>0)} onClick={()=>review(row,"approve")} style={{padding:"10px 16px",background:"#15803d",color:"white",border:0,borderRadius:7,opacity:busy||test?0.5:1}}>อนุมัติและบันทึกเงินจริง</button><button disabled={busy} onClick={()=>review(row,"reject")} style={{padding:"10px 16px"}}>ปฏิเสธ</button></div>
        </>}
      </section>;
    })}
  </main>;
}
function Stat({label,value}){return <div style={{background:"white",border:"1px solid #e5e7eb",borderRadius:10,padding:14}}><div style={{fontSize:13,color:"#6b7280"}}>{label}</div><div style={{fontSize:26,fontWeight:800}}>{value}</div></div>}
