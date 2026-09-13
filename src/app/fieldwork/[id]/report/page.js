"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const sections = [
  ["before_install", "ภาพก่อนดำเนินงาน"],
  ["during_install", "ภาพระหว่างดำเนินงาน"],
  ["after_install", "ภาพหลังดำเนินงาน"],
];

export default function FieldworkReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const [{ data: jobRow, error: jobError }, { data: mediaRows, error: mediaError }] = await Promise.all([
        supabase.from("installation_jobs").select(`
          id,status,scheduled_at,started_at,completed_at,note,created_at,
          quotations(quotation_no,project_name,customers(customer_code,company_name,contact_name,phone,address))
        `).eq("id", id).single(),
        supabase.from("job_media").select("*").eq("installation_job_id", id).order("created_at", { ascending: true }),
      ]);
      if (jobError) throw jobError;
      if (mediaError) throw mediaError;
      setJob(jobRow);
      setMedia(mediaRows || []);
    } catch (e) {
      setError(e?.message || "โหลดรายงานไม่สำเร็จ");
    } finally { setLoading(false); }
  }

  const q = job?.quotations;
  const c = q?.customers;
  const customer = c?.company_name || c?.contact_name || c?.customer_code || "-";
  const grouped = useMemo(() => Object.fromEntries(sections.map(([key]) => [key, media.filter((m) => m.media_type === key)])), [media]);

  function imageUrl(item) {
    return supabase.storage.from("job-media").getPublicUrl(item.storage_path).data.publicUrl;
  }
  function fmt(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" });
  }

  if (loading) return <main style={s.loading}>กำลังสร้างรายงาน...</main>;
  if (error || !job) return <main style={s.loading}>{error || "ไม่พบงาน"}</main>;

  return <main style={s.shell}>
    <div style={s.toolbar} className="no-print">
      <button style={s.secondary} onClick={() => router.push("/fieldwork")}>← กลับศูนย์งาน</button>
      <button style={s.primary} onClick={() => window.print()}>🖨️ พิมพ์ / บันทึก PDF</button>
    </div>

    <article style={s.paper}>
      <header style={s.reportHeader}>
        <div>
          <div style={s.brand}>THANEE ADVERTISING</div>
          <h1 style={s.h1}>รายงานการปฏิบัติงานหน้างาน</h1>
          <div style={s.muted}>Fieldwork Before / During / After Report</div>
        </div>
        <div style={s.jobNo}>{q?.quotation_no || "JOB"}</div>
      </header>

      <section style={s.infoGrid}>
        <Info label="ลูกค้า" value={customer} />
        <Info label="ชื่องาน" value={q?.project_name || "-"} />
        <Info label="โทรศัพท์" value={c?.phone || "-"} />
        <Info label="สถานะ" value={job.status || "-"} />
        <Info label="กำหนดติดตั้ง" value={fmt(job.scheduled_at)} />
        <Info label="เสร็จงาน" value={fmt(job.completed_at)} />
      </section>

      {c?.address && <section style={s.note}><b>สถานที่/ที่อยู่:</b> {c.address}</section>}
      {job.note && <section style={s.note}><b>หมายเหตุงาน:</b> {job.note}</section>}

      {sections.map(([key,title]) => <section key={key} style={s.section}>
        <div style={s.sectionTitle}><span>{title}</span><span style={s.count}>{grouped[key]?.length || 0} รูป</span></div>
        {grouped[key]?.length ? <div style={s.grid}>
          {grouped[key].map((item, index) => <figure key={item.id} style={s.figure}>
            <img src={imageUrl(item)} alt={`${title} ${index+1}`} style={s.image} />
            <figcaption style={s.caption}>
              <span>{item.source === "line" ? "LINE" : "APP"} • {fmt(item.captured_at || item.created_at)}</span>
              {item.note && <span>{item.note}</span>}
            </figcaption>
          </figure>)}
        </div> : <div style={s.empty}>ยังไม่มีภาพในหมวดนี้</div>}
      </section>)}

      <footer style={s.footer}>
        <div>ผู้จัดทำรายงาน ______________________________</div>
        <div>ผู้ตรวจรับงาน ______________________________</div>
      </footer>
    </article>

    <style jsx global>{`
      @media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 10mm; }
      }
    `}</style>
  </main>;
}

function Info({ label, value }) {
  return <div style={s.info}><div style={s.label}>{label}</div><div style={s.value}>{value}</div></div>;
}

const s = {
  shell:{minHeight:"100vh",background:"#e5e7eb",padding:"20px",fontFamily:"Arial,'Noto Sans Thai',sans-serif",color:"#111827"},loading:{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial,'Noto Sans Thai',sans-serif"},
  toolbar:{maxWidth:900,margin:"0 auto 12px",display:"flex",justifyContent:"space-between",gap:10},primary:{border:0,borderRadius:10,background:"#db2777",color:"white",padding:"11px 15px",fontWeight:800,cursor:"pointer"},secondary:{border:0,borderRadius:10,background:"#111827",color:"white",padding:"11px 15px",fontWeight:800,cursor:"pointer"},
  paper:{maxWidth:900,margin:"0 auto",background:"white",padding:"28px",boxShadow:"0 12px 30px rgba(0,0,0,.12)"},reportHeader:{display:"flex",justifyContent:"space-between",gap:16,borderBottom:"3px solid #111827",paddingBottom:16},brand:{fontSize:12,fontWeight:900,letterSpacing:2,color:"#db2777"},h1:{margin:"4px 0",fontSize:28},muted:{color:"#6b7280",fontSize:12},jobNo:{fontSize:20,fontWeight:900},
  infoGrid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:18},info:{border:"1px solid #e5e7eb",borderRadius:10,padding:10},label:{fontSize:11,color:"#6b7280",fontWeight:800},value:{fontSize:15,fontWeight:800,marginTop:3},note:{marginTop:10,padding:10,background:"#f9fafb",borderRadius:10,lineHeight:1.6},
  section:{marginTop:24,pageBreakInside:"avoid"},sectionTitle:{display:"flex",justifyContent:"space-between",fontSize:18,fontWeight:900,borderBottom:"1px solid #d1d5db",paddingBottom:8},count:{fontSize:12,background:"#f3f4f6",padding:"4px 8px",borderRadius:999},grid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginTop:12},figure:{margin:0,border:"1px solid #e5e7eb",borderRadius:10,overflow:"hidden",pageBreakInside:"avoid"},image:{display:"block",width:"100%",aspectRatio:"4 / 3",objectFit:"cover",background:"#f3f4f6"},caption:{display:"grid",gap:3,padding:8,fontSize:10,color:"#4b5563"},empty:{padding:20,textAlign:"center",color:"#9ca3af",background:"#f9fafb",marginTop:10,borderRadius:10},footer:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:30,marginTop:34,paddingTop:20,borderTop:"1px solid #d1d5db",fontSize:12},
};
