"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const STATUS = {
  pending: "รอชำระ",
  paid: "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export default function InvoiceListPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("invoices")
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
      alert("โหลดใบแจ้งหนี้ไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }

    setInvoices(data || []);
    setLoading(false);
  }

  function formatMoney(value) {
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

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();

    if (!key) return invoices;

    return invoices.filter((item) => {
      return (
        item.invoice_no?.toLowerCase().includes(key) ||
        item.project_name?.toLowerCase().includes(key) ||
        customerName(item).toLowerCase().includes(key)
      );
    });
  }, [invoices, search]);

  const total = filtered.reduce(
    (sum, item) => sum + Number(item.grand_total || 0),
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "32px",
      }}
    >
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "22px",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>รายการใบแจ้งหนี้</h1>
            <p style={{ color: "#6b7280" }}>
              THANEE ADVERTISING
            </p>
          </div>

          <button
            onClick={() => router.push("/invoices")}
            style={primaryButton}
          >
            + สร้างใบแจ้งหนี้
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <Card
            title="จำนวนใบแจ้งหนี้"
            value={`${filtered.length} ใบ`}
          />

          <Card
            title="มูลค่ารวม"
            value={`฿${formatMoney(total)}`}
          />
        </div>

        <div
          style={{
            background: "white",
            padding: "14px",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบแจ้งหนี้ / ลูกค้า / ชื่องาน"
            style={{
              width: "100%",
              padding: "12px",
              boxSizing: "border-box",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
            }}
          />
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
                <th style={th}>เลขที่</th>
                <th style={th}>ลูกค้า</th>
                <th style={th}>โครงการ</th>
                <th style={{ ...th, textAlign: "right" }}>
                  ยอดสุทธิ
                </th>
                <th style={{ ...th, textAlign: "center" }}>
                  สถานะ
                </th>
                <th style={{ ...th, textAlign: "center" }}>
                  จัดการ
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={empty}>
                    กำลังโหลด...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" style={empty}>
                    ยังไม่มีใบแจ้งหนี้
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderTop: "1px solid #e5e7eb" }}
                  >
                    <td style={td}>
                      <strong>{item.invoice_no}</strong>
                    </td>

                    <td style={td}>{customerName(item)}</td>

                    <td style={td}>
                      {item.project_name || "-"}
                    </td>

                    <td style={{ ...td, textAlign: "right" }}>
                      ฿{formatMoney(item.grand_total)}
                    </td>

                    <td
                      style={{
                        ...td,
                        textAlign: "center",
                      }}
                    >
                      {STATUS[item.status] || item.status}
                    </td>

                    <td
                      style={{
                        ...td,
                        textAlign: "center",
                      }}
                    >
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
      </div>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "12px",
      }}
    >
      <div style={{ color: "#6b7280" }}>{title}</div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "26px",
          fontWeight: "700",
        }}
      >
        {value}
      </div>
    </div>
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
