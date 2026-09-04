"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

const WORKFLOW = {
  owner: [
    ["ผลิต", "/production"],
    ["QC", "/qc"],
    ["ติดตั้ง", "/installation"],
    ["📷 รูปหน้างาน", "/job-media"],
    ["ส่งมอบ", "/delivery"],
  ],
  staff: [
    ["ใบเสนอราคา", "/quotations/list"],
    ["ผลิต", "/production"],
    ["QC", "/qc"],
    ["ติดตั้ง", "/installation"],
    ["📷 รูปหน้างาน", "/job-media"],
    ["ส่งมอบ", "/delivery"],
  ],
  production: [
    ["ผลิต", "/production"],
    ["QC", "/qc"],
    ["ติดตั้ง", "/installation"],
    ["📷 รูปหน้างาน", "/job-media"],
    ["ส่งมอบ", "/delivery"],
  ],
  finance: [
    ["Invoice", "/invoices/list"],
    ["รับเงิน", "/receipts/list"],
    ["การเงิน", "/finance"],
    ["รายงาน", "/reports"],
  ],
};

export default function DesktopWorkflowNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 900px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    let alive = true;
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;
      let value = null;
      const rpc = await supabase.rpc("current_user_role");
      if (!rpc.error && rpc.data) value = String(rpc.data).trim().toLowerCase();
      if (!value) {
        const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        value = profile.data?.role ? String(profile.data.role).trim().toLowerCase() : null;
      }
      if (alive && WORKFLOW[value]) setRole(value);
    }
    loadRole();
    return () => { alive = false; };
  }, [pathname]);

  if (!desktop || !role || pathname.startsWith("/login")) return null;

  return (
    <div style={styles.wrap} className="no-print">
      <button style={styles.toggle} onClick={() => setOpen((value) => !value)}>
        {open ? "✕" : "งาน ▸"}
      </button>
      {open && (
        <div style={styles.panel}>
          <div style={styles.title}>WORKFLOW</div>
          {(WORKFLOW[role] || []).map(([label, href]) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <button
                key={href}
                style={{ ...styles.item, ...(active ? styles.active : {}) }}
                onClick={() => {
                  setOpen(false);
                  router.push(href);
                }}
              >
                {label}
              </button>
            );
          })}
          <button style={styles.home} onClick={() => { setOpen(false); router.push("/"); }}>
            หน้าหลัก
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    position: "fixed",
    right: 14,
    top: 88,
    zIndex: 1000,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontFamily: "Arial, sans-serif",
  },
  toggle: {
    border: "none",
    borderRadius: 12,
    padding: "10px 13px",
    background: "#111827",
    color: "white",
    fontWeight: 800,
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
  panel: {
    width: 190,
    background: "rgba(255,255,255,.98)",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 10,
    boxShadow: "0 16px 40px rgba(17,24,39,.18)",
  },
  title: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.2,
    color: "#d10073",
    padding: "4px 6px 8px",
  },
  item: {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    borderRadius: 10,
    padding: "10px 11px",
    marginBottom: 4,
    color: "#111827",
    fontWeight: 700,
    cursor: "pointer",
  },
  active: {
    background: "#fce7f3",
    color: "#be185d",
  },
  home: {
    display: "block",
    width: "100%",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    borderRadius: 10,
    padding: "9px 11px",
    marginTop: 8,
    fontWeight: 700,
    cursor: "pointer",
  },
};
