"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

const ROLE_NAV = {
  owner: [
    ["🏠", "หน้าหลัก", "/"], ["📋", "งาน", "/production"], ["📷", "รูปงาน", "/job-media"], ["🚚", "ส่งมอบ", "/delivery"]
  ],
  staff: [
    ["🏠", "หน้าหลัก", "/"], ["📋", "งาน", "/quotations/list"], ["📷", "รูปงาน", "/job-media"], ["🚚", "ส่งมอบ", "/delivery"]
  ],
  production: [
    ["🏠", "หน้าหลัก", "/"], ["📋", "งาน", "/production"], ["📷", "รูปงาน", "/job-media"], ["🔍", "QC", "/qc"]
  ],
  finance: [
    ["🏠", "หน้าหลัก", "/"], ["🧾", "Invoice", "/invoices/list"], ["💰", "รับเงิน", "/receipts/list"], ["📊", "การเงิน", "/finance"]
  ],
};

const MORE = {
  owner: [["ลูกค้า", "/customers"], ["ใบเสนอราคา", "/quotations/list"], ["ผลิต", "/production"], ["QC", "/qc"], ["ติดตั้ง", "/installation"], ["ส่งแบบ / รูปหน้างาน", "/job-media"], ["Invoices", "/invoices/list"], ["Receipts", "/receipts/list"], ["รายงาน", "/reports"], ["ตั้งค่า", "/settings"]],
  staff: [["ลูกค้า", "/customers"], ["ใบเสนอราคา", "/quotations/list"], ["ผลิต", "/production"], ["QC", "/qc"], ["ติดตั้ง", "/installation"], ["ส่งแบบ / รูปหน้างาน", "/job-media"]],
  production: [["ผลิต", "/production"], ["QC", "/qc"], ["ติดตั้ง", "/installation"], ["ส่งแบบ / รูปหน้างาน", "/job-media"], ["ส่งมอบ", "/delivery"]],
  finance: [["Invoices", "/invoices/list"], ["Receipts", "/receipts/list"], ["การเงิน", "/finance"], ["รายงาน", "/reports"]],
};

export default function MobileExperience() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [more, setMore] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const hidden = pathname === "/login" || pathname.startsWith("/login/");

  useEffect(() => {
    if (hidden) return;
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
      if (alive && ROLE_NAV[value]) setRole(value);
    }
    loadRole();
    return () => { alive = false; };
  }, [hidden]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("SW registration failed", error));
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const dismissed = localStorage.getItem("sign-business-install-dismissed") === "1";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    if (!standalone && !dismissed && ios) setShowInstall(true);
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      if (!dismissed && !standalone) setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const nav = useMemo(() => ROLE_NAV[role] || [], [role]);
  if (hidden) return null;

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowInstall(false);
  }

  function dismissInstall() {
    localStorage.setItem("sign-business-install-dismissed", "1");
    setShowInstall(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  return (
    <>
      {showInstall && (
        <div className="pwa-install no-print">
          <div><strong>ติดตั้ง SIGN BUSINESS</strong><br/><span>{isIOS ? "บน iPhone/iPad: เปิดด้วย Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม" : "ติดตั้งเป็นแอปบนอุปกรณ์นี้เพื่อเปิดใช้งานได้สะดวก"}</span></div>
          <div className="pwa-install-actions">{installPrompt && <button onClick={install}>ติดตั้งแอป</button>}<button className="pwa-dismiss" onClick={dismissInstall}>ปิด</button></div>
        </div>
      )}

      {more && role && (
        <div className="mobile-more-backdrop no-print" onClick={() => setMore(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-title">เมนูเพิ่มเติม <button onClick={() => setMore(false)}>✕</button></div>
            <div className="mobile-more-grid">{(MORE[role] || []).map(([label, href]) => <button key={href} onClick={() => { setMore(false); router.push(href); }}>{label}</button>)}</div>
            <button className="mobile-logout" onClick={logout}>ออกจากระบบ</button>
          </div>
        </div>
      )}

      {role && (
        <nav className="mobile-bottom-nav no-print" aria-label="เมนูมือถือ">
          {nav.map(([icon, label, href]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href.split("/list")[0]);
            return <button key={href} className={active ? "active" : ""} onClick={() => router.push(href)}><span>{icon}</span><small>{label}</small></button>;
          })}
          <button onClick={() => setMore(true)}><span>☰</span><small>เพิ่มเติม</small></button>
        </nav>
      )}
    </>
  );
}
