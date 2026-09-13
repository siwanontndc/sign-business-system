"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const TYPES = [
  ["artwork", "แบบงาน", "🖼️"],
  ["before_install", "ก่อนติดตั้ง", "📍"],
  ["during_install", "ระหว่างติดตั้ง", "🛠️"],
  ["after_install", "หลังติดตั้ง", "✅"],
];

export default function FieldworkPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [media, setMedia] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");

      const [{ data: jobRows, error: jobError }, { data: mediaRows, error: mediaError }] = await Promise.all([
        supabase.from("installation_jobs").select(`
          id,status,scheduled_at,started_at,completed_at,note,created_at,
          quotations(quotation_no,project_name,customers(customer_code,company_name,contact_name,phone))
        `).order("created_at", { ascending: false }),
        supabase.from("job_media").select("id,installation_job_id,media_type,source,created_at"),
      ]);
      if (jobError) throw jobError;
      if (mediaError) throw mediaError;
      setJobs(jobRows || []);
      setMedia(mediaRows || []);
    } catch (error) {
      console.error(error);
      setMessage("โหลดข้อมูลไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setLoading(false);
    }
  }

  function quote(job) { return job?.quotations || null; }
  function customer(job) {
    const c = quote(job)?.customers;
    return c?.company_name || c?.contact_name || c?.customer_code || "-";
  }
  function counts(jobId) {
    const out = { artwork: 0, before_install: 0, during_install: 0, after_install: 0, line: 0 };
    for (const item of media) if (item.installation_job_id === jobId) {
      out[item.media_type] = (out[item.media_type] || 0) + 1;
      if (item.source === "line") out.line += 1;
    }
    return out;
  }

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return jobs;
    return jobs.filter((job) => [quote(job)?.quotation_no, quote(job)?.project_name, customer(job), job.status]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(key)));
  }, [jobs, search]);

  const totals = useMemo(() => ({
    jobs: jobs.length,
    before: media.filter((m) => m.media_type === "before_install").length,
    after: media.filter((m) => m.media_type === "after_install").length,
    line: media.filter((m) => m.source === "line").length,
  }), [jobs, media]);

  if (loading) return <main style={s.loading}>กำลังโหลดศูนย์งานหน้างาน...</main>;

  return <main style={s.page}>
    <header style={s.header}>
      <div>
        <div style={s.eyebrow}>SIGN BUSINESS</div>
        <h1 style={s.h1}>ศูนย์สั่งงานและรูปหน้างาน</h1>
        <p style={s.sub}>รวมงานติดตั้ง รูปก่อนทำ–ระหว่างทำ–หลังทำ และรายงานไว้ที่เดียว</p>
      </div>
      <button style={s.darkBtn} onClick={() => router.push("/")}>🏠 หน้าหลัก</button>
    </header>

    <section style={s.stats}>
      <Stat label="งานทั้งหมด" value={totals.jobs} />
      <Stat label="รูปก่อนทำ" value={totals.before} />
      <Stat label="รูปหลังทำ" value={totals.after} />
      <Stat label="รับจาก LINE" value={totals.line} />
    </section>

    <section style={s.guide}>
      <div style={{fontSize:28}}>💬</div>
      <div style={{flex:1}}>
        <b>ส่งรูปจาก LINE กลุ่มเข้าระบบอัตโนมัติ</b>
        <div style={s.guideText}>ก่อนส่งรูป พิมพ์ <code>#งาน เลขใบเสนอราคา ก่อน</code> หรือเปลี่ยนคำท้ายเป็น <code>ระหว่าง</code> / <code>หลัง</code> แล้วส่งรูปได้ต่อเนื่อง เมื่อเสร็จพิมพ์ <code>#ปิดงาน</code></div>
      </div>
    </section>

    <section style={s.card}>
      <input style={s.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขงาน / ลูกค้า / ชื่องาน / สถานะ" />
      {message && <div style={s.message}>{message}</div>}
      <div style={s.list}>
        {filtered.map((job) => {
          const c = counts(job.id);
          const q = quote(job);
          const missingAfter = c.before_install > 0 && c.after_install === 0;
          return <article key={job.id} style={s.job}>
            <div style={s.jobTop}>
              <div>
                <div style={s.jobNo}>{q?.quotation_no || "ไม่มีเลขใบเสนอราคา"}</div>
                <div style={s.customer}>{customer(job)}</div>
                <div style={s.project}>{q?.project_name || "ไม่ระบุชื่องาน"}</div>
              </div>
              <span style={s.status}>{job.status || "ไม่ระบุสถานะ"}</span>
            </div>

            <div style={s.typeGrid}>
              {TYPES.map(([key,label,icon]) => <div key={key} style={s.typeBox}><span>{icon}</span><b>{c[key] || 0}</b><small>{label}</small></div>)}
            </div>

            {missingAfter && <div style={s.warning}>⚠️ มีรูปก่อนทำแล้ว แต่ยังไม่มีรูปหลังทำ</div>}
            {c.line > 0 && <div style={s.lineBadge}>LINE {c.line} รูป</div>}

            <div style={s.actions}>
              <button style={s.primaryBtn} onClick={() => router.push(`/job-media?job=${job.id}`)}>📷 เพิ่ม/ดูรูป</button>
              <button style={s.secondaryBtn} onClick={() => router.push(`/fieldwork/${job.id}/report`)}>📄 รายงาน Before/After</button>
            </div>
          </article>;
        })}
        {!filtered.length && <div style={s.empty}>ไม่พบงานที่ค้นหา</div>}
      </div>
    </section>
  </main>;
}

function Stat({ label, value }) {
  return <div style={s.stat}><div style={s.statValue}>{value}</div><div style={s.statLabel}>{label}</div></div>;
}

const s = {
  page:{minHeight:"100vh",background:"#f4f5f7",padding:"22px",color:"#111827",fontFamily:"Arial,'Noto Sans Thai',sans-serif"},
  loading:{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial,'Noto Sans Thai',sans-serif"},
  header:{maxWidth:1180,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",gap:16,alignItems:"center"},
  eyebrow:{fontSize:12,fontWeight:800,letterSpacing:2,color:"#db2777"},h1:{margin:"4px 0",fontSize:"clamp(26px,4vw,42px)"},sub:{margin:0,color:"#6b7280"},
  darkBtn:{border:0,borderRadius:12,background:"#111827",color:"white",padding:"12px 16px",fontWeight:800,cursor:"pointer"},
  stats:{maxWidth:1180,margin:"0 auto 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12},
  stat:{background:"white",borderRadius:16,padding:18,border:"1px solid #e5e7eb"},statValue:{fontSize:28,fontWeight:900},statLabel:{color:"#6b7280",fontSize:13},
  guide:{maxWidth:1180,margin:"0 auto 16px",background:"#fff1f7",border:"1px solid #f9a8d4",borderRadius:16,padding:16,display:"flex",gap:14,alignItems:"flex-start"},guideText:{marginTop:6,lineHeight:1.65,color:"#4b5563"},
  card:{maxWidth:1180,margin:"0 auto",background:"white",border:"1px solid #e5e7eb",borderRadius:18,padding:16},
  input:{width:"100%",boxSizing:"border-box",border:"1px solid #d1d5db",borderRadius:12,padding:"13px 14px",fontSize:16,outline:"none"},message:{marginTop:10,color:"#b91c1c"},
  list:{display:"grid",gap:14,marginTop:16},job:{border:"1px solid #e5e7eb",borderRadius:16,padding:16,background:"#fff"},jobTop:{display:"flex",justifyContent:"space-between",gap:12},jobNo:{fontWeight:900,color:"#db2777"},customer:{fontSize:20,fontWeight:900,marginTop:3},project:{color:"#6b7280",marginTop:2},status:{height:"fit-content",background:"#111827",color:"white",borderRadius:999,padding:"6px 10px",fontSize:12,fontWeight:800},
  typeGrid:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginTop:14},typeBox:{background:"#f9fafb",borderRadius:12,padding:10,textAlign:"center",display:"grid",gap:2},warning:{marginTop:10,background:"#fff7ed",color:"#9a3412",padding:"9px 11px",borderRadius:10,fontWeight:700},lineBadge:{display:"inline-block",marginTop:10,background:"#dcfce7",color:"#166534",padding:"5px 9px",borderRadius:999,fontSize:12,fontWeight:800},
  actions:{display:"flex",gap:8,flexWrap:"wrap",marginTop:14},primaryBtn:{border:0,borderRadius:10,background:"#db2777",color:"white",padding:"11px 14px",fontWeight:800,cursor:"pointer"},secondaryBtn:{border:"1px solid #d1d5db",borderRadius:10,background:"white",padding:"11px 14px",fontWeight:800,cursor:"pointer"},empty:{padding:30,textAlign:"center",color:"#6b7280"},
};
