import crypto from "crypto";
import { NextResponse } from "next/server";
import { analyzeFinanceImage, fingerprintTransaction, serviceSupabase } from "../../../lib/financeAi";
import { handleFieldworkImage, handleFieldworkText } from "../../../lib/lineJobMedia";

export const runtime = "nodejs";

function validSignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function replyText(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

async function downloadImage(event) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const messageId = event.message.id;
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`LINE content ${response.status}`);
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("heic") ? "heic" : "jpg";
  return { messageId, mimeType, buffer, ext };
}

async function saveFinanceImage(event) {
  const supabase = serviceSupabase();
  const file = await downloadImage(event);
  const groupId = event.source?.groupId || event.source?.roomId || "direct";
  const path = `line/${groupId}/${Date.now()}-${file.messageId}.${file.ext}`;
  const { error: uploadError } = await supabase.storage.from("finance-evidence").upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const tx = await analyzeFinanceImage(file.buffer, file.mimeType, "หลักฐานจากห้องบัญชี LINE");
  const row = {
    ...tx,
    source: "line",
    status: "pending",
    evidence_path: path,
    line_message_id: file.messageId,
    line_group_id: event.source?.groupId || event.source?.roomId || null,
    line_user_id: event.source?.userId || null,
    raw_text: "รับจาก LINE ห้องบัญชี",
  };
  row.fingerprint = fingerprintTransaction(row);
  const { data, error } = await supabase.from("finance_transactions").insert(row).select().single();
  if (error?.code === "23505") {
    await replyText(event.replyToken, "ℹ️ รายการนี้มีอยู่ใน SIGN BUSINESS แล้ว จึงไม่บันทึกซ้ำ");
    return;
  }
  if (error) throw error;
  const label = data.direction === "income" ? "รายรับ" : "รายจ่าย";
  await replyText(event.replyToken, `✅ อ่านหลักฐานแล้ว\n${label} ${Number(data.amount || 0).toLocaleString("th-TH")} บาท\nหมวด: ${data.category || "อื่น ๆ"}\nสถานะ: รอตรวจสอบใน SIGN BUSINESS`);
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-line-signature"), process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const supabase = serviceSupabase();
  for (const event of body.events || []) {
    try {
      if (event.type === "message" && event.message?.type === "text") {
        await handleFieldworkText({ event, supabase, reply: replyText });
      } else if (event.type === "message" && event.message?.type === "image") {
        const result = await handleFieldworkImage({ event, supabase, downloadImage, reply: replyText });
        if (result === "none") await saveFinanceImage(event);
      }
    } catch (error) {
      console.error("LINE webhook v2 error", error);
      if (event.message?.type === "image") await replyText(event.replyToken, "⚠️ บันทึกรูปไม่สำเร็จ กรุณาลองใหม่หรืออัปโหลดผ่าน SIGN BUSINESS");
    }
  }
  return NextResponse.json({ ok: true });
}
