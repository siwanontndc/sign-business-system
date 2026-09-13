const MEDIA_LABELS = {
  artwork: "แบบงาน",
  before_install: "ก่อนติดตั้ง",
  during_install: "ระหว่างติดตั้ง",
  after_install: "หลังติดตั้ง",
};

function groupIdOf(event) {
  return event.source?.groupId || event.source?.roomId || null;
}

function mediaType(word = "") {
  const value = word.trim().toLowerCase();
  if (["แบบ", "แบบงาน", "artwork"].includes(value)) return "artwork";
  if (["ก่อน", "ก่อนติดตั้ง", "before"].includes(value)) return "before_install";
  if (["ระหว่าง", "ระหว่างติดตั้ง", "during"].includes(value)) return "during_install";
  if (["หลัง", "หลังติดตั้ง", "after"].includes(value)) return "after_install";
  return null;
}

export function parseFieldworkCommand(text = "") {
  const value = text.trim();
  if (/^#?(ปิดงาน|จบงาน|clearjob)$/i.test(value)) return { action: "clear" };
  if (/^#?(สรุปงาน|jobsummary)$/i.test(value)) return { action: "summary" };
  const match = value.match(/^#?(?:งาน|job)\s+(\S+)\s+(แบบงาน|แบบ|ก่อนติดตั้ง|ก่อน|ระหว่างติดตั้ง|ระหว่าง|หลังติดตั้ง|หลัง|artwork|before|during|after)$/i);
  if (!match) return null;
  return { action: "set", jobRef: match[1].trim(), mediaType: mediaType(match[2]) };
}

async function contextOf(supabase, groupId) {
  if (!groupId) return null;
  const { data, error } = await supabase
    .from("job_line_contexts")
    .select("group_id, installation_job_id, media_type, expires_at")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findJob(supabase, jobRef) {
  const { data: quotation, error: quoteError } = await supabase
    .from("quotations")
    .select("id, quotation_no, project_name, customers(company_name, contact_name)")
    .eq("quotation_no", jobRef)
    .limit(1)
    .maybeSingle();
  if (quoteError) throw quoteError;
  if (!quotation) return null;

  const { data: installation, error: installError } = await supabase
    .from("installation_jobs")
    .select("id, status, scheduled_at")
    .eq("quotation_id", quotation.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (installError) throw installError;
  if (!installation) return null;
  return { quotation, installation };
}

export async function handleFieldworkText({ event, supabase, reply }) {
  const command = parseFieldworkCommand(event.message?.text || "");
  if (!command) return false;
  const groupId = groupIdOf(event);
  if (!groupId) {
    await reply(event.replyToken, "คำสั่งงานหน้างานใช้ใน LINE กลุ่มหรือห้องงานเท่านั้น");
    return true;
  }

  if (command.action === "clear") {
    const { error } = await supabase.from("job_line_contexts").delete().eq("group_id", groupId);
    if (error) throw error;
    await reply(event.replyToken, "✅ ปิดโหมดรับรูปงานแล้ว\nรูปถัดไปจะไม่ถูกผูกกับงานเดิม");
    return true;
  }

  if (command.action === "summary") {
    const context = await contextOf(supabase, groupId);
    if (!context) {
      await reply(event.replyToken, "ยังไม่ได้เลือกงาน\nพิมพ์: #งาน เลขใบเสนอราคา ก่อน");
      return true;
    }
    const { data, error } = await supabase.from("job_media").select("media_type").eq("installation_job_id", context.installation_job_id);
    if (error) throw error;
    const counts = { artwork: 0, before_install: 0, during_install: 0, after_install: 0 };
    for (const item of data || []) counts[item.media_type] = (counts[item.media_type] || 0) + 1;
    await reply(event.replyToken, `📋 สรุปรูปงาน\nแบบงาน ${counts.artwork} รูป\nก่อนติดตั้ง ${counts.before_install} รูป\nระหว่างติดตั้ง ${counts.during_install} รูป\nหลังติดตั้ง ${counts.after_install} รูป\nโหมดปัจจุบัน: ${MEDIA_LABELS[context.media_type]}`);
    return true;
  }

  const job = await findJob(supabase, command.jobRef);
  if (!job) {
    await reply(event.replyToken, `⚠️ ไม่พบงาน ${command.jobRef}\nกรุณาตรวจเลขใบเสนอราคา และต้องมีงานติดตั้งใน SIGN BUSINESS ก่อน`);
    return true;
  }

  const { error } = await supabase.from("job_line_contexts").upsert({
    group_id: groupId,
    installation_job_id: job.installation.id,
    media_type: command.mediaType,
    set_by_line_user_id: event.source?.userId || null,
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "group_id" });
  if (error) throw error;

  const customer = job.quotation?.customers?.company_name || job.quotation?.customers?.contact_name || "-";
  await reply(event.replyToken, `✅ พร้อมรับรูปงาน\n${job.quotation.quotation_no} — ${customer}\n${job.quotation.project_name || "ไม่ระบุชื่องาน"}\nหมวด: ${MEDIA_LABELS[command.mediaType]}\n\nส่งรูปต่อได้เลย ระบบจะเก็บอัตโนมัติ 12 ชั่วโมง\nเสร็จแล้วพิมพ์ #ปิดงาน`);
  return true;
}

export async function handleFieldworkImage({ event, supabase, downloadImage, reply }) {
  const groupId = groupIdOf(event);
  if (!groupId) return "none";
  const context = await contextOf(supabase, groupId);
  if (!context) return "none";

  if (new Date(context.expires_at).getTime() <= Date.now()) {
    await reply(event.replyToken, "⏰ โหมดรับรูปงานหมดเวลาแล้ว\nพิมพ์ #งาน เลขใบเสนอราคา ก่อน/ระหว่าง/หลัง อีกครั้งก่อนส่งรูป");
    return "expired";
  }

  const file = await downloadImage(event);
  const { data: existing } = await supabase.from("job_media").select("id").eq("line_message_id", file.messageId).maybeSingle();
  if (existing) return "saved";

  const path = `line/${groupId}/${context.installation_job_id}/${context.media_type}/${file.messageId}.${file.ext}`;
  const { error: uploadError } = await supabase.storage.from("job-media").upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("job_media").insert({
    installation_job_id: context.installation_job_id,
    media_type: context.media_type,
    file_name: `LINE-${file.messageId}.${file.ext}`,
    storage_path: path,
    mime_type: file.mimeType,
    file_size: file.buffer.length,
    note: "รับอัตโนมัติจาก LINE กลุ่ม",
    source: "line",
    line_message_id: file.messageId,
    line_group_id: groupId,
    line_user_id: event.source?.userId || null,
    captured_at: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
  });

  if (insertError) {
    await supabase.storage.from("job-media").remove([path]);
    throw insertError;
  }
  return "saved";
}
