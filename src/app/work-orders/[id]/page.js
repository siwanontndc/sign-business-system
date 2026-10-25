"use client";
import {useEffect,useState} from "react";
import {useParams,useRouter} from "next/navigation";
import {supabase} from "../../lib/supabase";

export default function WorkOrderDetailPage(){
  const {id}=useParams();
  const router=useRouter();
  const [row,setRow]=useState(null),[updates,setUpdates]=useState([]),[media,setMedia]=useState([]),[urls,setUrls]=useState({}),[loading,setLoading]=useState(true),[edit,setEdit]=useState(false),[draft,setDraft]=useState({});
  async function load(){
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace("/login");return;}
    const {data:w,error}=await supabase.from("line_work_orders").select("*").eq("id",id).single();
    if(error){alert(error.message);setLoading(false);return;}
    const [{data:u},{data:m}]=await Promise.all([
      supabase.from("line_work_updates").select("*").eq("survey_id",w.survey_id).order("created_at",{ascending:true}),
      supabase.from("survey_media").select("id,storage_path,file_name,mime_type,captured_at,note").eq("survey_id",w.survey_id).order("captured_at",{ascending:true})
    ]);
    const signed={};
    await Promise.all((m||[]).map(async x=>{
      if(!x.storage_path)return;
      const {data}=await supabase.storage.from("job-media").createSignedUrl(x.storage_path,3600);
      if(data?.signedUrl)signed[x.id]=data.signedUrl;
    }));
    setRow(w);setUpdates(u||[]);setMedia(m||[]);setUrls(signed);setDraft({customer_name:w.customer_name||"",project_name:w.project_name||"",summary:w.summary||""});setLoading(false);
  }
  useEffect(()=>{if(id)load()},[id]);
  async function save(){
    const patch={customer_name:draft.customer_name.trim()||null,project_name:draft.project_name.trim()||null,summary:draft.summary.trim()||null,updated_at:new Date().toISOString()};
    const {error}=await supabase.from("line_work_orders").update(patch).eq("id",id);
    if(error)return alert(error.message);
    await supabase.from("site_surveys").update({customer_name:patch.customer_name,project_name:patch.project_name,note:patch.summary,updated_at:new Date().toISOString()}).eq("id",row.survey_id);
    setEdit(false);load();
  }
  async function cancel(){
    if(!confirm(`ยกเลิกใบงาน ${row.work_no} ?\nใช้กรณีงานซ้ำหรือไม่ต้องทำ ข้อมูล รูป และประวัติจะยังเก็บไว้`))return;
    await supabase.from("line_work_orders").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id);
    await supabase.from("site_surveys").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",row.survey_id);
    await supabase.from("survey_line_contexts").delete().eq("survey_id",row.survey_id);
    load();
  }
  async function restore(){
    await supabase.from("line_work_orders").update({status:"open",updated_at:new Date().toISOString()}).eq("id",id);
    await supabase.from("site_surveys").update({status:"surveying",updated_at:new Date().toISOString()}).eq("id",row.survey_id);
    load();
  }
  const fmt=v=>v?new Date(v).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"}):"-";
  if(loading)return <main style={{padding:30}}>กำลังโหลดใบงาน...</main>;
  if(!row)return <main style={{padding:30}}>ไม่พบใบงาน</main>;
  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}>
    <div style={{maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{fontSize:13,color:"#6b7280"}}>ใบงานจาก LINE</div><h1 style={{margin:"3px 0"}}>{row.work_no}</h1></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>router.push("/work-orders")} style={neutral}>← ใบงานทั้งหมด</button>
          <button onClick={()=>router.push(`/surveys/${row.survey_id}`)} style={blue}>เปิดหน้าหน้างาน/รูป</button>
          {row.status==="cancelled"?<button onClick={restore} style={green}>เปิดงานอีกครั้ง</button>:<button onClick={cancel} style={red}>ยกเลิกงาน</button>}
        </div>
      </div>

      <section style={card}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"start",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:260}}>
            {edit?<>
              <label>ลูกค้า<input style={inp} value={draft.customer_name} onChange={e=>setDraft({...draft,customer_name:e.target.value})}/></label>
              <label>ชื่องาน<input style={inp} value={draft.project_name} onChange={e=>setDraft({...draft,project_name:e.target.value})}/></label>
              <label>สรุปใบงาน<textarea style={{...inp,minHeight:100}} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})}/></label>
            </>:<>
              <h2 style={{margin:"0 0 4px"}}>{row.customer_name||"รอระบุลูกค้า"}</h2>
              <div style={{fontSize:17,fontWeight:800}}>{row.project_name||"ยังไม่ระบุชื่องาน"}</div>
              {row.summary&&<div style={{marginTop:12,whiteSpace:"pre-wrap",background:"#f8fafc",padding:12,borderRadius:10}}>{row.summary}</div>}
            </>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:"#6b7280"}}>สถานะ</div>
            <div style={{fontWeight:900,color:row.status==="cancelled"?"#991b1b":"#166534"}}>{row.status==="cancelled"?"ยกเลิก":"กำลังใช้งาน"}</div>
            <div style={{marginTop:7,fontSize:12,color:"#6b7280"}}>แก้ไขทั้งหมด</div>
            <div style={{fontSize:24,fontWeight:900}}>{row.revision_count||0} ครั้ง</div>
          </div>
        </div>
        <div style={{marginTop:12,display:"flex",gap:8}}>
          {edit?<><button onClick={save} style={green}>บันทึกการแก้ไข</button><button onClick={()=>setEdit(false)} style={neutral}>ยกเลิก</button></>:<button onClick={()=>setEdit(true)} style={neutral}>✏️ แก้ไขใบงาน</button>}
        </div>
      </section>

      <section style={card}>
        <h2 style={{marginTop:0}}>📝 ประวัติงาน / การแก้ไข</h2>
        {updates.length===0?<div style={{color:"#6b7280"}}>ยังไม่มีประวัติข้อความ</div>:<div style={{display:"grid",gap:8}}>
          {updates.map((u,i)=><div key={u.id||i} style={{borderLeft:u.update_type==="revision"?"4px solid #f97316":"4px solid #3b82f6",background:"#f8fafc",padding:"10px 12px",borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><b>{u.update_type==="revision"?"แก้ไข":u.update_type==="new_job"?"เริ่มงาน":"อัปเดต"}</b><span style={{fontSize:12,color:"#6b7280"}}>{fmt(u.created_at)}</span></div>
            <div style={{marginTop:4}}>{u.summary||u.raw_text||"-"}</div>
          </div>)}
        </div>}
      </section>

      <section style={card}>
        <h2 style={{marginTop:0}}>🖼️ รูปในใบงาน ({media.length})</h2>
        {media.length===0?<div style={{color:"#6b7280"}}>ยังไม่มีรูป</div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {media.map(m=><div key={m.id} style={{border:"1px solid #e5e7eb",borderRadius:10,overflow:"hidden",background:"#fff"}}>
            {urls[m.id]&&String(m.mime_type||"").startsWith("image/")?<img src={urls[m.id]} alt={m.file_name||"รูปงาน"} style={{width:"100%",height:160,objectFit:"cover",display:"block"}}/>:<div style={{height:160,display:"grid",placeItems:"center",background:"#f8fafc"}}>ไฟล์</div>}
            <div style={{padding:8,fontSize:12}}>{fmt(m.captured_at)}</div>
          </div>)}
        </div>}
      </section>
    </div>
  </main>
}
const card={marginTop:16,background:"white",border:"1px solid #e5e7eb",borderRadius:14,padding:16};
const inp={display:"block",width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:8,margin:"5px 0 12px"};
const blue={border:0,borderRadius:8,padding:"9px 11px",background:"#dbeafe",color:"#1d4ed8",fontWeight:900};
const green={border:0,borderRadius:8,padding:"9px 11px",background:"#dcfce7",color:"#166534",fontWeight:900};
const red={border:0,borderRadius:8,padding:"9px 11px",background:"#fee2e2",color:"#991b1b",fontWeight:900};
const neutral={border:"1px solid #d1d5db",borderRadius:8,padding:"9px 11px",background:"white",color:"#374151",fontWeight:900};
