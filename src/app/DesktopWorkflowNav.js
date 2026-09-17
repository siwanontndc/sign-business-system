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
    ["ใบแจ้งหนี้", "/invoices/list"],
  ],
  staff: [
    ["ใบเสนอราคา", "/quotations/list"],
    ["ผลิต", "/production"],
    ["QC", "/qc"],
    ["ติดตั้ง", "/installation"],
    ["📷 รูปหน้างาน", "/job-media"],
    ["ส่งมอบ", "/delivery"],
    ["ใบแจ้งหนี้", "/invoices/list"],
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
  const [invoiceBusy, setInvoiceBusy] = useState(false);

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

  const parts = pathname.split("/").filter(Boolean);
  const productionQuotationId = parts[0] === "production" && parts[1] ? parts[1] : null;
  const canDirectInvoice = Boolean(productionQuotationId && ["owner", "staff", "finance"].includes(role));

  async function openCurrentInvoice() {
    if (!productionQuotationId || invoiceBusy) return;
    setInvoiceBusy(true);

    try {
      const { data: existing, error: existingError } = await supabase
        .from("invoices")
        .select("id,invoice_no")
        .eq("quotation_id", productionQuotationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing?.id) {
        router.push(`/invoices/${existing.id}`);
        return;
      }

      const { data: production, error: productionError } = await supabase
        .from("production_jobs")
        .select("id")
        .eq("quotation_id", productionQuotationId)
        .maybeSingle();
      if (productionError) throw productionError;
      if (!production?.id) throw new Error("ไม่พบงานผลิตของใบเสนอราคานี้");

      const { data: qc, error: qcError } = await supabase
        .from("qc_jobs")
        .select("id,status")
        .eq("production_job_id", production.id)
        .maybeSingle();
      if (qcError) throw qcError;
      if (!qc || qc.status !== "passed") {
        alert("งานนี้ยังไม่ผ่าน QC จึงยังไม่สร้างใบแจ้งหนี้");
        return;
      }

      const [{ data: quotation, error: quotationError }, { data: items, error: itemsError }] = await Promise.all([
        supabase.from("quotations").select("*").eq("id", productionQuotationId).single(),
        supabase.from("quotation_items").select("*").eq("quotation_id", productionQuotationId).order("sort_order", { ascending: true }),
      ]);
      if (quotationError) throw quotationError;
      if (itemsError) throw itemsError;

      const now = new Date();
      const invoiceNo = `INV-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
      const due = new Date(now);
      due.setDate(due.getDate() + 30);

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_no: invoiceNo,
          quotation_id: quotation.id,
          customer_id: quotation.customer_id,
          project_name: quotation.project_name,
          invoice_date: now.toISOString().slice(0, 10),
          due_date: due.toISOString().slice(0, 10),
          subtotal: Number(quotation.subtotal || 0),
          discount: Number(quotation.discount || 0),
          vat_percent: Number(quotation.vat_percent || 0),
          vat_amount: Number(quotation.vat_amount || 0),
          grand_total: Number(quotation.grand_total || 0),
          note: quotation.note || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (invoiceError) {
        const { data: retry } = await supabase
          .from("invoices")
          .select("id")
          .eq("quotation_id", productionQuotationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (retry?.id) {
          router.push(`/invoices/${retry.id}`);
          return;
        }
        throw invoiceError;
      }

      const invoiceItems = (items || []).map((item) => {
        const width = Number(item.width);
        const height = Number(item.height);
        return {
          invoice_id: invoice.id,
          description: item.description,
          width: Number.isFinite(width) ? width : null,
          height: Number.isFinite(height) ? height : null,
          quantity: Number(item.quantity || 0),
          unit: item.unit || "งาน",
          unit_price: Number(item.unit_price || 0),
          line_total: Number(item.amount ?? item.line_total ?? 0),
        };
      });

      if (invoiceItems.length) {
        const { error: itemInsertError } = await supabase.from("invoice_items").insert(invoiceItems);
        if (itemInsertError) throw itemInsertError;
      }

      router.push(`/invoices/${invoice.id}`);
    } catch (error) {
      alert("เปิดใบแจ้งหนี้ไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setInvoiceBusy(false);
    }
  }

  if (!desktop || !role || pathname.startsWith("/login")) return null;

  return (
    <div style={styles.wrap} className="no-print">
      {canDirectInvoice && (
        <button style={styles.invoice} onClick={openCurrentInvoice} disabled={invoiceBusy}>
          {invoiceBusy ? "กำลังเปิด..." : "🧾 ใบแจ้งหนี้งานนี้"}
        </button>
      )}
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
  invoice: {
    border: "none",
    borderRadius: 12,
    padding: "10px 13px",
    background: "#2563eb",
    color: "white",
    fontWeight: 800,
    boxShadow: "0 8px 24px rgba(37,99,235,.22)",
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
