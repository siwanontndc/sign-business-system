"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
export default function ReceiptListPage() {
  const router = useRouter();

  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadReceipts();
  }, []);

  async function loadReceipts() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("receipts")
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
      alert("โหลดใบเสร็จไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }

    setReceipts(data || []);
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

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return receipts;

    return receipts.filter((item) => {
      return (
        item.receipt_no?.toLowerCase().includes(keyword) ||
        item.project_name?.toLowerCase().includes(keyword) ||
        customerName(item).toLowerCase().includes(keyword)
      );
    });
  }, [receipts, search]);

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
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "22px",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>รายการใบเสร็จรับเงิน</h1>
            <p style={{ color: "#6b7280" }}>
              THANEE ADVERTISING
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => router.push("/receipts")}
              style={primaryButton}
            >
              + สร้างใบเสร็จ
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
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <Card
            title="จำนวนใบเสร็จ"
            value={`${filtered.length} ใบ`}
          />

          <Card
            title="ยอดรับชำระรวม"
            value={`฿${money(total)}`}
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
            placeholder="ค้นหาเลขที่ใบเสร็จ / ลูกค้า / ชื่องาน"
            style={{
              width: "100%",
              padding: "12px",
              boxSizing: "border-box",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              background: "white",
              color: "#111827",
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
                <th style={th}>เลขที่ใบเสร็จ</th>
                <th style={th}>ลูกค้า</th>
                <th style={th}>โครงการ / งาน</th>
                <th style={{ ...th, textAlign: "right" }}>
                  ยอดรับชำระ
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
                  <td colSpan={6} style={empty}>
                    กำลังโหลด...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={empty}>
                    ยังไม่มีใบเสร็จรับเงิน
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderTop: "1px solid #e5e7eb" }}
                  >
                    <td style={td}>
                      <strong>{item.receipt_no}</strong>
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
                      {item.status === "received"
                        ? "รับชำระแล้ว"
                        : "ยกเลิก"}
                    </td>

                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={() =>
                          router.push(`/receipts/${item.id}`)
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
          color: "#111827",
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
  color: "#111827",
};

const td = {
  padding: "14px",
  color: "#111827",
};

const empty = {
  padding: "40px",
  textAlign: "center",
  color: "#6b7280",
};
