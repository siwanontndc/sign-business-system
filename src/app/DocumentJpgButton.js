"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "./lib/supabase";

const DOCS = [
  { prefix: "/quotations/", table: "quotations", noField: "quotation_no", title: "ใบเสนอราคา" },
  { prefix: "/invoices/", table: "invoices", noField: "invoice_no", title: "ใบแจ้งหนี้" },
  { prefix: "/receipts/", table: "receipts", noField: "receipt_no", title: "ใบเสร็จรับเงิน" },
];

const COMPANY_REPLACEMENTS = new Map([
  ["ร้าน ธานี แอ็ดเวอร์ไทซิ่ง", "บริษัท ธานี แอดเวอร์ไทซิ่ง จำกัด"],
  ["14/15 ม.8 ต.บางกระสั้น อ.บางปะอิน จ.พระนครศรีอยุธยา 13160", "1/5 ม.15 ถ.สันโค้งน้อย ต.รอบเวียง อ.เมืองเชียงราย จ.เชียงราย 57000"],
  ["เลขประจำตัวผู้เสียภาษี: 3149900246546", "ทะเบียนเลขที่: 0575565002465"],
  ["โทร: 089-779-7319", "โทร. 093-131-8183"],
  ["อีเมล:", ""],
  ["อีเมล: siwanon_s@hotmail.com", ""],
  ["siwanon_s@hotmail.com", ""],
  ["LINE: 0931318183", ""],
]);

function normalizeCompanyHeader() {
  const root = document.querySelector(".print-page");
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!COMPANY_REPLACEMENTS.has(trimmed)) continue;

    const replacement = COMPANY_REPLACEMENTS.get(trimmed);
    if (!replacement) {
      node.nodeValue = "";
      continue;
    }

    node.nodeValue = raw.replace(trimmed, replacement);
  }
}

function cleanFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function pickCustomer(row) {
  return row?.customers?.company_name || row?.customers?.contact_name || row?.customers?.customer_code || "ลูกค้า";
}

export default function DocumentJpgButton() {
  const pathname = usePathname();
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const route = useMemo(() => {
    const matched = DOCS.find((x) => pathname?.startsWith(x.prefix));
    if (!matched) return null;
    const rest = pathname.slice(matched.prefix.length);
    if (!rest || rest.includes("/") || ["list", "new"].includes(rest)) return null;
    return { ...matched, id: rest };
  }, [pathname]);

  useEffect(() => {
    if (!route) {
      setMeta(null);
      return;
    }

    let alive = true;
    async function loadMeta() {
      let query;
      if (route.table === "receipts") {
        query = supabase
          .from("receipts")
          .select(`*, customers(customer_code,company_name,contact_name), invoices(invoice_no,project_name)`)
          .eq("id", route.id)
          .maybeSingle();
      } else {
        query = supabase
          .from(route.table)
          .select(`*, customers(customer_code,company_name,contact_name)`)
          .eq("id", route.id)
          .maybeSingle();
      }
      const { data } = await query;
      if (!alive || !data) return;

      const docNo = data?.[route.noField] || data?.invoices?.invoice_no || route.id;
      const projectName = data?.project_name || data?.invoices?.project_name || "งาน";
      const customerName = pickCustomer(data);
      const title = `${route.title} • ${docNo} • ${projectName} • ${customerName}`;
      setMeta({ docNo, projectName, customerName, title });
      document.title = title;
    }

    loadMeta();
    return () => {
      alive = false;
    };
  }, [route]);

  useEffect(() => {
    if (!route) return;

    normalizeCompanyHeader();
    const timer = window.setInterval(normalizeCompanyHeader, 300);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 5000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [route]);

  useEffect(() => {
    return () => {
      document.title = "SIGN BUSINESS Management System";
    };
  }, []);

  async function makeJpegBlob() {
    normalizeCompanyHeader();
    const target = document.querySelector(".print-page");
    if (!target) throw new Error("ไม่พบพื้นที่เอกสารสำหรับสร้าง JPG");
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: Math.min(2.2, window.devicePixelRatio || 2),
      useCORS: true,
      logging: false,
      windowWidth: Math.max(target.scrollWidth, document.documentElement.clientWidth),
    });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("สร้างไฟล์ JPG ไม่สำเร็จ")), "image/jpeg", 0.95);
    });
  }

  function fileName() {
    const parts = [route?.title, meta?.docNo, meta?.projectName, meta?.customerName]
      .map(cleanFilePart)
      .filter(Boolean);
    return `${parts.join("_")}.jpg`;
  }

  async function downloadJpg() {
    if (!route || !meta || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await makeJpegBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setMessage("✓ สร้าง JPG แล้ว");
    } catch (error) {
      setMessage(error?.message || "สร้าง JPG ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function shareJpg() {
    if (!route || !meta || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await makeJpegBlob();
      const file = new File([blob], fileName(), { type: "image/jpeg" });
      const shareData = {
        title: meta.title,
        text: `${route.title}\nเลขที่: ${meta.docNo}\nงาน: ${meta.projectName}\nลูกค้า: ${meta.customerName}`,
        files: [file],
      };
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share(shareData);
        setMessage("✓ เปิดเมนูแชร์แล้ว");
      } else {
        await downloadJpg();
        setMessage("อุปกรณ์นี้ไม่รองรับแชร์ไฟล์โดยตรง จึงดาวน์โหลด JPG ให้แทน");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setMessage(error?.message || "แชร์ไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!route || !meta) return null;

  return (
    <div className="no-print" style={styles.wrap}>
      <button style={styles.jpg} onClick={downloadJpg} disabled={busy}>📷 {busy ? "กำลังสร้าง..." : "JPG"}</button>
      <button style={styles.share} onClick={shareJpg} disabled={busy}>↗ แชร์</button>
      {message && <div style={styles.message}>{message}</div>}
    </div>
  );
}

const styles = {
  wrap: { position: "fixed", right: 14, bottom: 18, zIndex: 1200, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "92vw" },
  jpg: { border: 0, borderRadius: 12, padding: "11px 15px", background: "#2563eb", color: "white", fontWeight: 900, boxShadow: "0 8px 24px rgba(0,0,0,.16)", cursor: "pointer" },
  share: { border: 0, borderRadius: 12, padding: "11px 15px", background: "#111827", color: "white", fontWeight: 900, boxShadow: "0 8px 24px rgba(0,0,0,.16)", cursor: "pointer" },
  message: { width: "100%", textAlign: "right", fontSize: 12, color: "#374151", background: "rgba(255,255,255,.95)", padding: "5px 8px", borderRadius: 8 },
};
