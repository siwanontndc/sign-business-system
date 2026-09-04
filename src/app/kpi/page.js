"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const money = (n) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(n || 0));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export default function KpiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    const { data: role } = await supabase.rpc("current_user_role");
    if (role !== "owner") return router.replace("/");

    const [{ data: qs, error }, { data: ms }] = await Promise.all([
      supabase.from("quotations").select(`id,quotation_no,project_name,grand_total,quotation_date,status,customers(company_name,contact_name),production_jobs(id,status,started_at,completed_at,qc_jobs(id,status,checked_at,installation_jobs(id,status,scheduled_at,started_at,completed_at,delivery_jobs(id,status,delivered_at,closed_at)))`).order("created_at", { ascending: false }),
      supabase.from("job_metrics").select("*")
    ]);
    if (error) setMessage(error.message);
    const map = {};
    (ms || []).forEach(m => { map[m.quotation_id] = m; });
    setRows(qs || []); setMetrics(map); setLoading(false);
  }

  function calc(q) {
    const m = metrics[q.id] || {};
    const p = q.production_jobs?.[0];
    const qc = p?.qc_jobs?.[0];
    const ins = qc?.installation_jobs?.[0];
    const del = ins?.delivery_jobs?.[0];
    let progress = 10;
    if (p) progress = 25;
    if (p?.completed_at || qc) progress = 50;
    if (qc?.status === "passed" || ins) progress = 65;
    if (ins?.completed_at || del) progress = 85;
    if (del?.closed_at || del?.status === "closed") progress = 100;

    const cost = [m.actual_material_cost,m.actual_labor_cost,m.actual_installation_cost,m.actual_travel_cost,m.actual_outsource_cost,m.other_cost].reduce((a,b)=>a+Number(b||0),0);
    const revenue = Number(q.grand_total || 0);
    const profit = revenue - cost;
    const margin = revenue > 0 && cost > 0 ? (profit / revenue) * 100 : null;
    const due = m.due_date ? new Date(m.due_date + "T23:59:59") : null;
    const finished = del?.closed_at ? new Date(del.closed_at) : null;
    const compare = finished || new Date();
    const days = due ? Math.ceil((compare - due) / 86400000) : null;
    const timeScore = days === null ? 15 : days <= 0 ? 25 : clamp(25 - days * 4, 0, 25);
    const profitScore = margin === null ? 15 : margin >= 30 ? 30 : margin >= 20 ? 25 : margin >= 10 ? 18 : margin >= 0 ? 10 : 0;
    const progressScore = progress * .25;
    const qcScore = qc?.status === "passed" ? 10 : qc?.status === "failed" ? 2 : 6;
    const docScore = del?.closed_at ? 10 : ins?.completed_at ? 7 : p ? 4 : 2;
    const kpi = Math.round(progressScore + timeScore + profitScore + qcScore + docScore);
    return { m,p,qc,ins,del,progress,cost,revenue,profit,margin,days,kpi };
  }

  const summary = useMemo(() => {
    const c = rows.map(calc);
    return { total:c.length, active:c.filter(x=>x.progress<100 && x.p).length, late:c.filter(x=>x.days>0 && x.progress<100).length, closed:c.filter(x=>x.progress===100).length, revenue:c.reduce((a,x)=>a+x.revenue,0), cost:c.reduce((a,x)=>a+x.cost,0) };
  }, [rows, metrics]);

  async function save(q) {
    const m = metrics[q.id] || {};
    const payload = { quotation_id:q.id, due_date:m.due_date||null, estimated_cost:Number(m.estimated_cost||0), actual_material_cost:Number(m.actual_material_cost||0), actual_labor_cost:Number(m.actual_labor_cost||0), actual_installation_cost:Number(m.actual_installation_cost||0), actual_travel_cost:Number(m.actual_travel_cost||0), actual_outsource_cost:Number(m.actual_outsource_cost||0), other_cost:Number(m.other_cost||0), labor_hours:Number(m.labor_hours||0), note:m.note||null, updated_at:new Date().toISOString() };
    const { data, error } = await supabase.from("job_metrics").upsert(payload,{onConflict:"quotation_id"}).select().single();
    if (error) return setMessage("บันทึกไม่สำเร็จ: "+error.message);
    setMetrics(prev=>({...prev,[q.id]:data})); setMessage("✓ บันทึกต้นทุนและกำหนดส่งแล้ว");
  }

  const setField = (id,k,v) => setMetrics(prev=>({...prev,[id]:{...(prev[id]||{}),quotation_id:id,[k]:v}}));
  if (loading) return <main style={S.load}>กำลังคำนวณ KPI...</main>;

  return <main style={S.page}>
    <header style={S.head}><div><div style={S.eye}>OWNER ONLY</div><h1 style={{margin:"4px 0"}}>📊 KPI / วิเคราะห์งาน</h1><div style={S.muted}>ความคืบหน้า • กำไร • ตรงเวลา • คุณภาพ</div></div><button style={S.btn2} onClick={()=>router.push("/")}>🏠 หน้าหลัก</button></header>
    <section style={S.stats}>{[["งานทั้งหมด",summary.total],["กำลังดำเนินการ",summary.active],["งานช้า",summary.late],["ปิดงาน",summary.closed],["ยอดขาย",money(summary.revenue)],["กำไรขั้นต้น*",money(summary.revenue-summary.cost)]].map(([a,b])=><div style={S.stat} key={a}><small>{a}</small><strong>{b}</strong></div>)}</section>
    {message && <div style={S.msg}>{message}</div>}
    <section style={S.card}><h2>ภาพรวมสถานะงาน</h2><div style={S.bar}><span style={{width:`${summary.total?summary.closed/summary.total*100:0}%`}} /></div><div style={S.muted}>ปิดงานแล้ว {summary.closed} จาก {summary.total} งาน • *กำไรจะแม่นเมื่อกรอกต้นทุนจริงครบ</div></section>
    <section style={S.card}><h2>ประเมินรายงาน</h2><div style={{overflowX:"auto"}}><table style={S.table}><thead><tr><th>งาน</th><th>ความคืบหน้า</th><th>กำหนดส่ง</th><th>เร็ว/ช้า</th><th>ขาย</th><th>ต้นทุนจริง</th><th>กำไร</th><th>Margin</th><th>KPI</th></tr></thead><tbody>{rows.map(q=>{const x=calc(q);return <tr key={q.id}><td><b>{q.quotation_no}</b><br/><small>{q.project_name||"-"}</small></td><td>{x.progress}%</td><td>{x.m.due_date||"ยังไม่กำหนด"}</td><td>{x.days===null?"-":x.days>0?`ช้า ${x.days} วัน`:x.days<0?`เร็ว ${Math.abs(x.days)} วัน`:"ตรงเวลา"}</td><td>{money(x.revenue)}</td><td>{x.cost?money(x.cost):"ยังไม่กรอก"}</td><td>{x.cost?money(x.profit):"-"}</td><td>{x.margin===null?"-":`${x.margin.toFixed(1)}%`}</td><td><b>{x.kpi}/100</b></td></tr>})}</tbody></table></div></section>
    <section style={S.card}><h2>กรอกกำหนดส่งและต้นทุนจริง</h2>{rows.map(q=>{const m=metrics[q.id]||{};return <details key={q.id} style={S.detail}><summary><b>{q.quotation_no}</b> — {q.project_name||"ไม่ระบุชื่องาน"}</summary><div style={S.grid}><Field label="กำหนดส่ง" type="date" value={m.due_date||""} onChange={v=>setField(q.id,"due_date",v)}/><Field label="ต้นทุนประมาณการ" value={m.estimated_cost||""} onChange={v=>setField(q.id,"estimated_cost",v)}/><Field label="วัสดุจริง" value={m.actual_material_cost||""} onChange={v=>setField(q.id,"actual_material_cost",v)}/><Field label="ค่าแรงจริง" value={m.actual_labor_cost||""} onChange={v=>setField(q.id,"actual_labor_cost",v)}/><Field label="ค่าติดตั้ง" value={m.actual_installation_cost||""} onChange={v=>setField(q.id,"actual_installation_cost",v)}/><Field label="ค่าเดินทาง" value={m.actual_travel_cost||""} onChange={v=>setField(q.id,"actual_travel_cost",v)}/><Field label="Outsource" value={m.actual_outsource_cost||""} onChange={v=>setField(q.id,"actual_outsource_cost",v)}/><Field label="อื่นๆ" value={m.other_cost||""} onChange={v=>setField(q.id,"other_cost",v)}/><Field label="ชั่วโมงแรงงาน" value={m.labor_hours||""} onChange={v=>setField(q.id,"labor_hours",v)}/></div><button style={S.btn} onClick={()=>save(q)}>💾 บันทึกต้นทุน / กำหนดส่ง</button></details>})}</section>
  </main>;
}
function Field({label,value,onChange,type="number"}){return <label style={{display:"grid",gap:5,fontSize:13,fontWeight:700}}>{label}<input style={S.input} type={type} min={type==="number"?0:undefined} step="0.01" value={value} onChange={e=>onChange(e.target.value)}/></label>}
const S={page:{minHeight:"100vh",background:"#f4f6f8",padding:24,color:"#111827",fontFamily:"Arial,sans-serif"},load:{minHeight:"100vh",display:"grid",placeItems:"center"},head:{maxWidth:1400,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",alignItems:"center"},eye:{fontSize:12,fontWeight:900,color:"#d10073"},muted:{color:"#6b7280",fontSize:13},stats:{maxWidth:1400,margin:"0 auto 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12},stat:{background:"white",borderRadius:16,padding:16,boxShadow:"0 4px 14px #0000000d",display:"grid",gap:8},card:{maxWidth:1400,margin:"0 auto 16px",background:"white",borderRadius:18,padding:18,boxShadow:"0 4px 14px #0000000d"},bar:{height:18,background:"#e5e7eb",borderRadius:99,overflow:"hidden",margin:"12px 0"},table:{width:"100%",borderCollapse:"collapse",fontSize:13},detail:{borderTop:"1px solid #e5e7eb",padding:"14px 0"},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,margin:"14px 0"},input:{padding:"10px 11px",border:"1px solid #d1d5db",borderRadius:10,fontSize:14},btn:{background:"#111827",color:"white",border:0,borderRadius:10,padding:"11px 15px",fontWeight:800,cursor:"pointer"},btn2:{background:"white",border:"1px solid #d1d5db",borderRadius:10,padding:"10px 14px",fontWeight:800,cursor:"pointer"},msg:{maxWidth:1400,margin:"0 auto 14px",background:"#ecfdf5",padding:12,borderRadius:12,color:"#047857"}};
