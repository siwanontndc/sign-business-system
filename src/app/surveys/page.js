"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function SurveysPage(){
 const router=useRouter();
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[surveys,setSurveys]=useState([]),[customers,setCustomers]=useState([]),[showCancelled,setShowCancelled]=useState(false);
 const[customerId,setCustomerId]=useState(""),[customerName,setCustomerName]=useState(""),[contactName,setContactName]=useState(""),[phone,setPhone]=useState(""),[scheduledAt,setScheduledAt]=useState(""),[projectName,setProjectName]=useState(""),[locationText,setLocationText]=useState(""),[note,setNote]=useState("");
 useEffect(()=>{load()},[]);
 async function load(){
  const{data:{user}}=await supabase.auth.getUser();if(!user)return router.replace("/login");
  const[{data:s},{data:c}]=await Promise.all([
   supabase.from("site_surveys").select("id,survey_no,customer_name,contact_name,phone,scheduled_at,project_name,location_text,status,quotation_id,created_at").order("created_at",{ascending:false}),
   supabase.from("customers").select("id,customer_code,company_name,contact_name,phone").order("created_at",{ascending:false})
  ]);setSurveys(s||[]);setCustomers(c||[]);setLoading(false)
 }
 function chooseCustomer(id){
  setCustomerId(id);const c=customers.find(x=>x.id===id);
  if(c){setCustomerName(c.company_name||c.contact_name||c.customer_code||"");setContactName(c.contact_name||"");setPhone(c.phone||"")}
 }
 async function createSurvey(){
  if(!customerName.trim())return alert("กรุณากรอกชื่อลูกค้า");
  const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  setSaving(true);try{
   const d=new Date(),no=`SUR-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}-${Math.floor(1000+Math.random()*9000)}`;
   const{data,error}=await supabase.from("site_surveys").insert({survey_no:no,customer_id:customerId||null,customer_name:customerName.trim(),contact_name:contactName.trim()||null,phone:phone.trim()||null,scheduled_at:scheduledAt?new Date(scheduledAt).toISOString():null,project_name:projectName.trim()||null,location_text:locationText.trim()||null,note:note.trim()||null,status:"surveying",created_by:user.id}).select("id").single();
   if(error)throw error;router.push(`/surveys/${data.id}`)
  }catch(e){alert("สร้างงานสำรวจไม่สำเร็จ: "+(e?.message||"เกิดข้อผิดพลาด"))}finally{setSaving(false)}
 }
 async function cancelSurvey(e,s){
  e.stopPropagation();
  if(!confirm(`ยกเลิก ${s.survey_no} ?\nข้อมูลและรูปจะยังเก็บไว้`))return;
  const {error}=await supabase.from('site_surveys').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',s.id);
  await supabase.from('survey_line_contexts').delete().eq('survey_id',s.id);
  if(error)return alert('ยกเลิกไม่สำเร็จ: '+error.message);
  setSurveys(x=>x.map(v=>v.id===s.id?{...v,status:'cancelled'}:v));
 }
 async function restoreSurvey(e,s){
  e.stopPropagation();
  const {error}=await supabase.from('site_surveys').update({status:'surveying',updated_at:new Date().toISOString()}).eq('id',s.id);
  if(error)return alert('เปิดงานไม่สำเร็จ: '+error.message);
  setSurveys(x=>x.map(v=>v.id===s.id?{...v,status:'surveying'}:v));
 }
 function fmt(dt){if(!dt)return"";return new Date(dt).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}
 const inp={width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:8};
 const visibleSurveys=showCancelled?surveys:surveys.filter(s=>s.status!=="cancelled");
 if(loading)return <main style={{padding:30}}>กำลังโหลด...</main>;
 return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1400,margin:"0 auto"}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:18}}><div><h1 style={{margin:0}}>📍 สำรวจหน้างานก่อนเสนอราคา</h1><p style={{color:"#6b7280"}}>เก็บรูปและข้อมูลหน้างานได้ก่อนมีใบเสนอราคา</p></div><label style={{display:'flex',alignItems:'center',gap:8,fontWeight:800}}><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> แสดงงานที่ยกเลิก</label></div>
  <div style={{display:"grid",gridTemplateColumns:"minmax(320px,430px) 1fr",gap:18,alignItems:"start"}}>
   <section style={{background:"white",padding:18,borderRadius:14,border:"1px solid #e5e7eb"}}><h2 style={{marginTop:0}}>สร้างงานสำรวจใหม่</h2>
    <label>ลูกค้าเดิม (ถ้ามี)<select style={{...inp,marginTop:5,marginBottom:12}} value={customerId} onChange={e=>chooseCustomer(e.target.value)}><option value="">-- กรอกเอง --</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code||"-"} — {c.company_name||c.contact_name||"ไม่ระบุชื่อ"}</option>)}</select></label>
    <label>ชื่อลูกค้า *<input style={{...inp,marginTop:5,marginBottom:12}} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></label>
    <label>ผู้ติดต่อ<input style={{...inp,marginTop:5,marginBottom:12}} value={contactName} onChange={e=>setContactName(e.target.value)}/></label>
    <label>เบอร์โทร<input style={{...inp,marginTop:5,marginBottom:12}} value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel"/></label>
    <label>วันที่นัดสำรวจ<input type="datetime-local" style={{...inp,marginTop:5,marginBottom:12}} value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label>
    <label>ชื่องาน<input style={{...inp,marginTop:5,marginBottom:12}} value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="เช่น ป้ายหน้าร้าน / facade"/></label>
    <label>สถานที่<input style={{...inp,marginTop:5,marginBottom:12}} value={locationText} onChange={e=>setLocationText(e.target.value)}/></label>
    <label>หมายเหตุ<textarea style={{...inp,marginTop:5,minHeight:80}} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button disabled={saving} onClick={createSurvey} style={{width:"100%",marginTop:14,padding:12,border:0,borderRadius:9,background:"#be185d",color:"white",fontWeight:900}}>{saving?"กำลังสร้าง...":"＋ สร้างงานสำรวจ"}</button>
   </section>
   <section style={{background:"white",padding:18,borderRadius:14,border:"1px solid #e5e7eb"}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><h2 style={{marginTop:0}}>งานสำรวจ</h2><div style={{fontSize:13,color:'#6b7280'}}>{visibleSurveys.length} งาน</div></div><div style={{display:"grid",gap:10}}>{visibleSurveys.length===0&&<div style={{color:"#6b7280"}}>ยังไม่มีงานสำรวจ</div>}{visibleSurveys.map(s=><div key={s.id} onClick={()=>router.push(`/surveys/${s.id}`)} style={{textAlign:"left",padding:14,border:s.status==='cancelled'?'1px solid #fecaca':'1px solid #e5e7eb',borderRadius:12,background:s.status==='cancelled'?'#fff7f7':'white',cursor:"pointer"}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start'}}><div><div style={{fontWeight:900,color:s.status==='cancelled'?'#991b1b':'#be185d'}}>{s.survey_no}</div><div style={{fontSize:17,fontWeight:800}}>{s.customer_name}</div><div>{s.project_name||"ยังไม่ระบุชื่องาน"}</div></div>{s.status==='cancelled'?<button onClick={e=>restoreSurvey(e,s)} style={{border:0,borderRadius:8,padding:'7px 9px',background:'#dcfce7',color:'#166534',fontWeight:900}}>เปิดอีกครั้ง</button>:<button onClick={e=>cancelSurvey(e,s)} style={{border:0,borderRadius:8,padding:'7px 9px',background:'#fee2e2',color:'#991b1b',fontWeight:900}}>ยกเลิก</button>}</div><div style={{fontSize:12,color:"#6b7280",marginTop:4}}>{s.location_text||"-"} • {s.scheduled_at?`นัด ${fmt(s.scheduled_at)} • `:""}{s.status==="cancelled"?"ยกเลิก":s.status==="quoted"?"ออกใบเสนอราคาแล้ว":s.status==="ready_to_quote"?"พร้อมเสนอราคา":"กำลังสำรวจ"}</div></div>)}</div></section>
  </div>
 </div></main>
}
