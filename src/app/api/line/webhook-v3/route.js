import { NextResponse } from "next/server";
import { serviceSupabase } from "../../../lib/financeAi";
import { autoSelectSurveyForWorkGroup } from "../../../lib/lineAutoSurvey";
import { isValidLineSignature } from "../../../lib/lineSignature";

export const runtime = "nodejs";

async function replyText(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

async function forwardToLegacy(request, rawBody, signature) {
  const url = new URL("/api/line/webhook-v2", request.url);
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      "x-line-signature": signature || "",
    },
    body: rawBody,
    cache: "no-store",
  });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!isValidLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = serviceSupabase();
  for (const event of body.events || []) {
    if (event.type !== "message" || event.message?.type !== "image") continue;
    const result = await autoSelectSurveyForWorkGroup({ event, supabase, reply: replyText });
    if (result === "work_group_ambiguous") {
      return NextResponse.json({ ok: true, handled: result });
    }
  }

  const response = await forwardToLegacy(request, rawBody, signature);
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
