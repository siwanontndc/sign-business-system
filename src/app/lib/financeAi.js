import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function fingerprintTransaction(tx) {
  const raw = [tx.direction, Number(tx.amount || 0).toFixed(2), tx.transaction_date || "", tx.bank_name || "", tx.reference_no || "", tx.counterparty || ""].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") return c.text;
    }
  }
  return "";
}

export async function analyzeFinanceImage(buffer, mimeType = "image/jpeg", extraText = "") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const model = process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const prompt = `อ่านภาพหลักฐานทางการเงินภาษาไทย/อังกฤษ เช่นสลิปธนาคาร ใบเสร็จ หรือภาพหน้าจอธุรกรรม แล้วคืน JSON object เท่านั้น ห้าม markdown โดยมี keys: direction (income|expense), amount (number), transaction_date (ISO-8601 ถ้าไม่ทราบให้ null), category, description, counterparty, bank_name, reference_no, project_name, confidence (0-1). ถ้าเป็นการโอนเข้าให้ income ถ้าเป็นเงินออก/ซื้อของ/ชำระให้ expense. หมวดแนะนำ: รายได้งานป้าย, เงินมัดจำ, ค่าวัสดุ, ค่าแรง, ค่าน้ำมัน/เดินทาง, ค่าเครื่องมือ, ค่าใช้จ่ายสำนักงาน, ภาษี/ค่าธรรมเนียม, อื่น ๆ. ข้อความประกอบจาก LINE/ผู้ใช้: ${extraText || "ไม่มี"}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: dataUrl }] }],
      max_output_tokens: 700
    })
  });
  if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const text = extractResponseText(payload).trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  const parsed = JSON.parse(text);
  return {
    direction: parsed.direction === "income" ? "income" : "expense",
    amount: Number(parsed.amount || 0),
    transaction_date: parsed.transaction_date || new Date().toISOString(),
    category: parsed.category || "อื่น ๆ",
    description: parsed.description || "",
    counterparty: parsed.counterparty || "",
    bank_name: parsed.bank_name || "",
    reference_no: parsed.reference_no || "",
    project_name: parsed.project_name || "",
    ai_confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0)))
  };
}
