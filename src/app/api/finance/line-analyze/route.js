import { NextResponse } from "next/server";
import { analyzeFinanceImage, serviceSupabase } from "../../../lib/financeAi";

export const runtime = "nodejs";

function parseText(text = "") {
  const normalized = String(text).replace(/,/g, "");
  const direction = /รายรับ|โอนเข้า|รับเงิน|ได้รับ/.test(normalized)
    ? "income"
    : /รายจ่าย|โอนออก|จ่าย|ซื้อ|ชำระ/.test(normalized)
      ? "expense"
      : null;
  const m = normalized.match(/(?:รายรับ|รายจ่าย|โอนเข้า|โอนออก|รับเงิน|ได้รับ|จ่าย|ซื้อ|ชำระ)[^0-9]{0,40}([0-9]+(?:\.[0-9]{1,2})?)/);
  const amount = m ? Number(m[1]) : null;
  return {
    direction,
    amount: Number.isFinite(amount) ? amount : null,
    category: direction === "income" ? "รายได้งานป้าย" : direction === "expense" ? "ค่าวัสดุ" : "อื่น ๆ",
    description: text || "",
    counterparty: "",
    bank_name: "",
    reference_no: "",
    project_name: "",
    confidence: direction && amount ? 0.78 : 0.35,
  };
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = serviceSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", userData.user.id).maybeSingle();
    if (!profile?.is_active || !["owner", "finance"].includes(String(profile.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ error: "Missing LINE entry id" }, { status: 400 });

    const { data: entry, error: entryError } = await supabase
      .from("line_account_entries")
      .select("id,status,message_type,message_text,storage_path,mime_type,event_at")
      .eq("id", id)
      .single();
    if (entryError) throw entryError;
    if (entry.status !== "pending") return NextResponse.json({ error: "Entry already reviewed" }, { status: 409 });
    if (/ทดสอบ\s*\d*/i.test(entry.message_text || "")) {
      return NextResponse.json({ error: "Test messages are not analyzed as real finance entries" }, { status: 409 });
    }

    let tx;
    if (entry.message_type === "text") {
      tx = parseText(entry.message_text || "");
    } else if (entry.storage_path && String(entry.mime_type || "").startsWith("image/")) {
      const { data: blob, error: dlError } = await supabase.storage.from("line-account").download(entry.storage_path);
      if (dlError) throw dlError;
      const buffer = Buffer.from(await blob.arrayBuffer());
      tx = await analyzeFinanceImage(buffer, entry.mime_type || blob.type || "image/jpeg", entry.message_text || "");
      tx.confidence = Number(tx.ai_confidence || 0);
    } else {
      return NextResponse.json({ error: "รองรับการวิเคราะห์อัตโนมัติเฉพาะข้อความและรูปภาพในขณะนี้" }, { status: 422 });
    }

    const update = {
      entry_type: tx.direction || null,
      amount: Number(tx.amount || 0) > 0 ? Number(tx.amount) : null,
      category: tx.category || "อื่น ๆ",
      job_reference: tx.project_name || null,
      suggested_description: tx.description || null,
      suggested_counterparty: tx.counterparty || null,
      suggested_bank_name: tx.bank_name || null,
      suggested_reference_no: tx.reference_no || null,
      ai_confidence: Math.max(0, Math.min(1, Number(tx.ai_confidence ?? tx.confidence ?? 0))),
      analyzed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("line_account_entries").update(update).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (error) {
    console.error("LINE finance analyze error", error);
    return NextResponse.json({ error: error?.message || "Analyze failed" }, { status: 500 });
  }
}
