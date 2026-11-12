"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "../lib/supabase";

const STAGES=["รับงาน","รอข้อมูล","ออกแบบ","รอลูกค้าอนุมัติ","เตรียมผลิต","กำลังผลิต","QC","ติดตั้ง","ส่งมอบ","ปิดงาน"];
const STATUSES=[
  {value:"open",label:"รอดำเนินการ"},
  {value:"in_progress",label:"กำลังทำ"},
  {value:"done",label:"เสร็จแล้ว"},
  {value:"cancelled",label:"ยกเลิก"}
];

function bangkokDateString(d=new Date()){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function fmt(v){
  if(!v)return "-";
  return new Date(v).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"short",timeStyle:"short"});
}
function sameDay(v,date){
  if(!v)return false;
  return bangkokDateString(new Date(v))===date;
}

export default function DailyJobsPage(){
  const router=useRouter();
  const [date,setDate]=useState(bangkokDateString());
  const [rows,setRows]=useState([]);
  const [updates,setUpdates]=useState([]);
  const [drafts,setDrafts]=useState({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{load()},[date]);

  async function load(){
    setLoading(true);setMessage("");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.replace("/login");return;}

    const [wo,up]=await Promise.all([
      supabase.from("line_work_orders")
        .select("*")
        .order("queue_order",{ascending:true,nullsFirst:false})
        .order("updated_at",{ascending:false}),
      supabase.from("line_work_updates")
        .select("id,survey_id,update_type,summary,raw_text,created_at")
        .order("created_at",{ascending:false})
        .limit(1000)
    ]);

    if(wo.error){setMessage("โหลดใบงานไม่สำเร็จ: "+wo.error.message);setRows([]);}
    else setRows(wo.data||[]);
    if(up.error)setUpdates([]);
    else setUpdates(up.data||[]);

    const init={};
    (wo.data||[]).forEach((r,i)=>{
      init[r.id]={
        queue_order:r.queue_order??i+1,
        workflow_stage:r.workflow_stage||"รับงาน",
        status:r.status||"open",
        coordinator_note:r.coordinator_note||""
      };
    });
    setDrafts(init);
    setLoading(false);
  }

  const latestBySurvey=useMemo(()=>{
    const m={};
    updates.forEach(u=>{if(!m[u.survey_id])m[u.survey_id]=u;});
    return m;
  },[updates]);

  const dateUpdates=useMemo(()=>updates.filter(u=>sameDay(u.created_at,date)),[updates,date]);
  const updatedSurveyIds=useMemo(()=>new Set(dateUpdates.map(u=>u.survey_id)),[dateUpdates]);

  const enriched=useMemo(()=>rows.map(r=>{
    const isNew=sameDay(r.created_at,date);
    const updatedToday=updatedSurveyIds.has(r.survey_id)||sameDay(r.updated_at,date);
    const kind=isNew?"new":updatedToday?"old_updated":"old";
    return {...r,kind,isNew,updatedToday,latest:latestBySurvey[r.survey_id]||null};
  }),[rows,date,updatedSurveyIds,latestBySurvey]);

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return enriched
      .filter(r=>{
        if(filter==="new"&&!r.isNew)return false;
        if(filter==="old_updated"&&r.kind!=="old_updated")return false;
        if(filter==="active"&&["done","cancelled"].includes(drafts[r.id]?.status||r.status))return false;
        if(filter==="done"&&(drafts[r.id]?.status||r.status)!=="done")return false;
        if(!q)return true;
        return [r.work_no,r.customer_name,r.project_name,r.summary,r.latest?.summary,r.latest?.raw_text]
          .some(v=>String(v||"").toLowerCase().includes(q));
      })
      .sort((a,b)=>Number(drafts[a.id]?.queue_order||999999)-Number(drafts[b.id]?.queue_order||999999));
  },[enriched,filter,search,drafts]);

  const newCount=enriched.filter(r=>r.isNew).length;
  const oldUpdatedCount=enriched.filter(r=>r.kind==="old_updated").length;
  const activeCount=enriched.filter(r=>!["done","cancelled"].includes(drafts[r.id]?.status||r.status)).length;
  const doneCount=enriched.filter(r=>(drafts[r.id]?.status||r.status)==="done").length;

  function patch(id,key,value){
    setDrafts(prev=>({...prev,[id]:{...(prev[id]||{}),[key]:value}}));
  }

  function normalizeQueue(){
    const ordered=[...visible].sort((a,b)=>Number(drafts[a.id]?.queue_order||999999)-Number(drafts[b.id]?.queue_order||999999));
    setDrafts(prev=>{
      const next={...prev};
      ordered.forEach((r,i)=>{next[r.id]={...(next[r.id]||{}),queue_order:i+1};});
      return next;
    });
  }

  async function saveAll(){
    setSaving(true);setMessage("");
    const changed=rows.filter(r=>{
      const d=drafts[r.id];
      if(!d)return false;
      return Number(d.queue_order)!==Number(r.queue_order??0)
        || d.workflow_stage!==(r.workflow_stage||"รับงาน")
        || d.status!==(r.status||"open")
        || d.coordinator_note!==(r.coordinator_note||"");
    });

    if(changed.length===0){setMessage("ไม่มีรายการที่แก้ไข");setSaving(false);return;}

    const now=new Date().toISOString();
    const results=await Promise.all(changed.map(r=>{
      const d=drafts[r.id];
      return supabase.from("line_work_orders").update({
        queue_order:Number(d.queue_order)||null,
        workflow_stage:d.workflow_stage,
        status:d.status,
        coordinator_note:d.coordinator_note.trim()||null,
        updated_at:now
      }).eq("id",r.id);
    }));

    const failed=results.filter(x=>x.error);
    if(failed.length){
      setMessage("บันทึกไม่ครบ "+failed.length+" รายการ: "+failed[0].error.message);
    }else{
      setMessage("✅ บันทึกการอัปเดต "+changed.length+" งานพร้อมกันแล้ว");
      await load();
    }
    setSaving(false);
  }

  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:"18px 10px 80px",color:"#111827"}}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div>
          <h1 style={{margin:0}}>🗓️ ศูนย์ควบคุมงานรายวัน</h1>
          <p style={{margin:"6px 0 0",color:"#6b7280"}}>แยกงานใหม่ / งานเก่าที่อัปเดต • ปรับลำดับ ขั้นตอน และสถานะ แล้วบันทึกครั้งเดียว</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={secondary} onClick={()=>router.push("/work-orders")}>ใบงานทั้งหมด</button>
          <button style={secondary} onClick={()=>router.push("/")}>← Dashboard</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,margin:"16px 0"}}>
        <Stat label="งานใหม่วันนี้" value={newCount}/>
        <Stat label="งานเก่าอัปเดตวันนี้" value={oldUpdatedCount}/>
        <Stat label="งานที่ยังเดินอยู่" value={activeCount}/>
        <Stat label="เสร็จแล้ว" value={doneCount}/>
      </div>

      <section style={panel}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={input}/>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={input}>
            <option value="all">ทั้งหมด</option>
            <option value="new">งานใหม่วันนี้</option>
            <option value="old_updated">งานเก่าอัปเดตวันนี้</option>
            <option value="active">งานที่ยังไม่เสร็จ</option>
            <option value="done">เสร็จแล้ว</option>
          </select>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาลูกค้า / งาน / เลขใบงาน" style={{...input,flex:"1 1 260px"}}/>
          <button onClick={normalizeQueue} style={secondary}>เรียงคิว 1…{visible.length}</button>
          <button onClick={saveAll} disabled={saving} style={primary}>{saving?"กำลังบันทึก...":"💾 บันทึกทั้งหมด"}</button>
        </div>
        {message&&<div style={{marginTop:10,padding:10,borderRadius:8,background:"#f8fafc",fontWeight:700}}>{message}</div>}
      </section>

      <section style={{...panel,padding:0,overflow:"hidden",marginTop:12}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1180}}>
            <thead style={{background:"#f8fafc"}}>
              <tr>
                <th style={th}>คิว</th>
                <th style={th}>ประเภท</th>
                <th style={th}>ใบงาน / ลูกค้า</th>
                <th style={th}>งาน</th>
                <th style={th}>อัปเดตล่าสุด</th>
                <th style={th}>ขั้นตอน</th>
                <th style={th}>สถานะ</th>
                <th style={th}>หมายเหตุคุมงาน</th>
                <th style={th}>เปิด</th>
              </tr>
            </thead>
            <tbody>
              {loading?<tr><td colSpan={9} style={empty}>กำลังโหลด...</td></tr>:visible.length===0?<tr><td colSpan={9} style={empty}>ไม่มีงานในเงื่อนไขนี้</td></tr>:visible.map(r=>{
                const d=drafts[r.id]||{};
                const badge=r.isNew
                  ?{text:"งานใหม่",bg:"#dcfce7",color:"#166534"}
                  :r.kind==="old_updated"
                    ?{text:"งานเก่า • มีอัปเดต",bg:"#fef3c7",color:"#92400e"}
                    :{text:"งานเก่า",bg:"#f1f5f9",color:"#475569"};
                return <tr key={r.id} style={{borderTop:"1px solid #e5e7eb",background:r.isNew?"#fbfffc":"white"}}>
                  <td style={td}><input type="number" min="1" value={d.queue_order??""} onChange={e=>patch(r.id,"queue_order",e.target.value)} style={{...input,width:72,padding:"7px"}}/></td>
                  <td style={td}><span style={{display:"inline-block",padding:"4px 7px",borderRadius:999,background:badge.bg,color:badge.color,fontSize:11,fontWeight:900}}>{badge.text}</span><div style={{fontSize:11,color:"#94a3b8",marginTop:5}}>{fmt(r.updated_at)}</div></td>
                  <td style={td}><b style={{color:"#be185d"}}>{r.work_no}</b><div style={{fontWeight:800,marginTop:3}}>{r.customer_name||"รอระบุลูกค้า"}</div></td>
                  <td style={td}><div style={{fontWeight:800}}>{r.project_name||"ยังไม่ระบุชื่องาน"}</div>{r.revision_count>0&&<div style={{fontSize:11,color:"#7c3aed",marginTop:4}}>แก้ไข {r.revision_count} ครั้ง</div>}</td>
                  <td style={{...td,maxWidth:280}}><div style={{whiteSpace:"normal"}}>{r.latest?.summary||r.summary||"-"}</div>{r.latest?.created_at&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{fmt(r.latest.created_at)}</div>}</td>
                  <td style={td}><select value={d.workflow_stage||"รับงาน"} onChange={e=>patch(r.id,"workflow_stage",e.target.value)} style={{...input,minWidth:150,padding:"7px"}}>{STAGES.map(x=><option key={x}>{x}</option>)}</select></td>
                  <td style={td}><select value={d.status||"open"} onChange={e=>patch(r.id,"status",e.target.value)} style={{...input,minWidth:135,padding:"7px"}}>{STATUSES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                  <td style={td}><input value={d.coordinator_note||""} onChange={e=>patch(r.id,"coordinator_note",e.target.value)} placeholder="เช่น ด่วน / รอแบบ / นัดติดตั้ง" style={{...input,minWidth:210,padding:"7px"}}/></td>
                  <td style={td}><button style={openBtn} onClick={()=>router.push("/work-orders/"+r.id)}>เปิดงาน</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{position:"sticky",bottom:10,display:"flex",justifyContent:"flex-end",marginTop:12,pointerEvents:"none"}}>
        <button onClick={saveAll} disabled={saving} style={{...primary,pointerEvents:"auto",boxShadow:"0 6px 22px rgba(0,0,0,.18)",fontSize:16,padding:"12px 20px"}}>{saving?"กำลังบันทึก...":"💾 บันทึกทุกการแก้ไขครั้งเดียว"}</button>
      </div>
    </div>
  </main>
}

function Stat({label,value}){return <div style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:14}}><div style={{fontSize:12,color:"#6b7280"}}>{label}</div><div style={{fontSize:26,fontWeight:900,marginTop:4}}>{value}</div></div>}
const panel={background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:12};
const input={padding:"9px 10px",border:"1px solid #d1d5db",borderRadius:8,background:"white",boxSizing:"border-box"};
const primary={padding:"9px 13px",border:0,borderRadius:8,background:"#111827",color:"white",fontWeight:900,cursor:"pointer"};
const secondary={...primary,background:"white",color:"#111827",border:"1px solid #d1d5db"};
const openBtn={padding:"7px 9px",border:0,borderRadius:7,background:"#dbeafe",color:"#1d4ed8",fontWeight:900,cursor:"pointer"};
const th={padding:"10px 9px",textAlign:"left",fontSize:12,color:"#475569",whiteSpace:"nowrap"};
const td={padding:"10px 9px",verticalAlign:"top",fontSize:13};
const empty={padding:30,textAlign:"center",color:"#6b7280"};
