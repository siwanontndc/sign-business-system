import { NextResponse } from "next/server";
import { POST as legacyPost } from "../webhook-v2/route";
import { serviceSupabase } from "../../../lib/financeAi";
import { autoSelectSurveyForWorkGroup } from "../../../lib/lineAutoSurvey";
import { isValidLineSignature } from "../../../lib/lineSignature";

export const runtime = "nodejs";

async function noReply() {}

export async function POST(request) {
  const rawBody = await request.clone().text();
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
    const result = await autoSelectSurveyForWorkGroup({ event, supabase, reply: noReply });
    if (result === "work_group_no_survey" || result === "work_group_ambiguous") {
      return NextResponse.json({ ok: true, handled: result });
    }
  }

  return legacyPost(request);
}
