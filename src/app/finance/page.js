"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const CATEGORIES=["รายได้งานป้าย","เงินมัดจำ","ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","อื่น ๆ"];
const input={padding:"10px 11px",border:"1px solid #d1d5db",borderRadius:8,background:"white",boxSizing:"border-box"};
const primaryButton={display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"10px 14px",border:0,borderRadius:8,background:"#111827",color:"white",fontWeight:700,cursor:"pointer"};
const secondaryButton={...primaryButton,background:"white",color:"#111827",border:"1px solid #d1d5db"};
const box={background:"white",borderRadius:12,overflow:"hidden",border:"1px solid #e5e7eb"};
const header={padding:"14px 16px",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"};
const th={padding:"11px 12px",textAlign:"left",fontSize:12,color:"#4b5563",background:"#f9fafb"};
const td={padding:"11px 12px",fontSize:13,verticalAlign:"top"};
const empty={padding:30,textAlign:"center",color:"#6b7280"};

export default function FinancePage(){
  const router=useRouter();
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[lineBusy,setLineBusy]=useState(null);
  const [transactions,setTransactions]=useState([]),[invoices,setInvoices]=useState([]),[receipts,setReceipts]=useState([]),[lineRows,setLineRows]=useState([]),[lineMedia,setLineMedia]=useState({});
  const [range,setRange]=useState("month"),[status,setStatus]=useState("all"),[error,setError]=useState("");
  const [form,setForm]=useState({direction:"expense",amount:"",category:"ค่าวัสดุ",description:"",project_name:"",transaction_date:new Date().toISOString().slice(0,10)});

  useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);setError("");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.push("/login");return;}
    const [tx,inv,rec,line]=await Promise.all([
      supabase.from("finance_transactions").select("*").order("transaction_date",{ascending:false}),
      supabase.from("invoices").select("id,invoice_no,project_name,grand_total,status,created_at").order("created_at",{ascending:false}),
      supabase.from("receipts").select("id,receipt_no,project_name,grand_total,status,created_at").order("created_at",{ascending:false}),
      supabase.from("line_account_entries").select("*").eq("status","pending").eq("is_context_note",false).order("created_at",{ascending:false}).limit(50)
    ]);
    if(tx.error)setError(tx.error.message);
    else setTransactions(tx.data||[]);
    setInvoices(inv.data||[]);setReceipts(rec.data||[]);
    if(line.error){setError(prev=>prev||line.error.message);setLineRows([]);}else{
      const rows=line.data||[];setLineRows(rows);
      const signed={};
      await Promise.all(rows.filter(x=>x.storage_path).map(async x=>{const {data}=await supabase.storage.from("line-account").createSignedUrl(x.storage_path,600);if(data?.signedUrl)signed[x.storage_path]=data.signedUrl;}));
      setLineMedia(signed);
    }
    setLoading(false);
  }

  function inRange(dateValue){const d=new Date(dateValue),now=new Date();if(range==="all")return true;if(range==="week"){const from=new Date(now);from.setDate(now.getDate()-6);from.setHours(0,0,0,0);return d>=from;}if(range==="month")return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();if(range==="year")return d.getFullYear()===now.getFullYear();return true;}
  const filtered=useMemo(()=>transactions.filter(x=>inRange(x.transaction_date)&&(status==="all"||x.status===status)),[transactions,range,status]);
  const confirmed=useMemo(()=>filtered.filter(x=>x.status==="confirmed"),[filtered]);
  const income=confirmed.filter(x=>x.direction==="income").reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=confirmed.filter(x=>x.direction==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
  const net=income-expense;
  const pendingTx=transactions.filter(x=>x.status==="pending").length;
  const pendingLine=lineRows.length;
  const invoiced=invoices.filter(x=>x.status!=="cancelled").reduce((s,x)=>s+Number(x.grand_total||0),0);
  const received=receipts.filter(x=>x.status==="received").reduce((s,x)=>s+Number(x.grand_total||0),0);
  const projects=useMemo(()=>{const map={};confirmed.forEach(x=>{const key=x.project_name?.trim()||"ไม่ระบุงาน";map[key]||={name:key,income:0,expense:0};map[key][x.direction]+=Number(x.amount||0);});return Object.values(map).map(x=>({...x,profit:x.income-x.expense})).sort((a,b)=>b.profit-a.profit);},[confirmed]);

  async function uploadImages(e){
    const files=Array.from(e.target.files||[]);if(!files.length)return;setBusy(true);setError("");
    try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("กรุณาเข้าสู่ระบบใหม่");for(const file of files){const safe=`${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const path=`gallery/${session.user.id}/${safe}`;const up=await supabase.storage.from("finance-evidence").upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;const res=await fetch("/api/finance/analyze",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({path})});const payload=await res.json();if(!res.ok&&res.status!==409)throw new Error(payload.error||"AI อ่านสลิปไม่สำเร็จ");}await loadAll();}
    catch(err){setError(err.message||"นำเข้ารูปไม่สำเร็จ");}finally{setBusy(false);e.target.value="";}
  }

  async function analyzeLine(row){
    setLineBusy(row.id);setError("");
    try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("กรุณาเข้าสู่ระบบใหม่");const res=await fetch("/api/finance/line-analyze",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({id:row.id})});const payload=await res.json();if(!res.ok)throw new Error(payload.error||"AI อ่านสลิป LINE ไม่สำเร็จ");await loadAll();}
    catch(err){setError(err.message||"AI อ่านสลิป LINE ไม่สำเร็จ");}finally{setLineBusy(null);}
  }

  async function addManual(e){e.preventDefault();if(!form.amount)return;setBusy(true);setError("");const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from("finance_transactions").insert({...form,amount:Number(form.amount),transaction_date:new Date(`${form.transaction_date}T12:00:00+07:00`).toISOString(),source:"manual",status:"confirmed",created_by:user?.id||null});if(error)setError(error.message);else{setForm({...form,amount:"",description:"",project_name:""});await loadAll();}setBusy(false);}
  async function setTxStatus(id,next){const {error}=await supabase.from("finance_transactions").update({status:next}).eq("id",id);if(error)setError(error.message);else await loadAll();}
  async function updateField(id,field,value){const {error}=await supabase.from("finance_transactions").update({[field]:value}).eq("id",id);if(error)setError(error.message);else setTransactions(prev=>prev.map(x=>x.id===id?{...x,[field]:value}:x));}
  function money(v){return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}

  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1500,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:18}}><div><h1 style={{margin:0}}>การเงินอัจฉริยะ</h1><p style={{color:"#6b7280"}}>คีย์เอง + อ่านสลิป Gallery + อ่านสลิป LINE + รายรับรายจ่าย + กำไรต่อ Job</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><label style={primaryButton}>{busy?"กำลังอ่านภาพ...":"📷 อ่านสลิปจาก Gallery"}<input type="file" accept="image/*" multiple onChange={uploadImages} disabled={busy} style={{display:"none"}}/></label><button style={secondaryButton} onClick={()=>router.push("/finance/line")}>💬 บัญชีจาก LINE</button><button style={secondaryButton} onClick={()=>router.push("/finance/reports")}>📊 รายงาน</button><button style={secondaryButton} onClick={()=>router.push("/")}>← Dashboard</button></div></div>

    {error&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#b91c1c",padding:12,borderRadius:10,marginBottom:14}}>{error}</div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}><Card title="รายรับยืนยันแล้ว" value={`฿${money(income)}`} sub="เฉพาะรายการยืนยัน"/><Card title="รายจ่ายยืนยันแล้ว" value={`฿${money(expense)}`} sub="เฉพาะรายการยืนยัน"/><Card title="สุทธิ" value={`฿${money(net)}`} sub="รายรับ - รายจ่าย"/><Card title="LINE รอตรวจ" value={`${pendingLine} รายการ`} sub="สลิป/ข้อความจาก LINE"/><Card title="Gallery รอตรวจ" value={`${pendingTx} รายการ`} sub="รายการ AI ที่ยังไม่ยืนยัน"/><Card title="Invoice ทั้งหมด" value={`฿${money(invoiced)}`} sub={`${invoices.length} ใบ`}/><Card title="Receipt รับแล้ว" value={`฿${money(received)}`} sub={`${receipts.length} ใบ`}/></div>

    <section style={box}><div style={header}><div><h2 style={{margin:0,fontSize:18}}>สลิปจาก LINE รอตรวจ</h2><div style={{fontSize:13,color:"#6b7280",marginTop:4}}>ข้อความอธิบายที่ส่งตามหลัง เช่น “ค่าน้ำมันรถ” จะถูกผูกกับสลิปก่อนหน้า ไม่สร้างรายการซ้ำ</div></div><button style={secondaryButton} onClick={()=>router.push("/finance/line")}>เปิดหน้าตรวจละเอียด</button></div>
      <div style={{padding:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
        {loading?<div style={empty}>กำลังโหลด...</div>:lineRows.length===0?<div style={empty}>ไม่มีสลิป LINE รอตรวจ</div>:lineRows.map(row=>{const url=row.storage_path?lineMedia[row.storage_path]:null;return <div key={row.id} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:12}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><b>{row.message_type==="image"?"สลิป/รูปจาก LINE":"ข้อความ LINE"}</b><span style={{fontSize:12,color:"#6b7280"}}>{row.analyzed_at?"AI อ่านแล้ว":"ยังไม่วิเคราะห์"}</span></div>{url&&row.mime_type?.startsWith("image/")&&<img src={url} alt="สลิปจาก LINE" style={{width:"100%",height:180,objectFit:"contain",borderRadius:8,marginTop:10,background:"#f9fafb"}}/>}<div style={{marginTop:10,fontSize:13}}><div><b>รายละเอียด:</b> {row.linked_note||row.suggested_description||row.message_text||"-"}</div><div><b>หมวด:</b> {row.category||"-"}</div><div><b>ยอด:</b> {row.amount?`฿${money(row.amount)}`:"รออ่านจากสลิป"}</div><div><b>วันที่:</b> {new Date(row.event_at||row.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</div></div><div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}><button style={primaryButton} disabled={lineBusy===row.id} onClick={()=>analyzeLine(row)}>{lineBusy===row.id?"กำลังอ่าน...":row.analyzed_at?"อ่านใหม่ด้วย AI":"อ่านสลิปด้วย AI"}</button><button style={secondaryButton} onClick={()=>router.push("/finance/line")}>ตรวจและอนุมัติ</button></div></div>})}
      </div>
    </section>

    <section style={{...box,marginTop:16}}><div style={header}><h2 style={{margin:0,fontSize:18}}>เพิ่มรายการด้วยตนเอง</h2></div><form onSubmit={addManual} style={{padding:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}><select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})} style={input}><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select><input type="number" min="0.01" step="0.01" placeholder="จำนวนเงิน" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={input}/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={input}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select><input type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})} style={input}/><input placeholder="ชื่องาน / Job" value={form.project_name} onChange={e=>setForm({...form,project_name:e.target.value})} style={input}/><input placeholder="รายละเอียด" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={input}/><button disabled={busy} style={primaryButton}>บันทึก</button></form></section>

    <section style={{...box,marginTop:16}}><div style={header}><h2 style={{margin:0,fontSize:18}}>รายการบัญชี</h2><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><select value={range} onChange={e=>setRange(e.target.value)} style={input}><option value="week">7 วันล่าสุด</option><option value="month">เดือนนี้</option><option value="year">ปีนี้</option><option value="all">ทั้งหมด</option></select><select value={status} onChange={e=>setStatus(e.target.value)} style={input}><option value="all">ทุกสถานะ</option><option value="pending">รอตรวจ</option><option value="confirmed">ยืนยันแล้ว</option><option value="rejected">ไม่รับรายการ</option></select></div></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}><thead><tr><th style={th}>วันที่</th><th style={th}>ประเภท</th><th style={th}>จำนวน</th><th style={th}>หมวด</th><th style={th}>Job</th><th style={th}>รายละเอียด</th><th style={th}>แหล่ง</th><th style={th}>สถานะ</th><th style={th}>จัดการ</th></tr></thead><tbody>{loading?<tr><td colSpan={9} style={empty}>กำลังโหลด...</td></tr>:filtered.length===0?<tr><td colSpan={9} style={empty}>ยังไม่มีรายการ</td></tr>:filtered.map(x=><tr key={x.id} style={{borderTop:"1px solid #e5e7eb"}}><td style={td}>{new Date(x.transaction_date).toLocaleDateString("th-TH")}</td><td style={td}><b style={{color:x.direction==="income"?"#15803d":"#b91c1c"}}>{x.direction==="income"?"รายรับ":"รายจ่าย"}</b></td><td style={td}><b>฿{money(x.amount)}</b></td><td style={td}><select value={x.category||"อื่น ๆ"} onChange={e=>updateField(x.id,"category",e.target.value)} style={{...input,padding:"7px 8px",minWidth:130}}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></td><td style={td}><input value={x.project_name||""} onChange={e=>updateField(x.id,"project_name",e.target.value)} placeholder="ผูกกับงาน" style={{...input,padding:"7px 8px",minWidth:130}}/></td><td style={td}>{x.description||x.counterparty||"-"}</td><td style={td}>{x.source==="line"?"LINE":x.source==="gallery"?"Gallery":"กรอกเอง"}</td><td style={td}>{x.status==="pending"?"รอตรวจ":x.status==="confirmed"?"ยืนยันแล้ว":"ไม่รับ"}</td><td style={td}><div style={{display:"flex",gap:6}}>{x.status!=="confirmed"&&<button onClick={()=>setTxStatus(x.id,"confirmed")} style={{padding:"7px 9px",border:0,borderRadius:7,background:"#dcfce7",color:"#166534",fontWeight:700,cursor:"pointer"}}>ยืนยัน</button>}{x.status!=="rejected"&&<button onClick={()=>setTxStatus(x.id,"rejected")} style={{padding:"7px 9px",border:0,borderRadius:7,background:"#fee2e2",color:"#991b1b",fontWeight:700,cursor:"pointer"}}>ไม่รับ</button>}</div></td></tr>)}</tbody></table></div></section>

    <section style={{...box,marginTop:16}}><div style={header}><h2 style={{margin:0,fontSize:18}}>กำไร / ขาดทุน แยกตาม Job</h2></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}><thead><tr><th style={th}>งาน</th><th style={th}>รายรับ</th><th style={th}>ต้นทุน/รายจ่าย</th><th style={th}>กำไร</th><th style={th}>Margin</th></tr></thead><tbody>{projects.length===0?<tr><td colSpan={5} style={empty}>ยังไม่มีข้อมูลที่ยืนยัน</td></tr>:projects.map(p=><tr key={p.name} style={{borderTop:"1px solid #e5e7eb"}}><td style={td}><b>{p.name}</b></td><td style={td}>฿{money(p.income)}</td><td style={td}>฿{money(p.expense)}</td><td style={{...td,color:p.profit>=0?"#15803d":"#b91c1c",fontWeight:800}}>฿{money(p.profit)}</td><td style={td}>{p.income>0?`${((p.profit/p.income)*100).toFixed(1)}%`:"-"}</td></tr>)}</tbody></table></div></section>
  </div></main>;
}

function Card({title,value,sub}){return <div style={{background:"white",padding:16,borderRadius:12,border:"1px solid #e5e7eb"}}><div style={{color:"#6b7280",fontSize:13}}>{title}</div><div style={{fontSize:24,fontWeight:800,marginTop:6}}>{value}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>{sub}</div></div>}
