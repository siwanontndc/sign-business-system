"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "./lib/supabase";

const ACCESS_RULES = [
  { path: "/customers", roles: ["owner", "staff"] },
  { path: "/quotations", roles: ["owner", "staff"] },
  { path: "/invoices", roles: ["owner", "finance"] },
  { path: "/receipts", roles: ["owner", "finance"] },
  { path: "/finance", roles: ["owner", "finance"] },
  { path: "/reports", roles: ["owner", "finance"] },
  { path: "/kpi", roles: ["owner"] },
  { path: "/settings", roles: ["owner"] },
  { path: "/production", roles: ["owner", "staff", "production"] },
  { path: "/qc", roles: ["owner", "staff", "production"] },
  { path: "/installation", roles: ["owner", "staff", "production"] },
  { path: "/job-media", roles: ["owner", "staff", "production"] },
  { path: "/delivery", roles: ["owner", "staff", "production"] },
];

const VALID_ROLES = ["owner", "staff", "finance", "production"];

export default function AuthGuard({ children }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      try {
        if (pathname === "/login" || pathname.startsWith("/login/")) { if (active) setChecking(false); return; }
        if (active) { setChecking(true); setMessage(""); }
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) { window.location.replace("/login"); return; }
        let currentRole = null;
        const { data: rpcRole, error: rpcError } = await supabase.rpc("current_user_role");
        if (!rpcError && rpcRole) { const normalized = String(rpcRole).trim().toLowerCase(); if (VALID_ROLES.includes(normalized)) currentRole = normalized; }
        if (!currentRole) {
          const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
          if (profile?.role) { const normalized = String(profile.role).trim().toLowerCase(); if (VALID_ROLES.includes(normalized)) currentRole = normalized; }
        }
        if (!currentRole) { if (active) { setMessage("ไม่พบสิทธิ์ของบัญชีนี้"); setChecking(false); } return; }
        const matchedRule = ACCESS_RULES.find(rule => pathname === rule.path || pathname.startsWith(`${rule.path}/`));
        if (pathname === "/") { if (active) setChecking(false); return; }
        if (matchedRule && !matchedRule.roles.includes(currentRole)) { window.location.replace("/"); return; }
        if (!matchedRule && currentRole !== "owner") { window.location.replace("/"); return; }
        if (active) setChecking(false);
      } catch (error) { console.error(error); if (active) { setMessage("ตรวจสอบสิทธิ์ไม่สำเร็จ"); setChecking(false); } }
    }
    checkAccess(); return () => { active = false; };
  }, [pathname]);

  if (pathname === "/login" || pathname.startsWith("/login/")) return children;
  if (checking) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f3f4f6"}}>กำลังตรวจสอบสิทธิ์...</div>;
  if (message) return <div style={{minHeight:"100vh",display:"grid",placeItems:"center"}}><div><h2>ไม่สามารถเข้าใช้งานได้</h2><p>{message}</p></div></div>;
  return children;
}
