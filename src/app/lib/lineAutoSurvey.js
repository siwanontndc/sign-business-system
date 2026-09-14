function sourceGroupId(event) {
  return event.source?.groupId || event.source?.roomId || null;
}

async function getGroupName(groupId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !groupId) return "";
  const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "";
  const data = await res.json();
  return String(data?.groupName || "");
}

export async function autoSelectSurveyForWorkGroup({ event, supabase, reply }) {
  const groupId = sourceGroupId(event);
  if (!groupId) return "not_work_group";

  const groupName = await getGroupName(groupId);
  const looksLikeWorkGroup = /(กลุ่มงาน|หน้างาน|ช่าง|ติดตั้ง|ผลิต)/i.test(groupName);
  if (!looksLikeWorkGroup) return "not_work_group";

  const { data: surveys, error } = await supabase
    .from("site_surveys")
    .select("id,survey_no,customer_name,project_name,scheduled_at,created_at")
    .in("status", ["surveying", "ready_to_quote"])
    .order("scheduled_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  if (!surveys?.length) {
    await reply(event.replyToken, "📍 กลุ่มงานนี้ยังไม่มีงานสำรวจที่เปิดอยู่ กรุณาสร้างงานสำรวจใน SIGN BUSINESS ก่อนส่งรูป");
    return "work_group_no_survey";
  }

  let chosen = null;
  if (surveys.length === 1) {
    chosen = surveys[0];
  } else {
    const now = Date.now();
    const withinDay = surveys.filter((s) => s.scheduled_at && Math.abs(new Date(s.scheduled_at).getTime() - now) <= 24 * 60 * 60 * 1000);
    if (withinDay.length === 1) chosen = withinDay[0];
  }

  if (!chosen) {
    const lines = surveys.slice(0, 5).map((s) => `${s.survey_no} — ${s.customer_name}`).join("\n");
    await reply(event.replyToken, `📍 มีงานสำรวจเปิดอยู่หลายงาน จึงยังไม่เดาเพื่อกันรูปผิดลูกค้า\n${lines}\n\nพิมพ์ #สำรวจ ตามด้วยเลขงานเพียงครั้งเดียว`);
    return "work_group_ambiguous";
  }

  await supabase.from("job_line_contexts").delete().eq("group_id", groupId);
  const { error: upsertError } = await supabase.from("survey_line_contexts").upsert({
    group_id: groupId,
    survey_id: chosen.id,
    set_by_line_user_id: event.source?.userId || null,
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "group_id" });
  if (upsertError) throw upsertError;

  return "selected";
}
