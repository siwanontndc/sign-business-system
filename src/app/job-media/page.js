"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const MEDIA_TYPES = [
  { key: "artwork", label: "แบบงาน", icon: "🖼️", accept: "image/*,application/pdf" },
  { key: "before_install", label: "รูปก่อนติดตั้ง", icon: "📍", accept: "image/*" },
  { key: "during_install", label: "ระหว่างติดตั้ง", icon: "🛠️", accept: "image/*" },
  { key: "after_install", label: "รูปหลังติดตั้ง", icon: "✅", accept: "image/*" },
];

export default function JobMediaPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [quotations, setQuotations] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState("");
  const [selectedType, setSelectedType] = useState("artwork");
  const [media, setMedia] = useState([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [draftFiles, setDraftFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { initialize(); }, []);
  useEffect(() => {
    if (selectedQuotationId) loadMedia(selectedQuotationId);
    else setMedia([]);
    clearDrafts();
  }, [selectedQuotationId]);

  async function initialize() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");

      const [{ data: quoteRows, error: quoteError }, { data: installRows, error: installError }] = await Promise.all([
        supabase.from("quotations").select(`
          id,quotation_no,project_name,status,created_at,customer_id,
          customers(id,customer_code,company_name,contact_name,phone,line_id,email)
        `).order("created_at", { ascending: false }),
        supabase.from("installation_jobs").select("id,quotation_id,status,scheduled_at,created_at").order("created_at", { ascending: false }),
      ]);
      if (quoteError) throw quoteError;
      if (installError) throw installError;
      const rows = quoteRows || [];
      setQuotations(rows);
      setInstallations(installRows || []);

      const params = new URLSearchParams(window.location.search);
      const requestedJob = params.get("job");
      const requestedQuote = params.get("quotation");
      let quoteId = requestedQuote || "";
      if (!quoteId && requestedJob) {
        quoteId = (installRows || []).find((x) => x.id === requestedJob)?.quotation_id || "";
      }
      if (quoteId && rows.some((x) => x.id === quoteId)) setSelectedQuotationId(quoteId);
      else if (rows.length) setSelectedQuotationId(rows[0].id);
    } catch (error) {
      console.error(error);
      setMessage("โหลดข้อมูลไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setLoading(false);
    }
  }

  function customerName(q) {
    const c = q?.customers;
    return c?.company_name || c?.contact_name || c?.customer_code || "-";
  }

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return quotations;
    return quotations.filter((q) => [q.quotation_no, q.project_name, customerName(q), q.customers?.contact_name, q.customers?.phone, q.customers?.customer_code]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(key)));
  }, [quotations, search]);

  useEffect(() => {
    if (search.trim() && filtered.length === 1 && filtered[0].id !== selectedQuotationId) {
      setSelectedQuotationId(filtered[0].id);
    }
  }, [search, filtered, selectedQuotationId]);

  const selectedQuotation = quotations.find((q) => q.id === selectedQuotationId) || null;
  const selectedInstallation = installations.find((x) => x.quotation_id === selectedQuotationId) || null;
  const currentType = MEDIA_TYPES.find((x) => x.key === selectedType) || MEDIA_TYPES[0];

  async function loadMedia(quotationId) {
    const { data, error } = await supabase.from("job_media").select("*").eq("quotation_id", quotationId).order("created_at", { ascending: false });
    if (error) {
      setMessage("โหลดรูปไม่สำเร็จ: " + error.message);
      return;
    }
    setMedia(data || []);
  }

  function clearDrafts() {
    setDraftFiles((current) => {
      current.forEach((x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl));
      return [];
    });
  }

  function openPicker() {
    if (!fileInputRef.current || !selectedQuotationId || saving) return;
    fileInputRef.current.accept = currentType.accept;
    if (currentType.key !== "artwork") fileInputRef.current.setAttribute("capture", "environment");
    else fileInputRef.current.removeAttribute("capture");
    fileInputRef.current.click();
  }

  function stageFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const tooLarge = files.find((f) => f.size > 15 * 1024 * 1024);
    if (tooLarge) return setMessage(`${tooLarge.name} มีขนาดเกิน 15 MB`);
    const staged = files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" }));
    setDraftFiles((prev) => [...prev, ...staged]);
    setMessage(`เลือกแล้ว ${files.length} ไฟล์ — กดบันทึกข้อมูลได้เลย`);
  }

  async function saveDrafts() {
    if (!selectedQuotationId) return setMessage("กรุณาเลือกงานก่อน");
    if (!draftFiles.length || saving) return;
    setSaving(true);
    setMessage("");
    const uploaded = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      for (const draft of draftFiles) {
        const file = draft.file;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `quotations/${selectedQuotationId}/${selectedType}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("job-media").upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const { error: insertError } = await supabase.from("job_media").insert({
          quotation_id: selectedQuotationId,
          installation_job_id: selectedInstallation?.id || null,
          media_type: selectedType,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
          note: note.trim() || null,
          uploaded_by: user.id,
          source: "app",
        });
        if (insertError) throw insertError;
      }
      clearDrafts();
      setNote("");
      setMessage(`✓ บันทึกเรียบร้อย ${uploaded.length} ไฟล์`);
      await loadMedia(selectedQuotationId);
    } catch (error) {
      if (uploaded.length) await supabase.storage.from("job-media").remove(uploaded);
      setMessage("บันทึกไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMedia(item) {
    if (!window.confirm(`ลบ ${item.file_name} ?`)) return;
    const { error: storageError } = await supabase.storage.from("job-media").remove([item.storage_path]);
    if (storageError) return setMessage("ลบไฟล์ไม่สำเร็จ: " + storageError.message);
    const { error } = await supabase.from("job_media").delete().eq("id", item.id);
    if (error) return setMessage("ลบข้อมูลไม่สำเร็จ: " + error.message);
    await loadMedia(selectedQuotationId);
  }

  function countOf(type) { return media.filter((m) => m.media_type === type).length; }
  function publicUrl(path) { return supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl; }

  if (loading) return <main style={s.loading}>กำลังโหลดงาน...</main>;

  return <main style={s.page}>
    <header style={s.header}>
      <div><h1 style={s.title}>ส่งแบบ / รูปหน้างาน</h1><p style={s.sub}>ข้อมูลลูกค้าและงานดึงจากใบเสนอราคาอัตโนมัติ ไม่ต้องคีย์ซ้ำ</p></div>
      <button style={s.home} onClick={() => router.push("/")}>🏠 หน้าหลัก</button>
    </header>

    <section style={s.card}>
      <label style={s.label}>ค้นหาลูกค้า / เลขใบเสนอราคา / ชื่องาน / เบอร์โทร</label>
      <input style={s.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เช่น พี่บอย / QT-2026 / ป้ายหน้าร้าน / 08..." />
      <label style={s.label}>เลือกงาน</label>
      <select style={s.input} value={selectedQuotationId} onChange={(e) => setSelectedQuotationId(e.target.value)}>
        <option value="">-- เลือกงาน --</option>
        {filtered.map((q) => <option key={q.id} value={q.id}>{q.quotation_no} — {customerName(q)} — {q.project_name}</option>)}
      </select>
      {!filtered.length && <div style={s.warn}>ไม่พบงานจากคำค้นนี้</div>}
    </section>

    {selectedQuotation && <section style={s.info}>
      <div><b>{selectedQuotation.quotation_no}</b> · {selectedQuotation.project_name}</div>
      <div style={s.customer}>{customerName(selectedQuotation)}</div>
      <div>{selectedQuotation.customers?.contact_name || ""} {selectedQuotation.customers?.phone ? `· ${selectedQuotation.customers.phone}` : ""}</div>
      <div style={s.flow}>ลูกค้า → ใบเสนอราคา → รูป/ไฟล์ → ผลิต → QC → ติดตั้ง</div>
      <div style={s.badge}>{selectedInstallation ? `มีงานติดตั้งแล้ว: ${selectedInstallation.status}` : "ยังไม่ถึงขั้นติดตั้ง แต่สามารถอัปแบบและรูปได้แล้ว"}</div>
    </section>}

    <section style={s.card}>
      <div style={s.step}>1. เลือกประเภทข้อมูล</div>
      <div style={s.grid}>{MEDIA_TYPES.map((type) => <button key={type.key} onClick={() => { setSelectedType(type.key); clearDrafts(); }} style={{...s.typeBtn,...(selectedType===type.key?s.active:{})}} disabled={saving}>
        <span style={s.icon}>{type.icon}</span><span>{type.label}</span><b style={s.count}>{countOf(type.key)}</b>
      </button>)}</div>

      <div style={s.step}>2. เลือกไฟล์ / ถ่ายรูป</div>
      <button style={{...s.pick,...(!selectedQuotationId?s.disabled:{})}} onClick={openPicker} disabled={!selectedQuotationId || saving}>{currentType.icon} เลือก{currentType.label} / ถ่ายรูป</button>
      <input ref={fileInputRef} type="file" multiple hidden onChange={stageFiles} />

      {draftFiles.length > 0 && <div style={s.previewGrid}>{draftFiles.map((x) => <div key={x.id} style={s.previewCard}>
        {x.previewUrl ? <img src={x.previewUrl} alt="preview" style={s.previewImg} /> : <div style={s.pdf}>PDF</div>}
        <div style={s.fileName}>{x.file.name}</div>
        <button onClick={() => setDraftFiles((cur) => cur.filter((d) => d.id !== x.id))}>เอาออก</button>
      </div>)}</div>}

      <div style={s.step}>3. หมายเหตุ</div>
      <textarea style={{...s.input,minHeight:90}} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="เช่น จุดติดตั้ง, ลูกค้าขอแก้สี, แบบอนุมัติแล้ว" />
      <button style={{...s.save,...(!draftFiles.length?s.disabled:{})}} onClick={saveDrafts} disabled={!draftFiles.length || saving}>{saving ? "กำลังบันทึก..." : `💾 บันทึกข้อมูล${draftFiles.length ? ` (${draftFiles.length} ไฟล์)` : ""}`}</button>
      {message && <div style={message.startsWith("✓") ? s.ok : s.msg}>{message}</div>}
    </section>

    {MEDIA_TYPES.map((type) => {
      const items = media.filter((m) => m.media_type === type.key);
      if (!items.length) return null;
      return <section key={type.key} style={s.card}><h2>{type.icon} {type.label} ({items.length})</h2><div style={s.previewGrid}>{items.map((item) => <div key={item.id} style={s.previewCard}>
        {item.mime_type?.startsWith("image/") ? <img src={publicUrl(item.storage_path)} alt={item.file_name} style={s.previewImg} /> : <a href={publicUrl(item.storage_path)} target="_blank">เปิดไฟล์</a>}
        <div style={s.fileName}>{item.file_name}</div>
        {item.note && <small>{item.note}</small>}
        <button onClick={() => deleteMedia(item)}>ลบ</button>
      </div>)}</div></section>;
    })}
  </main>;
}

const s={
  page:{minHeight:"100vh",background:"#f4f5f7",padding:22,color:"#111827",fontFamily:"Arial,'Noto Sans Thai',sans-serif"},loading:{minHeight:"100vh",display:"grid",placeItems:"center"},header:{maxWidth:1180,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"},title:{margin:0,fontSize:"clamp(28px,4vw,42px)"},sub:{margin:"6px 0 0",color:"#6b7280"},home:{padding:"12px 16px",border:"1px solid #d1d5db",borderRadius:12,background:"white",fontWeight:800},card:{maxWidth:1180,margin:"0 auto 16px",background:"white",border:"1px solid #e5e7eb",borderRadius:18,padding:18},label:{display:"block",fontWeight:800,margin:"8px 0"},input:{width:"100%",boxSizing:"border-box",border:"1px solid #d1d5db",borderRadius:12,padding:"13px 14px",fontSize:16,marginBottom:10},warn:{padding:10,color:"#9a3412"},info:{maxWidth:1180,margin:"0 auto 16px",background:"#fff7fb",border:"1px solid #f9a8d4",borderRadius:18,padding:18},customer:{fontSize:22,fontWeight:900,marginTop:4},flow:{marginTop:10,fontWeight:800,color:"#db2777"},badge:{display:"inline-block",marginTop:8,padding:"6px 10px",borderRadius:999,background:"#f3f4f6",fontSize:13},step:{fontWeight:900,fontSize:18,margin:"14px 0 10px"},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10},typeBtn:{position:"relative",padding:18,border:"1px solid #d1d5db",borderRadius:16,background:"white",fontSize:16,fontWeight:800,display:"grid",gap:5,placeItems:"center"},active:{border:"2px solid #ec4899",background:"#fff7fb"},icon:{fontSize:24},count:{position:"absolute",right:10,top:10,background:"#111827",color:"white",borderRadius:999,minWidth:26,height:26,display:"grid",placeItems:"center"},pick:{width:"100%",padding:18,border:"2px dashed #9ca3af",borderRadius:16,background:"white",fontSize:17,fontWeight:800},save:{width:"100%",marginTop:16,padding:16,border:0,borderRadius:14,background:"#111827",color:"white",fontSize:17,fontWeight:900},disabled:{opacity:.4},previewGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:14},previewCard:{border:"1px solid #e5e7eb",borderRadius:12,padding:10,display:"grid",gap:8},previewImg:{width:"100%",height:180,objectFit:"cover",borderRadius:8,background:"#f3f4f6"},pdf:{height:180,display:"grid",placeItems:"center",background:"#f3f4f6",fontWeight:900},fileName:{fontSize:13,wordBreak:"break-all"},ok:{marginTop:12,padding:10,borderRadius:10,background:"#dcfce7",color:"#166534",fontWeight:800},msg:{marginTop:12,padding:10,borderRadius:10,background:"#fff7ed",color:"#9a3412"}
};
