"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

export default function DesktopSidebarKpiLink() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.rpc("current_user_role");
      if (active) setRole(data ? String(data).trim().toLowerCase() : null);
    }
    loadRole();
    return () => { active = false; };
  }, []);

  if (!desktop || pathname !== "/" || role !== "owner") return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/kpi")}
      aria-label="KPI / วิเคราะห์งาน"
      style={{
        position: "fixed",
        left: 18,
        bottom: 126,
        width: 216,
        zIndex: 121,
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 10,
        padding: "12px 14px",
        textAlign: "left",
        background: "#111827",
        color: "#fff",
        fontSize: 15,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(0,0,0,.18)",
      }}
    >
      📊 KPI / วิเคราะห์งาน
    </button>
  );
}
