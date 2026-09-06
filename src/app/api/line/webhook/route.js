import crypto from "crypto";
import { NextResponse } from "next/server";
import { analyzeFinanceImage, fingerprintTransaction, serviceSupabase } from "../../../lib/financeAi";

export const runtime = "nodejs";

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function replyLine(replyToken, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages })
  });
}

async function handleImage(event) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const supabase = serviceSupabase();
  const messageId = event.message.id;
  const content = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!content.ok) throw new Error(`LINE content ${content.status}`);
  const mimeType = content.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await content.arrayBuffer());
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const groupId = event.source?.groupId || event.source?.roomId || "direct";
  const path = `line/${groupId}/${Date.now()}-${messageId}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("finance-evidence").upload(path, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const tx = await analyzeFinanceImage(buffer, mimeType, "หลักฐานจากห้องบัญชี LINE");
  const row = {
    ...tx,
    source: "line",
    status: "pending",
    evidence_path: path,
    line_message_id: messageId,
    line_group_id: event.source?.groupId || event.source?.roomId || null,
    line_user_id: event.source?.userId || null,
    raw_text: "รับจาก LINE ห้องบัญชี"
  };
  row.fingerprint = fingerprintTransaction(row);
  const { data, error } = await supabase.from("finance_transactions").insert(row).select().single();
  if (error?.code === "23505") {
    await replyLine(event.replyToken, [{ type: "text", text: "ℹ️ รายการนี้มีอยู่ใน SIGN BUSINESS แล้ว จึงไม่บันทึกซ้ำ" }]);
    return;
  }
  if (error) throw error;
  const label = data.direction === "income" ? "รายรับ" : "รายจ่าย";
  await replyLine(event.replyToken, [{
    type: "text",
    text: `✅ อ่านหลักฐานแล้ว\n${label} ${Number(data.amount || 0).toLocaleString("th-TH")} บาท\nหมวด: ${data.category || "อื่น ๆ"}\nสถานะ: รอตรวจสอบใน SIGN BUSINESS`
  }]);
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  for (const event of body.events || []) {
    if (event.type === "message" && event.message?.type === "image") {
      try { await handleImage(event); }
      catch (error) {
        console.error("LINE finance image error", error);
        await replyLine(event.replyToken, [{ type: "text", text: "⚠️ อ่านหลักฐานไม่สำเร็จ กรุณานำรูปเข้าเมนูการเงินใน SIGN BUSINESS" }]);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
