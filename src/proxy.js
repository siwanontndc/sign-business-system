import { NextResponse } from "next/server";
export function proxy(request) {
  if (request.nextUrl.pathname === "/api/line/webhook") return NextResponse.rewrite(new URL("/api/line/webhook-v3", request.url));
  return NextResponse.next();
}
