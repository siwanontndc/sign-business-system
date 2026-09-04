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
    if (String(role || "").trim().toLowerCase() !== "owner") return router.replace("/");

    const [{ data: qs, error }, { data: ms, error: metricError }] = await Promise.all([
      supabase.from("quotations").select(`id,quotation_no,project_name,grand_total,quotation_date,status,customers(company_name,contact_name),production_jobs(id,status,started_at,completed_at,qc_jobs(id,status,checked_at,installation_jobs(id,status,scheduled_at,started_at,completed_at,delivery_jobs(id,status,delivered_at,closed_at)))`).order("created_at", { ascending: false }),
      supabase.from("job_metrics").select("*")
    ]);
    if (error) setMessage("โหลดข้อมูลงานไม่สำเร็จ: " + error.message);
    else if (metricError) setMessage("โหลดข้อมูล KPI ไม่สำเร็จ: " + metricError.message);
    const map = {};
    (ms || []).forEach(m => { map[m.quotation_id] = m; });
    setRows(qs || []);
    setMetrics(map);
    setLoading(false);
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
    const risk = kpi < 60 || (days > 0 && progress < 100) || (margin !== null && margin < 10);
    return { m,p,qc,ins,del,progress,cost,revenue,profit,margin,days,kpi,risk };
  }

  const computed = useMemo(() => rows.map(q => ({ q, ...calc(q) })), [rows, metrics]);
  const summary = useMemo(() => {
    const total = computed.length;
    const active = computed.filter(x=>x.progress<100 && x.p).length;
    const late = computed.filter(x=>x.days>0 && x.progress<100).length;
    const closed = computed.filter(x=>x.progress===100).length;
    const risk = computed.filter(x=>x.risk).length;
    const revenue = computed.reduce((a,x)=>a+x.revenue,0);
    const cost = computed.reduce((a,x)=>a+x.cost,0);
    const avgKpi = total ? Math.round(computed.reduce((a,x)=>a+x.kpi,0)/total) : 0;
    const avgProgress = total ? Math.round(computed.reduce((a,x)=>a+x.progress,0)/total) : 0;
    return { total,active,late,closed,risk,revenue,cost,profit:revenue-cost,avgKpi,avgProgress };
  }, [computed]);

  const riskJobs = useMemo(() => [...computed].sort((a,b) => a.kpi-b.kpi || (b.days||0)-(a.days||0)).slice(0,6), [computed]);

  async function save(q) {
    const m = metrics[q.id] || {};
    const payload = {
      quotation_id:q.id,
      due_date:m.due_date||null,
      estimated_cost:Number(m.estimated_cost||0),
      actual_material_cost:Number(m.actual_material_cost||0),
      actual_labor_cost:Number(m.actual_labor_cost||0),
      actual_installation_cost:Number(m.actual_installation_cost||0),
      actual_travel_cost:Number(m.actual_travel_cost||0),
      actual_outsource_cost:Number(m.actual_outsource_cost||0),
      other_cost:Number(m.other_cost||0),
      labor_hours:Number(m.labor_hours||0),
      note:m.note||null,
      updated_at:new Date().toISOString()
    };
    const { data, error } = await supabase.from("job_metrics").upsert(payload,{onConflict:"quotation_id"}).select().single();
    if (error) return setMessage("บันทึกไม่สำเร็จ: "+error.message);
    setMetrics(prev=>({...prev,[q.id]:data}));
    setMessage("✓ บันทึกต้นทุนและกำหนดส่งแล้ว");
  }

  const setField = (id,k,v) => setMetrics(prev=>({...prev,[id]:{...(prev[id]||{}),quotation_id:id,[k]:v}}));
  if (loading) return <main style={S.load}>กำลังคำนวณ KPI...</main>;

  return <main style={S.page}>
    <header style={S.head}>
      <div><div style={S.eye}>OWNER ONLY</div><h1 style={{margin:"4px 0"}}>📊 KPI / วิเคราะห์งาน</h1><div style={S.muted}>สรุปผู้บริหาร • ความคืบหน้า • กำไร • เวลา • คุณภาพ</div></div>
      <button style={S.btn2} onClick={()=>router.push("/")}>🏠 หน้าหลัก</button>
    </header>

    <section style={S.stats}>
      {[["งานทั้งหมด",summary.total],["กำลังดำเนินการ",summary.active],["งานช้า",summary.late],["งานเสี่ยง",summary.risk],["ปิดงาน",summary.closed],["KPI เฉลี่ย",summary.avgKpi+"/100"],["ยอดขาย",money(summary.revenue)],["กำไรขั้นต้น*",money(summary.profit)]].map(([a,b])=><div style={S.stat} key={a}><small>{a}</small><strong>{b}</strong></div>)}
    </section>

    {message && <div style={S.msg}>{message}</div>}

    <section style={S.chartGrid}>
      <div style={S.card}>
        <h2 style={S.h2}>ความคืบหน้าเฉลี่ย</h2>
        <BigBar value={summary.avgProgress} label={`${summary.avgProgress}%`} />
        <div style={S.legend}><span>เปิดงาน</span><span>ผลิต</span><span>QC</span><span>ติดตั้ง</span><span>ปิดงาน</span></div>
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>สัดส่วนสถานะงาน</h2>
        <MetricBar label="ปิดงานแล้ว" value={summary.total ? summary.closed/summary.total*100 : 0} text={`${summary.closed} งาน`} />
        <MetricBar label="กำลังทำ" value={summary.total ? summary.active/summary.total*100 : 0} text={`${summary.active} งาน`} />
        <MetricBar label="งานช้า" value={summary.total ? summary.late/summary.total*100 : 0} text={`${summary.late} งาน`} />
        <MetricBar label="งานเสี่ยง" value={summary.total ? summary.risk/summary.total*100 : 0} text={`${summary.risk} งาน`} />
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>กำไรเทียบยอดขาย</h2>
        <MetricBar label="ยอดขาย" value={100} text={money(summary.revenue)} />
        <MetricBar label="ต้นทุนที่กรอกแล้ว" value={summary.revenue ? summary.cost/summary.revenue*100 : 0} text={money(summary.cost)} />
        <MetricBar label="กำไรขั้นต้น" value={summary.revenue ? Math.max(0,summary.profit/summary.revenue*100) : 0} text={money(summary.profit)} />
        <div style={S.muted}>*กำไรจะแม่นเมื่อกรอกต้นทุนจริงของแต่ละงานครบ</div>
      </div>
    </section>

    <section style={S.cardWide}>
      <h2 style={S.h2}>⚠️ งานที่ควรจับตาก่อน</h2>
      <div style={S.riskGrid}>{riskJobs.map(x => <div key={x.q.id} style={S.riskCard}>
        <div><b>{x.q.quotation_no}</b><div style={S.muted}>{x.q.project_name||"ไม่ระบุชื่องาน"}</div></div>
        <Score value={x.kpi} />
        <div style={{fontSize:13}}>คืบหน้า <b>{x.progress}%</b> • {x.days===null?"ยังไม่กำหนดวันส่ง":x.days>0?`ช้า ${x.days} วัน`:x.days<0?`เร็ว ${Math.abs(x.days)} วัน`:"ตรงเวลา"}</div>
        <MiniBar value={x.progress} />
        <div style={{fontSize:13}}>Margin: <b>{x.margin===null?"ยังไม่กรอกต้นทุน":`${x.margin.toFixed(1)}%`}</b></div>
      </div>)}</div>
    </section>

    <section style={S.cardWide}>
      <h2 style={S.h2}>ประเมินรายงานทั้งหมด</h2>
      <div style={{overflowX:"auto"}}><table style={S.table}><thead><tr><th>งาน</th><th>ความคืบหน้า</th><th>กำหนดส่ง</th><th>เร็ว/ช้า</th><th>ขาย</th><th>ต้นทุนจริง</th><th>กำไร</th><th>Margin</th><th>KPI</th></tr></thead><tbody>{computed.map(x=><tr key={x.q.id}>
        <td><b>{x.q.quotation_no}</b><br/><small>{x.q.project_name||"-"}</small></td>
        <td><MiniBar value={x.progress}/><small>{x.progress}%</small></td>
        <td>{x.m.due_date||"ยังไม่กำหนด"}</td>
        <td>{x.days===null?"-":x.days>0?`ช้า ${x.days} วัน`:x.days<0?`เร็ว ${Math.abs(x.days)} วัน`:"ตรงเวลา"}</td>
        <td>{money(x.revenue)}</td><td>{x.cost?money(x.cost):"ยังไม่กรอก"}</td><td>{x.cost?money(x.profit):"-"}</td><td>{x.margin===null?"-":`${x.margin.toFixed(1)}%`}</td><td><Score value={x.kpi}/></td>
      </tr>)}</tbody></table></div>
    </section>

    <section style={S.cardWide}>
      <h2 style={S.h2}>กรอกกำหนดส่งและต้นทุนจริง</h2>
      {rows.map(q=>{const m=metrics[q.id]||{};return <details key={q.id} style={S.detail}><summary><b>{q.quotation_no}</b> — {q.project_name||"ไม่ระบุชื่องาน"}</summary>
        <div style={S.grid}>
          <Field label="กำหนดส่ง" type="date" value={m.due_date||""} onChange={v=>setField(q.id,"due_date",v)}/>
          <Field label="ต้นทุนประมาณการ" value={m.estimated_cost||""} onChange={v=>setField(q.id,"estimated_cost",v)}/>
          <Field label="วัสดุจริง" value={m.actual_material_cost||""} onChange={v=>setField(q.id,"actual_material_cost",v)}/>
          <Field label="ค่าแรงจริง" value={m.actual_labor_cost||""} onChange={v=>setField(q.id,"actual_labor_cost",v)}/>
          <Field label="ค่าติดตั้ง" value={m.actual_installation_cost||""} onChange={v=>setField(q.id,"actual_installation_cost",v)}/>
          <Field label="ค่าเดินทาง" value={m.actual_travel_cost||""} onChange={v=>setField(q.id,"actual_travel_cost",v)}/>
          <Field label="Outsource" value={m.actual_outsource_cost||""} onChange={v=>setField(q.id,"actual_outsource_cost",v)}/>
          <Field label="อื่นๆ" value={m.other_cost||""} onChange={v=>setField(q.id,"other_cost",v)}/>
          <Field label="ชั่วโมงแรงงาน" value={m.labor_hours||""} onChange={v=>setField(q.id,"labor_hours",v)}/>
        </div>
        <button style={S.btn} onClick={()=>save(q)}>💾 บันทึกต้นทุน / กำหนดส่ง</button>
      </details>})}
    </section>
  </main>;
}

function Field({label,value,onChange,type="number"}){return <label style={{display:"grid",gap:5,fontSize:13,fontWeight:700}}>{label}<input style={S.input} type={type} min={type==="number"?0:undefined} step={type==="number"?"0.01":undefined} value={value} onChange={e=>onChange(e.target.value)}/></label>}
function MiniBar({value}){return <div style={S.miniTrack}><div style={{...S.miniFill,width:`${clamp(value,0,100)}%`}}/></div>}
function BigBar({value,label}){return <div style={S.bigTrack}><div style={{...S.bigFill,width:`${clamp(value,0,100)}%`}}><span>{label}</span></div></div>}
function MetricBar({label,value,text}){return <div style={{marginBottom:12}}><div style={S.metricHead}><span>{label}</span><b>{text}</b></div><MiniBar value={value}/></div>}
function Score({value}){const bg=value>=90?"#dcfce7":value>=75?"#dbeafe":value>=60?"#fef3c7":"#fee2e2";const fg=value>=90?"#166534":value>=75?"#1d4ed8":value>=60?"#92400e":"#b91c1c";return <span style={{background:bg,color:fg,padding:"5px 9px",borderRadius:999,fontWeight:900,fontSize:12,whiteSpace:"nowrap"}}>{value}/100</span>}

const S={
  page:{minHeight:"100vh",background:"#f4f6f8",padding:"24px 24px 90px",color:"#111827",fontFamily:"Arial,sans-serif"},
  load:{minHeight:"100vh",display:"grid",placeItems:"center"},
  head:{maxWidth:1400,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:14},
  eye:{fontSize:12,fontWeight:900,color:"#d10073"},muted:{color:"#6b7280",fontSize:13},
  stats:{maxWidth:1400,margin:"0 auto 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12},
  stat:{background:"white",borderRadius:16,padding:16,boxShadow:"0 4px 14px #0000000d",display:"grid",gap:8},
  chartGrid:{maxWidth:1400,margin:"0 auto 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14},
  card:{background:"white",borderRadius:18,padding:18,boxShadow:"0 4px 14px #0000000d"},
  cardWide:{maxWidth:1400,margin:"0 auto 16px",background:"white",borderRadius:18,padding:18,boxShadow:"0 4px 14px #0000000d"},
  h2:{margin:"0 0 14px",fontSize:18},
  bigTrack:{height:34,background:"#e5e7eb",borderRadius:99,overflow:"hidden",margin:"16px 0"},
  bigFill:{height:"100%",minWidth:34,background:"linear-gradient(90deg,#111827,#d10073)",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:10,color:"white",fontWeight:900,fontSize:12},
  miniTrack:{height:9,background:"#e5e7eb",borderRadius:99,overflow:"hidden",minWidth:100},miniFill:{height:"100%",background:"linear-gradient(90deg,#111827,#d10073)",borderRadius:99},
  metricHead:{display:"flex",justifyContent:"space-between",gap:10,fontSize:13,marginBottom:5},legend:{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6b7280"},
  riskGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12},riskCard:{border:"1px solid #e5e7eb",borderRadius:14,padding:14,display:"grid",gap:10},
  table:{width:"100%",borderCollapse:"collapse",fontSize:13},detail:{borderTop:"1px solid #e5e7eb",padding:"14px 0"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,margin:"14px 0"},
  input:{padding:"10px 11px",border:"1px solid #d1d5db",borderRadius:10,fontSize:14},
  btn:{background:"#111827",color:"white",border:0,borderRadius:10,padding:"11px 15px",fontWeight:800,cursor:"pointer"},
  btn2:{background:"white",border:"1px solid #d1d5db",borderRadius:10,padding:"10px 14px",fontWeight:800,cursor:"pointer"},
  msg:{maxWidth:1400,margin:"0 auto 14px",background:"#ecfdf5",padding:12,borderRadius:12,color:"#047857"}
};
