import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna";
  const supabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok:false, openaiKeyConfigured:false, model, supabaseUrlConfigured:supabaseUrl, serviceRoleConfigured:serviceRole, error:"Missing OPENAI_API_KEY" }, { status:500 });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({model,input:"ตอบคำว่า OK เท่านั้น",max_output_tokens:20})
    });
    const text = await response.text();
    return NextResponse.json({ok:response.ok,openaiKeyConfigured:true,model,supabaseUrlConfigured:supabaseUrl,serviceRoleConfigured:serviceRole,openaiStatus:response.status,error:response.ok?null:text.slice(0,500)}, {status:response.ok?200:500});
  } catch (error) {
    return NextResponse.json({ok:false,openaiKeyConfigured:true,model,supabaseUrlConfigured:supabaseUrl,serviceRoleConfigured:serviceRole,error:error?.message||"OpenAI request failed"}, {status:500});
  }
}
