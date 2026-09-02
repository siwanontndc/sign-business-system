"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase.js";

export default function ReceiptsPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    setLoading(true);
  
    const {
      data: { session },
    } = await supabase.auth.getSession();
  
    if (!session) {
      router.push("/login");
      return;
    }
  
    // 1. ดึง Invoice ที่ชำระแล้ว
    const { data: paidInvoices, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        customers (
          customer_code,
          company_name,
          contact_name
        )
      `)
      .eq("status", "paid")
      .order("created_at", { ascending: false });
  
    if (invoiceError) {
      alert("โหลด Invoice ไม่สำเร็จ: " + invoiceError.message);
      setLoading(false);
      return;
    }
  
    // 2. ดึงใบเสร็จที่สร้างไปแล้ว
    const { data: receipts, error: receiptError } = await supabase
      .from("receipts")
      .select("invoice_id");
  
    if (receiptError) {
      alert("ตรวจสอบใบเสร็จไม่สำเร็จ: " + receiptError.message);
      setLoading(false);
      return;
    }
  
    // 3. เก็บ invoice_id ที่มีใบเสร็จแล้ว
    const receiptInvoiceIds = new Set(
      (receipts || [])
        .map((receipt) => receipt.invoice_id)
        .filter(Boolean)
    );
  
    // 4. เหลือเฉพาะ Invoice ที่ยังไม่เคยสร้างใบเสร็จ
    const availableInvoices = (paidInvoices || []).filter(
      (invoice) => !receiptInvoiceIds.has(invoice.id)
    );
  
    setInvoices(availableInvoices);
    setLoading(false);
  }

  function customerName(item) {
    return (
      item.customers?.company_name ||
      item.customers?.contact_name ||
      item.customers?.customer_code ||
      "-"
    );
  }

  function money(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  async function createReceipt(invoice) {
    if (creatingId) return;

    setCreatingId(invoice.id);

    const { data: existing, error: existingError } = await supabase
      .from("receipts")
      .select("id, receipt_no")
      .eq("invoice_id", invoice.id)
      .maybeSingle();

    if (existingError) {
      alert("ตรวจสอบใบเสร็จไม่สำเร็จ: " + existingError.message);
      setCreatingId(null);
      return;
    }

    if (existing) {
      setCreatingId(null);
      router.push(`/receipts/${existing.id}`);
      return;
    }

    const { data: invoiceItems, error: itemError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true });

    if (itemError) {
      alert("โหลดรายการไม่สำเร็จ: " + itemError.message);
      setCreatingId(null);
      return;
    }

    const now = new Date();

    const receiptNo =
      `RC-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert([
        {
          receipt_no: receiptNo,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          project_name: invoice.project_name,
          receipt_date: now.toISOString().slice(0, 10),
          subtotal: Number(invoice.subtotal || 0),
          discount: Number(invoice.discount || 0),
          vat_percent: Number(invoice.vat_percent || 0),
          vat_amount: Number(invoice.vat_amount || 0),
          grand_total: Number(invoice.grand_total || 0),
          note: invoice.note || "",
          status: "received",
        },
      ])
      .select()
      .single();

    if (receiptError) {
      alert("สร้างใบเสร็จไม่สำเร็จ: " + receiptError.message);
      setCreatingId(null);
      return;
    }

    const rows = (invoiceItems || []).map((item) => ({
      receipt_id: receipt.id,
      description: item.description,
      width: item.width,
      height: item.height,
      quantity: Number(item.quantity || 0),
      unit: item.unit,
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
    }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("receipt_items")
        .insert(rows);

      if (insertError) {
        alert("สร้างรายการใบเสร็จไม่สำเร็จ: " + insertError.message);
        setCreatingId(null);
        return;
      }
    }

    const { error: invoiceUpdateError } = await supabase
  .from("invoices")
  .update({
    status: "paid",
    updated_at: new Date().toISOString(),
  })
  .eq("id", invoice.id);

if (invoiceUpdateError) {
  alert("สร้างใบเสร็จแล้ว แต่เปลี่ยนสถานะใบแจ้งหนี้ไม่สำเร็จ: " + invoiceUpdateError.message);
  return;
}

router.push(`/receipts/${receipt.id}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "32px",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>
              สร้างใบเสร็จรับเงิน
            </h1>

            <p style={{ color: "#6b7280" }}>
              เลือก Invoice ที่ชำระแล้ว
            </p>
          </div>

          <button
            onClick={() => router.push("/receipts/list")}
            style={secondaryButton}
          >
            รายการใบเสร็จ
          </button>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>Invoice</th>
                <th style={th}>ลูกค้า</th>
                <th style={th}>โครงการ / งาน</th>
                <th style={{ ...th, textAlign: "right" }}>
                  ยอดสุทธิ
                </th>
                <th style={{ ...th, textAlign: "center" }}>
                  จัดการ
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={empty}>
                    กำลังโหลด...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} style={empty}>
                    ยังไม่มี Invoice ที่ชำระแล้ว
                  </td>
                </tr>
              ) : (
                invoices.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderTop: "1px solid #e5e7eb",
                    }}
                  >
                    <td style={td}>
                      <strong>{item.invoice_no}</strong>
                    </td>

                    <td style={td}>
                      {customerName(item)}
                    </td>

                    <td style={td}>
                      {item.project_name || "-"}
                    </td>

                    <td style={{ ...td, textAlign: "right" }}>
                      <strong>
                        ฿{money(item.grand_total)}
                      </strong>
                    </td>

                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        disabled={creatingId === item.id}
                        onClick={() => createReceipt(item)}
                        style={{
                          ...primaryButton,
                          opacity:
                            creatingId === item.id ? 0.6 : 1,
                        }}
                      >
                        {creatingId === item.id
                          ? "กำลังสร้าง..."
                          : "สร้างใบเสร็จ"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

const primaryButton = {
  padding: "9px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "700",
};

const secondaryButton = {
  padding: "9px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: "600",
};

const th = {
  padding: "14px",
  textAlign: "left",
};

const td = {
  padding: "14px",
};

const empty = {
  padding: "40px",
  textAlign: "center",
  color: "#6b7280",
};
