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

async function callVision({ apiKey, model, dataUrl, prompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: dataUrl }] }],
        max_output_tokens: 700
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      const err = new Error(`OpenAI ${response.status}: ${raw.slice(0, 500)}`);
      err.status = response.status;
      throw err;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("AI ใช้เวลานานเกิน 30 วินาที กรุณาลองใหม่");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeFinanceImage(buffer, mimeType = "image/jpeg", extraText = "") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์");

  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const prompt = `อ่านภาพหลักฐานทางการเงินภาษาไทย/อังกฤษ เช่นสลิปธนาคาร ใบเสร็จ หรือภาพหน้าจอธุรกรรม แล้วคืน JSON object เท่านั้น ห้าม markdown โดยมี keys: direction (income|expense), amount (number), transaction_date (ISO-8601 ถ้าไม่ทราบให้ null), category, description, counterparty, bank_name, reference_no, project_name, confidence (0-1). อ่านยอดเงินจริง วันที่/เวลา ธนาคารต้นทาง/ปลายทาง และเลขอ้างอิงจากภาพให้ละเอียด. ถ้าเป็นการโอนออก/ซื้อของ/ชำระ ให้ expense. หมวดแนะนำ: รายได้งานป้าย, เงินมัดจำ, ค่าวัสดุ, ค่าแรง, ค่าน้ำมัน/เดินทาง, ค่าเครื่องมือ, ค่าใช้จ่ายสำนักงาน, ภาษี/ค่าธรรมเนียม, อื่น ๆ. ข้อความประกอบจาก LINE/ผู้ใช้: ${extraText || "ไม่มี"}`;

  const configured = process.env.OPENAI_VISION_MODEL;
  const models = [...new Set([configured, "gpt-4.1-mini", "gpt-4o-mini"].filter(Boolean))];
  let payload = null;
  let lastError = null;
  for (const model of models) {
    try {
      payload = await callVision({ apiKey, model, dataUrl, prompt });
      break;
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || "");
      const modelProblem = /model|not found|does not exist|unsupported/i.test(msg) || [400, 404].includes(Number(error?.status));
      if (!modelProblem) break;
    }
  }
  if (!payload) throw lastError || new Error("AI วิเคราะห์ไม่สำเร็จ");

  const text = extractResponseText(payload).trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`AI ส่งข้อมูลกลับมาไม่เป็น JSON: ${text.slice(0, 250)}`); }

  return {
    direction: parsed.direction === "income" ? "income" : "expense",
    amount: Number(parsed.amount || 0),
    transaction_date: parsed.transaction_date || null,
    category: parsed.category || "อื่น ๆ",
    description: parsed.description || extraText || "",
    counterparty: parsed.counterparty || "",
    bank_name: parsed.bank_name || "",
    reference_no: parsed.reference_no || "",
    project_name: parsed.project_name || "",
    ai_confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0)))
  };
}
