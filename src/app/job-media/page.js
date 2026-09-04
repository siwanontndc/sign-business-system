"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const MEDIA_TYPES = [
  { key: "artwork", label: "แบบงาน", icon: "🖼️", accept: "image/*,application/pdf" },
  { key: "before_install", label: "รูปก่อนติดตั้ง", icon: "📍", accept: "image/*" },
  { key: "after_install", label: "รูปหลังติดตั้ง", icon: "✅", accept: "image/*" },
];

export default function JobMediaPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedType, setSelectedType] = useState("before_install");
  const [media, setMedia] = useState([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (selectedJobId) loadMedia(selectedJobId);
    else setMedia([]);
  }, [selectedJobId]);

  async function initialize() {
    setLoading(true);
    setMessage("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("installation_jobs")
        .select(`
          id,
          status,
          scheduled_at,
          qc_jobs (
            production_jobs (
              quotations (
                quotation_no,
                project_name,
                customers (
                  customer_code,
                  company_name,
                  contact_name,
                  phone
                )
              )
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);

      const params = new URLSearchParams(window.location.search);
      const requestedJob = params.get("job");
      if (requestedJob && (data || []).some((row) => row.id === requestedJob)) {
        setSelectedJobId(requestedJob);
      } else if ((data || []).length) {
        setSelectedJobId(data[0].id);
      }
    } catch (error) {
      console.error(error);
      setMessage("โหลดข้อมูลงานไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setLoading(false);
    }
  }

  function quotationOf(job) {
    return job?.qc_jobs?.production_jobs?.quotations || null;
  }

  function customerName(job) {
    const c = quotationOf(job)?.customers;
    return c?.company_name || c?.contact_name || c?.customer_code || "-";
  }

  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return jobs;

    return jobs.filter((job) => {
      const q = quotationOf(job);
      return [q?.quotation_no, q?.project_name, customerName(job)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [jobs, search]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;
  const selectedQuotation = quotationOf(selectedJob);

  async function loadMedia(jobId) {
    const { data, error } = await supabase
      .from("job_media")
      .select("*")
      .eq("installation_job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage("ยังโหลดรูปไม่ได้: " + error.message);
      return;
    }

    setMedia(data || []);
  }

  function openPicker(type) {
    setSelectedType(type.key);
    window.setTimeout(() => {
      if (!fileInputRef.current) return;
      fileInputRef.current.accept = type.accept;
      if (type.key !== "artwork") fileInputRef.current.setAttribute("capture", "environment");
      else fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }, 0);
  }

  async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!selectedJobId || !files.length || uploading) return;

    setUploading(true);
    setMessage("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) {
          throw new Error(`${file.name} มีขนาดเกิน 15 MB`);
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${selectedJobId}/${selectedType}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("job-media")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from("job_media")
          .insert({
            installation_job_id: selectedJobId,
            media_type: selectedType,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type || null,
            file_size: file.size,
            note: note.trim() || null,
            uploaded_by: user.id,
          });

        if (insertError) {
          await supabase.storage.from("job-media").remove([path]);
          throw insertError;
        }
      }

      setNote("");
      setMessage(`ส่งไฟล์สำเร็จ ${files.length} ไฟล์`);
      await loadMedia(selectedJobId);
    } catch (error) {
      console.error(error);
      setMessage("ส่งไฟล์ไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setUploading(false);
    }
  }

  async function deleteMedia(item) {
    if (!window.confirm(`ลบ ${item.file_name} ?`)) return;

    try {
      const { error: storageError } = await supabase.storage
        .from("job-media")
        .remove([item.storage_path]);
      if (storageError) throw storageError;

      const { error } = await supabase.from("job_media").delete().eq("id", item.id);
      if (error) throw error;

      await loadMedia(selectedJobId);
    } catch (error) {
      setMessage("ลบไฟล์ไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    }
  }

  function publicUrl(path) {
    return supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl;
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function countOf(type) {
    return media.filter((item) => item.media_type === type).length;
  }

  if (loading) {
    return <main style={styles.loading}>กำลังโหลดงาน...</main>;
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>SIGN BUSINESS</div>
          <h1 style={styles.title}>ส่งแบบ / รูปหน้างาน</h1>
          <p style={styles.subtitle}>ถ่ายจากมือถือและเก็บเข้ากับเลขงานทันที</p>
        </div>
        <button style={styles.backButton} onClick={() => router.push("/")}>หน้าหลัก</button>
      </header>

      <section style={styles.card}>
        <label style={styles.label}>ค้นหางาน</label>
        <input
          style={styles.input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="เลขใบเสนอราคา / ชื่อลูกค้า / ชื่องาน"
        />

        <label style={{ ...styles.label, marginTop: 12 }}>เลือกงาน</label>
        <select
          style={styles.input}
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
        >
          {filteredJobs.map((job) => {
            const q = quotationOf(job);
            return (
              <option key={job.id} value={job.id}>
                {q?.quotation_no || "ไม่มีเลขงาน"} — {customerName(job)} — {q?.project_name || "ไม่ระบุชื่องาน"}
              </option>
            );
          })}
        </select>
      </section>

      {selectedJob && (
        <section style={styles.jobCard}>
          <div style={styles.jobNo}>{selectedQuotation?.quotation_no || "งานติดตั้ง"}</div>
          <div style={styles.customer}>{customerName(selectedJob)}</div>
          <div style={styles.project}>{selectedQuotation?.project_name || "ไม่ระบุชื่องาน"}</div>
        </section>
      )}

      <section style={styles.card}>
        <label style={styles.label}>หมายเหตุสำหรับรูปชุดนี้</label>
        <textarea
          style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น จุดติดตั้งด้านหน้า, ลูกค้าขอแก้สี, ระบบไฟพร้อมแล้ว"
        />

        <div style={styles.actionGrid}>
          {MEDIA_TYPES.map((type) => (
            <button
              key={type.key}
              style={{
                ...styles.uploadButton,
                ...(selectedType === type.key ? styles.uploadButtonActive : {}),
              }}
              onClick={() => openPicker(type)}
              disabled={uploading || !selectedJobId}
            >
              <span style={styles.uploadIcon}>{type.icon}</span>
              <span>{type.label}</span>
              <span style={styles.count}>{countOf(type)}</span>
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={uploadFiles}
        />

        {uploading && <div style={styles.info}>กำลังส่งไฟล์...</div>}
        {message && <div style={styles.message}>{message}</div>}
      </section>

      {MEDIA_TYPES.map((type) => {
        const items = media.filter((item) => item.media_type === type.key);
        return (
          <section key={type.key} style={styles.card}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>{type.icon} {type.label}</h2>
              <span style={styles.badge}>{items.length} ไฟล์</span>
            </div>

            {!items.length ? (
              <div style={styles.empty}>ยังไม่มีไฟล์</div>
            ) : (
              <div style={styles.gallery}>
                {items.map((item) => {
                  const url = publicUrl(item.storage_path);
                  const isPdf = item.mime_type === "application/pdf";
                  return (
                    <article key={item.id} style={styles.mediaCard}>
                      {isPdf ? (
                        <a href={url} target="_blank" rel="noreferrer" style={styles.pdfBox}>PDF<br />{item.file_name}</a>
                      ) : (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={item.file_name} style={styles.image} />
                        </a>
                      )}
                      <div style={styles.mediaBody}>
                        <div style={styles.fileName}>{item.file_name}</div>
                        <div style={styles.meta}>{formatDate(item.created_at)}</div>
                        {item.note && <div style={styles.note}>{item.note}</div>}
                        <button style={styles.deleteButton} onClick={() => deleteMedia(item)}>ลบ</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: "18px",
    color: "#111827",
    fontFamily: "Arial, sans-serif",
  },
  loading: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
  },
  header: {
    maxWidth: 1100,
    margin: "0 auto 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: { fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#d10073" },
  title: { margin: "4px 0", fontSize: 28 },
  subtitle: { margin: 0, color: "#6b7280", fontSize: 14 },
  backButton: {
    border: "1px solid #d1d5db",
    background: "white",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
  },
  card: {
    maxWidth: 1100,
    margin: "0 auto 14px",
    background: "white",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 6px 18px rgba(17,24,39,.06)",
  },
  jobCard: {
    maxWidth: 1100,
    margin: "0 auto 14px",
    borderRadius: 18,
    padding: 18,
    background: "linear-gradient(135deg,#111827,#27272a)",
    color: "white",
  },
  jobNo: { fontSize: 13, color: "#f0a6cf", fontWeight: 800 },
  customer: { fontSize: 22, fontWeight: 800, marginTop: 4 },
  project: { fontSize: 14, color: "#d1d5db", marginTop: 4 },
  label: { display: "block", fontSize: 13, fontWeight: 800, marginBottom: 6 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "12px 13px",
    background: "#fff",
    fontSize: 16,
    outline: "none",
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 10,
    marginTop: 14,
  },
  uploadButton: {
    position: "relative",
    minHeight: 92,
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    background: "#fafafa",
    fontWeight: 800,
    fontSize: 15,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  uploadButtonActive: { borderColor: "#d10073", boxShadow: "0 0 0 2px rgba(209,0,115,.08)" },
  uploadIcon: { fontSize: 24 },
  count: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 24,
    height: 24,
    padding: "0 6px",
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    background: "#111827",
    color: "white",
    fontSize: 12,
  },
  info: { marginTop: 12, color: "#374151", fontWeight: 700 },
  message: {
    marginTop: 12,
    borderRadius: 10,
    padding: 10,
    background: "#fdf2f8",
    color: "#9d174d",
    fontSize: 14,
  },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { margin: 0, fontSize: 18 },
  badge: { background: "#f3f4f6", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 800 },
  empty: { padding: "24px 0 8px", textAlign: "center", color: "#9ca3af" },
  gallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
    gap: 12,
    marginTop: 14,
  },
  mediaCard: { border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff" },
  image: { width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", background: "#f3f4f6" },
  pdfBox: {
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    minHeight: 150,
    padding: 12,
    background: "#f9fafb",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 800,
    wordBreak: "break-word",
  },
  mediaBody: { padding: 10 },
  fileName: { fontSize: 13, fontWeight: 800, wordBreak: "break-word" },
  meta: { marginTop: 4, fontSize: 11, color: "#9ca3af" },
  note: { marginTop: 7, fontSize: 12, color: "#4b5563" },
  deleteButton: {
    marginTop: 9,
    width: "100%",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    background: "#fff",
    borderRadius: 9,
    padding: "7px 8px",
    fontWeight: 800,
  },
};
