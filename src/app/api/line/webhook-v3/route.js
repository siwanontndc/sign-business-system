import { NextResponse } from "next/server";
import { POST as legacyPost } from "../webhook-v2/route";
import { serviceSupabase } from "../../../lib/financeAi";
import { autoSelectSurveyForWorkGroup } from "../../../lib/lineAutoSurvey";

export const runtime = "nodejs";

async function noReply() {}

export async function POST(request) {
  const copy = request.clone();
  let body;
  try {
    body = await copy.json();
  } catch {
    return legacyPost(request);
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
