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
  const [draftFiles, setDraftFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (selectedJobId) loadMedia(selectedJobId);
    else setMedia([]);
    clearDrafts();
  }, [selectedJobId]);

  useEffect(() => {
    return () => {
      draftFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
  }, [draftFiles]);

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
      const rows = data || [];
      setJobs(rows);

      const params = new URLSearchParams(window.location.search);
      const requestedJob = params.get("job");
      if (requestedJob && rows.some((row) => row.id === requestedJob)) {
        setSelectedJobId(requestedJob);
      } else if (rows.length) {
        setSelectedJobId(rows[0].id);
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
  const currentType = MEDIA_TYPES.find((type) => type.key === selectedType) || MEDIA_TYPES[0];

  async function loadMedia(jobId) {
    const { data, error } = await supabase
      .from("job_media")
      .select("*")
      .eq("installation_job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage("โหลดรูปไม่สำเร็จ: " + error.message);
      return;
    }
    setMedia(data || []);
  }

  function clearDrafts() {
    setDraftFiles((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  function selectType(type) {
    if (saving) return;
    clearDrafts();
    setSelectedType(type.key);
    setMessage("");
  }

  function openPicker() {
    if (!fileInputRef.current || !selectedJobId || saving) return;
    fileInputRef.current.accept = currentType.accept;
    if (currentType.key !== "artwork") fileInputRef.current.setAttribute("capture", "environment");
    else fileInputRef.current.removeAttribute("capture");
    fileInputRef.current.click();
  }

  function stageFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const tooLarge = files.find((file) => file.size > 15 * 1024 * 1024);
    if (tooLarge) {
      setMessage(`${tooLarge.name} มีขนาดเกิน 15 MB`);
      return;
    }

    const staged = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    }));
    setDraftFiles((prev) => [...prev, ...staged]);
    setMessage(`เลือกแล้ว ${files.length} ไฟล์ — ตรวจสอบแล้วกด “บันทึกข้อมูล”`);
  }

  function removeDraft(id) {
    setDraftFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function saveDrafts() {
    if (!selectedJobId) {
      setMessage("กรุณาเลือกงานก่อน");
      return;
    }
    if (!draftFiles.length) {
      setMessage("กรุณาเลือกไฟล์หรือถ่ายรูปก่อนบันทึก");
      return;
    }
    if (saving) return;

    setSaving(true);
    setMessage("");
    const uploadedPaths = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      for (const draft of draftFiles) {
        const file = draft.file;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${selectedJobId}/${selectedType}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("job-media")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);

        const { error: insertError } = await supabase.from("job_media").insert({
          installation_job_id: selectedJobId,
          media_type: selectedType,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
          note: note.trim() || null,
          uploaded_by: user.id,
        });

        if (insertError) throw insertError;
      }

      clearDrafts();
      setNote("");
      setMessage(`✓ บันทึกข้อมูลเรียบร้อย ${uploadedPaths.length} ไฟล์`);
      await loadMedia(selectedJobId);
    } catch (error) {
      console.error(error);
      if (uploadedPaths.length) {
        await supabase.storage.from("job-media").remove(uploadedPaths);
      }
      setMessage("บันทึกไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMedia(item) {
    if (!window.confirm(`ลบ ${item.file_name} ?`)) return;
    try {
      const { error: storageError } = await supabase.storage.from("job-media").remove([item.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("job_media").delete().eq("id", item.id);
      if (error) throw error;
      setMessage("ลบไฟล์เรียบร้อย");
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

  if (loading) return <main style={styles.loading}>กำลังโหลดงาน...</main>;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>SIGN BUSINESS</div>
          <h1 style={styles.title}>ส่งแบบ / รูปหน้างาน</h1>
          <p style={styles.subtitle}>เลือกไฟล์หรือถ่ายรูป ตรวจสอบก่อน แล้วกดบันทึกข้อมูล</p>
        </div>
        <button style={styles.backButton} onClick={() => router.push("/")}>🏠 หน้าหลัก</button>
      </header>

      <section style={styles.card}>
        <label style={styles.label}>ค้นหางาน</label>
        <input style={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เลขใบเสนอราคา / ชื่อลูกค้า / ชื่องาน" />

        <label style={{ ...styles.label, marginTop: 12 }}>เลือกงาน</label>
        <select style={styles.input} value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
          {filteredJobs.map((job) => {
            const q = quotationOf(job);
            return <option key={job.id} value={job.id}>{q?.quotation_no || "ไม่มีเลขงาน"} — {customerName(job)} — {q?.project_name || "ไม่ระบุชื่องาน"}</option>;
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
        <div style={styles.stepTitle}>1. เลือกประเภทข้อมูล</div>
        <div style={styles.actionGrid}>
          {MEDIA_TYPES.map((type) => (
            <button key={type.key} style={{ ...styles.typeButton, ...(selectedType === type.key ? styles.typeButtonActive : {}) }} onClick={() => selectType(type)} disabled={saving}>
              <span style={styles.uploadIcon}>{type.icon}</span>
              <span>{type.label}</span>
              <span style={styles.count}>{countOf(type)}</span>
            </button>
          ))}
        </div>

        <div style={styles.stepTitle}>2. เลือกไฟล์ / ถ่ายรูป</div>
        <button style={styles.pickButton} onClick={openPicker} disabled={saving || !selectedJobId}>
          {currentType.icon} เลือก{currentType.label} / ถ่ายรูป
        </button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={stageFiles} />

        {draftFiles.length > 0 && (
          <div style={styles.draftWrap}>
            <div style={styles.stepTitle}>3. ตรวจสอบก่อนบันทึก ({draftFiles.length} ไฟล์)</div>
            <div style={styles.previewGrid}>
              {draftFiles.map((item) => (
                <div key={item.id} style={styles.previewCard}>
                  {item.previewUrl ? <img src={item.previewUrl} alt={item.file.name} style={styles.previewImage} /> : <div style={styles.pdfPreview}>PDF</div>}
                  <div style={styles.previewName}>{item.file.name}</div>
                  <button style={styles.removeDraft} onClick={() => removeDraft(item.id)} disabled={saving}>เอาออก</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.stepTitle}>4. หมายเหตุ</div>
        <textarea style={{ ...styles.input, minHeight: 86, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จุดติดตั้งด้านหน้า, ลูกค้าขอแก้สี, ระบบไฟพร้อมแล้ว" disabled={saving} />

        <button style={{ ...styles.saveButton, ...(draftFiles.length ? {} : styles.saveButtonDisabled) }} onClick={saveDrafts} disabled={saving || !draftFiles.length}>
          {saving ? "กำลังบันทึก..." : `💾 บันทึกข้อมูล${draftFiles.length ? ` (${draftFiles.length} ไฟล์)` : ""}`}
        </button>

        {message && <div style={message.startsWith("✓") ? styles.successMessage : styles.message}>{message}</div>}
      </section>

      {MEDIA_TYPES.map((type) => {
        const items = media.filter((item) => item.media_type === type.key);
        return (
          <section key={type.key} style={styles.card}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>{type.icon} {type.label}</h2>
              <span style={styles.badge}>{items.length} ไฟล์</span>
            </div>
            {!items.length ? <div style={styles.empty}>ยังไม่มีไฟล์ที่บันทึก</div> : (
              <div style={styles.gallery}>
                {items.map((item) => {
                  const url = publicUrl(item.storage_path);
                  const isPdf = item.mime_type === "application/pdf";
                  return (
                    <article key={item.id} style={styles.mediaCard}>
                      {isPdf ? <a href={url} target="_blank" rel="noreferrer" style={styles.pdfBox}>PDF<br />{item.file_name}</a> : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.file_name} style={styles.image} /></a>}
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
  page: { minHeight: "100vh", background: "#f5f6f8", padding: "18px", paddingBottom: 90, color: "#111827", fontFamily: "Arial, sans-serif" },
  loading: { minHeight: "100vh", display: "grid", placeItems: "center", fontSize: 18 },
  header: { maxWidth: 1100, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#d10073" },
  title: { margin: "4px 0", fontSize: 28 },
  subtitle: { margin: 0, color: "#6b7280", fontSize: 14 },
  backButton: { border: "1px solid #d1d5db", background: "white", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  card: { maxWidth: 1100, margin: "0 auto 14px", background: "white", borderRadius: 18, padding: 16, boxShadow: "0 6px 18px rgba(17,24,39,.06)" },
  jobCard: { maxWidth: 1100, margin: "0 auto 14px", borderRadius: 18, padding: 18, background: "linear-gradient(135deg,#111827,#27272a)", color: "white" },
  jobNo: { fontSize: 13, color: "#f0a6cf", fontWeight: 800 },
  customer: { fontSize: 22, fontWeight: 800, marginTop: 4 },
  project: { fontSize: 14, color: "#d1d5db", marginTop: 4 },
  label: { display: "block", fontSize: 13, fontWeight: 800, marginBottom: 7 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 12, padding: "12px 13px", fontSize: 15, background: "white" },
  stepTitle: { fontSize: 15, fontWeight: 900, margin: "14px 0 10px" },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 },
  typeButton: { minHeight: 88, border: "1px solid #d1d5db", borderRadius: 15, background: "white", display: "grid", placeItems: "center", gap: 3, padding: 10, fontWeight: 800, cursor: "pointer", position: "relative" },
  typeButtonActive: { border: "2px solid #e6007e", background: "#fff7fb" },
  uploadIcon: { fontSize: 24 },
  count: { position: "absolute", right: 9, top: 9, minWidth: 24, height: 24, borderRadius: 999, background: "#111827", color: "white", display: "grid", placeItems: "center", fontSize: 12 },
  pickButton: { width: "100%", border: "2px dashed #9ca3af", background: "#f9fafb", borderRadius: 14, padding: "17px 14px", fontWeight: 900, fontSize: 16, cursor: "pointer" },
  draftWrap: { marginTop: 14, padding: 12, borderRadius: 14, background: "#f9fafb", border: "1px solid #e5e7eb" },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 },
  previewCard: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" },
  previewImage: { width: "100%", height: 120, objectFit: "cover", display: "block" },
  pdfPreview: { height: 120, display: "grid", placeItems: "center", background: "#111827", color: "white", fontWeight: 900, fontSize: 24 },
  previewName: { padding: "8px 9px 3px", fontSize: 12, fontWeight: 700, wordBreak: "break-word" },
  removeDraft: { margin: 8, width: "calc(100% - 16px)", border: "1px solid #fecaca", background: "white", color: "#dc2626", borderRadius: 8, padding: "7px", fontWeight: 800, cursor: "pointer" },
  saveButton: { width: "100%", marginTop: 14, border: 0, borderRadius: 13, background: "#e6007e", color: "white", padding: "15px 18px", fontSize: 17, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(230,0,126,.22)" },
  saveButtonDisabled: { background: "#9ca3af", boxShadow: "none", cursor: "not-allowed" },
  message: { marginTop: 12, borderRadius: 10, background: "#fff1f2", color: "#9f1239", padding: "10px 12px", fontWeight: 700 },
  successMessage: { marginTop: 12, borderRadius: 10, background: "#ecfdf5", color: "#047857", padding: "10px 12px", fontWeight: 800 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  sectionTitle: { margin: 0, fontSize: 19 },
  badge: { background: "#f3f4f6", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 },
  empty: { color: "#9ca3af", padding: "18px 0" },
  gallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 },
  mediaCard: { border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "white" },
  image: { width: "100%", height: 165, objectFit: "cover", display: "block" },
  pdfBox: { height: 165, background: "#111827", color: "white", display: "grid", placeItems: "center", textAlign: "center", padding: 10, textDecoration: "none", fontWeight: 900, boxSizing: "border-box" },
  mediaBody: { padding: 10 },
  fileName: { fontWeight: 800, fontSize: 13, wordBreak: "break-word" },
  meta: { color: "#9ca3af", fontSize: 12, marginTop: 5 },
  note: { fontSize: 13, marginTop: 7, color: "#374151", whiteSpace: "pre-wrap" },
  deleteButton: { width: "100%", marginTop: 10, border: "1px solid #fecaca", borderRadius: 9, background: "white", color: "#dc2626", padding: 8, fontWeight: 800, cursor: "pointer" },
};
