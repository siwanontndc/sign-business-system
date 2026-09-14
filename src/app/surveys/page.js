"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function SurveysPage(){
 const router=useRouter();
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[surveys,setSurveys]=useState([]),[customers,setCustomers]=useState([]);
 const[customerId,setCustomerId]=useState(""),[customerName,setCustomerName]=useState(""),[projectName,setProjectName]=useState(""),[locationText,setLocationText]=useState(""),[note,setNote]=useState("");
 useEffect(()=>{load()},[]);
 async function load(){
  const{data:{user}}=await supabase.auth.getUser();if(!user)return router.replace("/login");
  const[{data:s},{data:c}]=await Promise.all([
   supabase.from("site_surveys").select("id,survey_no,customer_name,project_name,location_text,status,quotation_id,created_at").order("created_at",{ascending:false}),
   supabase.from("customers").select("id,customer_code,company_name,contact_name,phone").order("created_at",{ascending:false})
  ]);setSurveys(s||[]);setCustomers(c||[]);setLoading(false)
 }
 function chooseCustomer(id){setCustomerId(id);const c=customers.find(x=>x.id===id);if(c)setCustomerName(c.company_name||c.contact_name||c.customer_code||"")}
 async function createSurvey(){
  if(!customerName.trim())return alert("กรุณากรอกชื่อลูกค้า");
  const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  setSaving(true);try{
   const d=new Date(),no=`SUR-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}-${Math.floor(1000+Math.random()*9000)}`;
   const{data,error}=await supabase.from("site_surveys").insert({survey_no:no,customer_id:customerId||null,customer_name:customerName.trim(),project_name:projectName.trim()||null,location_text:locationText.trim()||null,note:note.trim()||null,status:"surveying",created_by:user.id}).select("id").single();
   if(error)throw error;router.push(`/surveys/${data.id}`)
  }catch(e){alert("สร้างงานสำรวจไม่สำเร็จ: "+(e?.message||"เกิดข้อผิดพลาด"))}finally{setSaving(false)}
 }
 const inp={width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:8};
 if(loading)return <main style={{padding:30}}>กำลังโหลด...</main>;
 return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1400,margin:"0 auto"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:18}}><div><h1 style={{margin:0}}>📍 สำรวจหน้างานก่อนเสนอราคา</h1><p style={{color:"#6b7280"}}>เก็บรูปและข้อมูลหน้างานได้ก่อนมีใบเสนอราคา</p></div><button onClick={()=>router.push("/")} style={{padding:"10px 14px",border:0,borderRadius:8,background:"#111827",color:"white",fontWeight:800}}>🏠 หน้าหลัก</button></div>
  <div style={{display:"grid",gridTemplateColumns:"minmax(320px,430px) 1fr",gap:18,alignItems:"start"}}>
   <section style={{background:"white",padding:18,borderRadius:14,border:"1px solid #e5e7eb"}}><h2 style={{marginTop:0}}>สร้างงานสำรวจใหม่</h2>
    <label>ลูกค้าเดิม (ถ้ามี)<select style={{...inp,marginTop:5,marginBottom:12}} value={customerId} onChange={e=>chooseCustomer(e.target.value)}><option value="">-- กรอกเอง --</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code||"-"} — {c.company_name||c.contact_name||"ไม่ระบุชื่อ"}</option>)}</select></label>
    <label>ชื่อลูกค้า *<input style={{...inp,marginTop:5,marginBottom:12}} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></label>
    <label>ชื่องาน<input style={{...inp,marginTop:5,marginBottom:12}} value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="เช่น ป้ายหน้าร้าน / facade"/></label>
    <label>สถานที่<input style={{...inp,marginTop:5,marginBottom:12}} value={locationText} onChange={e=>setLocationText(e.target.value)}/></label>
    <label>หมายเหตุ<textarea style={{...inp,marginTop:5,minHeight:80}} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button disabled={saving} onClick={createSurvey} style={{width:"100%",marginTop:14,padding:12,border:0,borderRadius:9,background:"#be185d",color:"white",fontWeight:900}}>{saving?"กำลังสร้าง...":"＋ สร้างงานสำรวจ"}</button>
   </section>
   <section style={{background:"white",padding:18,borderRadius:14,border:"1px solid #e5e7eb"}}><h2 style={{marginTop:0}}>งานสำรวจทั้งหมด</h2><div style={{display:"grid",gap:10}}>{surveys.length===0&&<div style={{color:"#6b7280"}}>ยังไม่มีงานสำรวจ</div>}{surveys.map(s=><button key={s.id} onClick={()=>router.push(`/surveys/${s.id}`)} style={{textAlign:"left",padding:14,border:"1px solid #e5e7eb",borderRadius:12,background:"white",cursor:"pointer"}}><div style={{fontWeight:900,color:"#be185d"}}>{s.survey_no}</div><div style={{fontSize:17,fontWeight:800}}>{s.customer_name}</div><div>{s.project_name||"ยังไม่ระบุชื่องาน"}</div><div style={{fontSize:12,color:"#6b7280",marginTop:4}}>{s.location_text||"-"} • {s.status==="quoted"?"ออกใบเสนอราคาแล้ว":s.status==="ready_to_quote"?"พร้อมเสนอราคา":"กำลังสำรวจ"}</div></button>)}</div></section>
  </div>
 </div></main>
}
