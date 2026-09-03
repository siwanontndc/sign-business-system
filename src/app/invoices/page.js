"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function InvoicesPage() {
  const router = useRouter();

  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState(null);

  useEffect(() => {
    loadQuotations();
  }, []);

  async function loadQuotations() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("quotations")
      .select(`
        *,
        customers (
          customer_code,
          company_name,
          contact_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      alert("โหลดใบเสนอราคาไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }

    setQuotations(data || []);
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

  function formatMoney(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  async function createInvoice(quotation) {
    if (creatingId) return;

    setCreatingId(quotation.id);

    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_no")
      .eq("quotation_id", quotation.id)
      .maybeSingle();

    if (existing) {
      const openExisting = confirm(
        `ใบเสนอราคานี้มีใบแจ้งหนี้ ${existing.invoice_no} แล้ว\nต้องการเปิดดูหรือไม่?`
      );

      setCreatingId(null);

      if (openExisting) {
        router.push(`/invoices/${existing.id}`);
      }

      return;
    }

    const { data: quotationItems, error: itemsError } =
      await supabase
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", quotation.id)
        .order("created_at", { ascending: true });

    if (itemsError) {
      alert("โหลดรายการไม่สำเร็จ: " + itemsError.message);
      setCreatingId(null);
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const running = String(Date.now()).slice(-6);
    const invoiceNo = `INV-${year}-${running}`;

    const invoiceDate = now.toISOString().slice(0, 10);

    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);

    const { data: invoice, error: invoiceError } =
      await supabase
        .from("invoices")
        .insert([
          {
            invoice_no: invoiceNo,
            quotation_id: quotation.id,
            customer_id: quotation.customer_id,
            project_name: quotation.project_name,
            invoice_date: invoiceDate,
            due_date: dueDate,
            subtotal: Number(quotation.subtotal || 0),
            discount: Number(quotation.discount || 0),
            vat_percent: Number(quotation.vat_percent || 0),
            vat_amount: Number(quotation.vat_amount || 0),
            grand_total: Number(quotation.grand_total || 0),
            note: quotation.note || "",
            status: "pending",
          },
        ])
        .select()
        .single();

    if (invoiceError) {
      alert("สร้างใบแจ้งหนี้ไม่สำเร็จ: " + invoiceError.message);
      setCreatingId(null);
      return;
    }

    const invoiceItems = (quotationItems || []).map((item) => ({
      invoice_id: invoice.id,
      description: item.description,
      width: item.width,
      height: item.height,
      quantity: Number(item.quantity || 0),
      unit: item.unit,
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.amount ?? item.line_total ?? 0),
    }));

    if (invoiceItems.length > 0) {
      const { error: insertItemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (insertItemsError) {
        alert(
          "สร้างรายการใบแจ้งหนี้ไม่สำเร็จ: " +
            insertItemsError.message
        );
        setCreatingId(null);
        return;
      }
    }

    setCreatingId(null);
    router.push(`/invoices/${invoice.id}`);
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
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>สร้างใบแจ้งหนี้</h1>
            <p style={{ color: "#6b7280" }}>
              สร้าง Invoice จากใบเสนอราคาเดิมได้ทันที
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => router.push("/invoices/list")}
              style={secondaryButton}
            >
              รายการใบแจ้งหนี้
            </button>

            <button
              onClick={() => router.push("/")}
              style={secondaryButton}
            >
              ← Dashboard
            </button>
          </div>
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
                <th style={th}>ใบเสนอราคา</th>
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
                  <td colSpan="5" style={empty}>
                    กำลังโหลด...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan="5" style={empty}>
                    ยังไม่มีใบเสนอราคา
                  </td>
                </tr>
              ) : (
                quotations.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderTop: "1px solid #e5e7eb" }}
                  >
                    <td style={td}>
                      <strong>{item.quotation_no}</strong>
                    </td>

                    <td style={td}>{customerName(item)}</td>

                    <td style={td}>
                      {item.project_name || "-"}
                    </td>

                    <td style={{ ...td, textAlign: "right" }}>
                      <strong>
                        ฿{formatMoney(item.grand_total)}
                      </strong>
                    </td>

                    <td
                      style={{
                        ...td,
                        textAlign: "center",
                      }}
                    >
                      <button
                        disabled={creatingId === item.id}
                        onClick={() => createInvoice(item)}
                        style={{
                          ...primaryButton,
                          opacity:
                            creatingId === item.id ? 0.6 : 1,
                        }}
                      >
                        {creatingId === item.id
                          ? "กำลังสร้าง..."
                          : "สร้างใบแจ้งหนี้"}
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
