"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function FinancePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);

  useEffect(() => {
    loadFinance();
  }, []);

  async function loadFinance() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const [invoiceResult, receiptResult] = await Promise.all([
      supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          project_name,
          grand_total,
          status,
          created_at,
          customers (
            customer_code,
            company_name,
            contact_name
          )
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("receipts")
        .select(`
          id,
          receipt_no,
          project_name,
          grand_total,
          status,
          created_at,
          customers (
            customer_code,
            company_name,
            contact_name
          )
        `)
        .order("created_at", { ascending: false }),
    ]);

    if (invoiceResult.error) {
      alert("โหลด Invoice ไม่สำเร็จ: " + invoiceResult.error.message);
    }

    if (receiptResult.error) {
      alert("โหลด Receipt ไม่สำเร็จ: " + receiptResult.error.message);
    }

    setInvoices(invoiceResult.data || []);
    setReceipts(receiptResult.data || []);
    setLoading(false);
  }

  function money(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function customerName(item) {
    return (
      item.customers?.company_name ||
      item.customers?.contact_name ||
      item.customers?.customer_code ||
      "-"
    );
  }

  const totalInvoiced = useMemo(() => {
    return invoices
      .filter((item) => item.status !== "cancelled")
      .reduce((sum, item) => sum + Number(item.grand_total || 0), 0);
  }, [invoices]);

  const totalPaid = useMemo(() => {
    return receipts
      .filter((item) => item.status === "received")
      .reduce((sum, item) => sum + Number(item.grand_total || 0), 0);
  }, [receipts]);

  const receivable = useMemo(() => {
    return invoices
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.grand_total || 0), 0);
  }, [invoices]);

  const paidInvoices = useMemo(() => {
    return invoices.filter((item) => item.status === "paid");
  }, [invoices]);

  const pendingInvoices = useMemo(() => {
    return invoices.filter((item) => item.status === "pending");
  }, [invoices]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        color: "#111827",
        padding: "32px",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "32px" }}>การเงิน</h1>
            <p style={{ color: "#6b7280", marginTop: "6px" }}>
              สรุปรายรับ ลูกหนี้ และเอกสารทางการเงิน
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/invoices/list")}
              style={secondaryButton}
            >
              ใบแจ้งหนี้
            </button>

            <button
              onClick={() => router.push("/receipts/list")}
              style={secondaryButton}
            >
              ใบเสร็จรับเงิน
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
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <SummaryCard
            title="ยอด Invoice ทั้งหมด"
            value={loading ? "..." : `฿${money(totalInvoiced)}`}
            sub={`${invoices.length} ใบ`}
          />

          <SummaryCard
            title="รับชำระแล้ว"
            value={loading ? "..." : `฿${money(totalPaid)}`}
            sub={`${receipts.length} ใบเสร็จ`}
          />

          <SummaryCard
            title="ลูกหนี้คงค้าง"
            value={loading ? "..." : `฿${money(receivable)}`}
            sub={`${pendingInvoices.length} Invoice รอชำระ`}
          />

          <SummaryCard
            title="Invoice ชำระแล้ว"
            value={loading ? "..." : `${paidInvoices.length} ใบ`}
            sub="พร้อมออกใบเสร็จ"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <section style={boxStyle}>
            <div style={sectionHeader}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>
                ลูกหนี้รอชำระ
              </h2>

              <button
                onClick={() => router.push("/invoices/list")}
                style={linkButton}
              >
                ดูทั้งหมด
              </button>
            </div>

            <div>
              {loading ? (
                <div style={emptyStyle}>กำลังโหลด...</div>
              ) : pendingInvoices.length === 0 ? (
                <div style={emptyStyle}>ไม่มีลูกหนี้คงค้าง</div>
              ) : (
                pendingInvoices.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/invoices/${item.id}`)}
                    style={rowStyle}
                  >
                    <div>
                      <strong>{item.invoice_no}</strong>
                      <div style={subText}>{customerName(item)}</div>
                      <div style={subText}>
                        {item.project_name || "-"}
                      </div>
                    </div>

                    <strong>฿{money(item.grand_total)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <section style={boxStyle}>
            <div style={sectionHeader}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>
                รายรับล่าสุด
              </h2>

              <button
                onClick={() => router.push("/receipts/list")}
                style={linkButton}
              >
                ดูทั้งหมด
              </button>
            </div>

            <div>
              {loading ? (
                <div style={emptyStyle}>กำลังโหลด...</div>
              ) : receipts.length === 0 ? (
                <div style={emptyStyle}>ยังไม่มีรายรับ</div>
              ) : (
                receipts.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/receipts/${item.id}`)}
                    style={rowStyle}
                  >
                    <div>
                      <strong>{item.receipt_no}</strong>
                      <div style={subText}>{customerName(item)}</div>
                      <div style={subText}>
                        {item.project_name || "-"}
                      </div>
                    </div>

                    <strong style={{ color: "#15803d" }}>
                      ฿{money(item.grand_total)}
                    </strong>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section style={boxStyle}>
          <div style={sectionHeader}>
            <h2 style={{ margin: 0, fontSize: "20px" }}>
              สรุป Invoice ทั้งหมด
            </h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "800px",
              }}
            >
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={th}>เลขที่</th>
                  <th style={th}>ลูกค้า</th>
                  <th style={th}>โครงการ / งาน</th>
                  <th style={{ ...th, textAlign: "right" }}>ยอดสุทธิ</th>
                  <th style={{ ...th, textAlign: "center" }}>สถานะ</th>
                  <th style={{ ...th, textAlign: "center" }}>จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={emptyStyle}>
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={emptyStyle}>
                      ยังไม่มี Invoice
                    </td>
                  </tr>
                ) : (
                  invoices.map((item) => (
                    <tr
                      key={item.id}
                      style={{ borderTop: "1px solid #e5e7eb" }}
                    >
                      <td style={td}>
                        <strong>{item.invoice_no}</strong>
                      </td>

                      <td style={td}>{customerName(item)}</td>

                      <td style={td}>{item.project_name || "-"}</td>

                      <td style={{ ...td, textAlign: "right" }}>
                        <strong>฿{money(item.grand_total)}</strong>
                      </td>

                      <td style={{ ...td, textAlign: "center" }}>
                        {item.status === "paid"
                          ? "ชำระแล้ว"
                          : item.status === "pending"
                          ? "รอชำระ"
                          : "ยกเลิก"}
                      </td>

                      <td style={{ ...td, textAlign: "center" }}>
                        <button
                          onClick={() =>
                            router.push(`/invoices/${item.id}`)
                          }
                          style={primaryButton}
                        >
                          เปิดดู
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ title, value, sub }) {
  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: "13px" }}>
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "27px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "6px",
          color: "#9ca3af",
          fontSize: "12px",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

const boxStyle = {
  background: "white",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const sectionHeader = {
  padding: "18px 20px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const rowStyle = {
  padding: "14px 20px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  gap: "20px",
  cursor: "pointer",
};

const subText = {
  marginTop: "3px",
  color: "#6b7280",
  fontSize: "12px",
};

const primaryButton = {
  padding: "8px 12px",
  border: "none",
  borderRadius: "7px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "600",
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

const linkButton = {
  border: "none",
  background: "transparent",
  color: "#2563eb",
  cursor: "pointer",
  fontWeight: "600",
};

const th = {
  padding: "13px 14px",
  textAlign: "left",
  fontSize: "13px",
  color: "#374151",
};

const td = {
  padding: "13px 14px",
  fontSize: "13px",
  color: "#111827",
};

const emptyStyle = {
  padding: "35px",
  textAlign: "center",
  color: "#6b7280",
};
