"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "../lib/supabase";

export default function WorkOrdersPage(){
  const router=useRouter();
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[editing,setEditing]=useState(null),[draft,setDraft]=useState({});
  async function load(){
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace("/login");return;}
    const {data,error}=await supabase.from("line_work_orders").select("*").order("updated_at",{ascending:false});
    if(error)alert(error.message);
    setRows(data||[]);setLoading(false);
  }
  useEffect(()=>{load()},[]);
  async function save(row){
    const patch={customer_name:(draft.customer_name||"").trim()||null,project_name:(draft.project_name||"").trim()||null,summary:(draft.summary||"").trim()||null,updated_at:new Date().toISOString()};
    const {error}=await supabase.from("line_work_orders").update(patch).eq("id",row.id);
    if(error)return alert("บันทึกไม่สำเร็จ: "+error.message);
    setEditing(null);await load();
  }
  async function cancel(row){
    if(!confirm(`ยกเลิกใบงาน ${row.work_no} ?\nใช้กรณีงานซ้ำหรือไม่ต้องทำ ข้อมูลเดิมจะยังเก็บไว้`))return;
    const {error}=await supabase.from("line_work_orders").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",row.id);
    if(error)return alert(error.message);
    await supabase.from("site_surveys").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",row.survey_id);
    setRows(x=>x.map(v=>v.id===row.id?{...v,status:"cancelled"}:v));
  }
  async function restore(row){
    const {error}=await supabase.from("line_work_orders").update({status:"open",updated_at:new Date().toISOString()}).eq("id",row.id);
    if(error)return alert(error.message);
    await supabase.from("site_surveys").update({status:"surveying",updated_at:new Date().toISOString()}).eq("id",row.survey_id);
    await load();
  }
  const active=useMemo(()=>rows.filter(x=>x.status!=="cancelled"),[rows]);
  if(loading)return <main style={{padding:30}}>กำลังโหลดใบงาน...</main>;
  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}>
    <div style={{maxWidth:1280,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div><h1 style={{margin:0}}>📋 ใบงานจาก LINE</h1><p style={{color:"#6b7280"}}>สร้างอัตโนมัติจากข้อความ/รูปใน LINE และรวมงานแก้ไขไว้ในใบงานเดิม</p></div>
        <button onClick={()=>router.push("/")} style={{padding:"10px 14px",border:"1px solid #d1d5db",borderRadius:9,background:"white",fontWeight:800}}>← Dashboard</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,margin:"16px 0"}}>
        <Stat label="ใบงานที่เปิดอยู่" value={active.length}/>
        <Stat label="แก้ไขสะสม" value={rows.reduce((s,x)=>s+Number(x.revision_count||0),0)}/>
        <Stat label="ยกเลิก" value={rows.filter(x=>x.status==="cancelled").length}/>
      </div>
      <div style={{display:"grid",gap:12}}>
        {rows.map(row=>{
          const edit=editing===row.id;
          return <section key={row.id} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:14,padding:16,opacity:row.status==="cancelled"?.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",flexWrap:"wrap"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><b style={{color:"#be185d"}}>{row.work_no}</b><span style={{fontSize:12,fontWeight:800,padding:"3px 7px",borderRadius:999,background:"#eef2ff",color:"#3730a3"}}>แก้ไข {row.revision_count||0} ครั้ง</span></div>
                {edit?<>
                  <input value={draft.customer_name||""} onChange={e=>setDraft({...draft,customer_name:e.target.value})} placeholder="ลูกค้า" style={inp}/>
                  <input value={draft.project_name||""} onChange={e=>setDraft({...draft,project_name:e.target.value})} placeholder="ชื่องาน" style={inp}/>
                  <textarea value={draft.summary||""} onChange={e=>setDraft({...draft,summary:e.target.value})} placeholder="สรุปงาน" style={{...inp,minHeight:80}}/>
                </>:<>
                  <div style={{fontSize:18,fontWeight:900,marginTop:4}}>{row.customer_name||"รอระบุลูกค้า"}</div>
                  <div style={{marginTop:2}}>{row.project_name||"ยังไม่ระบุชื่องาน"}</div>
                  {row.summary&&<div style={{marginTop:8,color:"#475569",background:"#f8fafc",padding:9,borderRadius:8,whiteSpace:"pre-wrap"}}>{row.summary}</div>}
                </>}
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {edit?<><button onClick={()=>save(row)} style={green}>บันทึก</button><button onClick={()=>setEditing(null)} style={neutral}>ยกเลิกแก้ไข</button></>:<>
                  <button onClick={()=>router.push(`/surveys/${row.survey_id}`)} style={blue}>เปิดงาน</button>
                  <button onClick={()=>{setEditing(row.id);setDraft({customer_name:row.customer_name||"",project_name:row.project_name||"",summary:row.summary||""})}} style={neutral}>แก้ไข</button>
                  {row.status==="cancelled"?<button onClick={()=>restore(row)} style={green}>เปิดอีกครั้ง</button>:<button onClick={()=>cancel(row)} style={red}>ยกเลิกงาน</button>}
                </>}
              </div>
            </div>
          </section>
        })}
      </div>
    </div>
  </main>
}
function Stat({label,value}){return <div style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:14}}><div style={{fontSize:12,color:"#6b7280"}}>{label}</div><div style={{fontSize:26,fontWeight:900,marginTop:4}}>{value}</div></div>}
const inp={width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:8,marginTop:8};
const blue={border:0,borderRadius:8,padding:"8px 10px",background:"#dbeafe",color:"#1d4ed8",fontWeight:900};
const green={border:0,borderRadius:8,padding:"8px 10px",background:"#dcfce7",color:"#166534",fontWeight:900};
const red={border:0,borderRadius:8,padding:"8px 10px",background:"#fee2e2",color:"#991b1b",fontWeight:900};
const neutral={border:"1px solid #d1d5db",borderRadius:8,padding:"8px 10px",background:"white",color:"#374151",fontWeight:900};
