import { NextResponse } from "next/server";
import { analyzeFinanceImage, fingerprintTransaction, serviceSupabase } from "../../../lib/financeAi";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = serviceSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const path = String(body?.path || "");
    if (!path) return NextResponse.json({ error: "Missing evidence path" }, { status: 400 });

    const { data: blob, error: downloadError } = await supabase.storage.from("finance-evidence").download(path);
    if (downloadError) throw downloadError;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const tx = await analyzeFinanceImage(buffer, blob.type || "image/jpeg", body?.note || "");
    const row = {
      ...tx,
      source: "gallery",
      status: "pending",
      evidence_path: path,
      raw_text: body?.note || null,
      created_by: userData.user.id,
    };
    row.fingerprint = fingerprintTransaction(row);

    const { data, error } = await supabase.from("finance_transactions").insert(row).select().single();
    if (error?.code === "23505") return NextResponse.json({ duplicate: true, message: "พบรายการซ้ำ", fingerprint: row.fingerprint }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ transaction: data });
  } catch (error) {
    console.error("finance analyze error", error);
    return NextResponse.json({ error: error?.message || "Analyze failed" }, { status: 500 });
  }
}
