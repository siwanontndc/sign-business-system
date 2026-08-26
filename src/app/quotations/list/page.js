"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const buttonStyle = {
  border: "none",
  borderRadius: "7px",
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: "600",
};

export default function QuotationListPage() {
  const router = useRouter();

  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadQuotations();
  }, []);

  async function loadQuotations() {
    setLoading(true);

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
      console.error(error);
      alert("โหลดใบเสนอราคาไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }

    setQuotations(data || []);
    setLoading(false);
  }

  async function handleDelete(id, quotationNo) {
    const ok = confirm(
      `ต้องการลบใบเสนอราคา ${quotationNo} ใช่หรือไม่?`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("quotations")
      .delete()
      .eq("id", id);

    if (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
      return;
    }

    setQuotations((prev) =>
      prev.filter((item) => item.id !== id)
    );
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "-";

    return new Date(value).toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function getCustomerName(item) {
    const customer = item.customers;

    if (!customer) return "-";

    return (
      customer.company_name ||
      customer.contact_name ||
      customer.customer_code ||
      "-"
    );
  }

  const filteredQuotations = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return quotations;

    return quotations.filter((item) => {
      const customer = getCustomerName(item).toLowerCase();

      return (
        item.quotation_no?.toLowerCase().includes(keyword) ||
        item.project_name?.toLowerCase().includes(keyword) ||
        customer.includes(keyword)
      );
    });
  }, [quotations, search]);

  const totalValue = useMemo(() => {
    return filteredQuotations.reduce(
      (sum, item) =>
        sum + Number(item.grand_total || 0),
      0
    );
  }, [filteredQuotations]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "32px",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "32px",
              }}
            >
              รายการใบเสนอราคา
            </h1>

            <p
              style={{
                color: "#6b7280",
                marginTop: "6px",
              }}
            >
              ดูและจัดการใบเสนอราคาของ SIGN BUSINESS
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              onClick={() => router.push("/")}
              style={{
                ...buttonStyle,
                background: "white",
                border: "1px solid #d1d5db",
              }}
            >
              ← Dashboard
            </button>

            <button
              onClick={() =>
                router.push("/quotations/new")
              }
              style={{
                ...buttonStyle,
                background: "#2563eb",
                color: "white",
              }}
            >
              + สร้างใบเสนอราคา
            </button>
          </div>
        </div>

        {/* SUMMARY */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ color: "#6b7280" }}>
              จำนวนใบเสนอราคา
            </div>

            <div
              style={{
                fontSize: "26px",
                fontWeight: "700",
                marginTop: "8px",
              }}
            >
              {filteredQuotations.length} ใบ
            </div>
          </div>

          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ color: "#6b7280" }}>
              มูลค่ารวม
            </div>

            <div
              style={{
                fontSize: "26px",
                fontWeight: "700",
                marginTop: "8px",
                color: "#2563eb",
              }}
            >
              ฿{formatMoney(totalValue)}
            </div>
          </div>

          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ color: "#6b7280" }}>
              สถานะ
            </div>

            <div
              style={{
                fontSize: "26px",
                fontWeight: "700",
                marginTop: "8px",
              }}
            >
              Draft
            </div>
          </div>
        </div>

        {/* SEARCH */}
        <div
          style={{
            background: "white",
            padding: "16px",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="ค้นหาเลขที่ใบเสนอราคา / ลูกค้า / ชื่องาน"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* TABLE */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "1100px",
              }}
            >
              <thead
                style={{
                  background: "#f9fafb",
                }}
              >
                <tr>
                  <th
                    style={{
                      padding: "14px",
                      textAlign: "left",
                    }}
                  >
                    เลขที่
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "left",
                    }}
                  >
                    วันที่
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "left",
                    }}
                  >
                    ลูกค้า
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "left",
                    }}
                  >
                    โครงการ / งาน
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "right",
                    }}
                  >
                    ยอดสุทธิ
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "center",
                    }}
                  >
                    สถานะ
                  </th>

                  <th
                    style={{
                      padding: "14px",
                      textAlign: "center",
                    }}
                  >
                    จัดการ
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        padding: "40px",
                        textAlign: "center",
                      }}
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : filteredQuotations.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      ยังไม่มีใบเสนอราคา
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <td
                        style={{
                          padding: "14px",
                          fontWeight: "600",
                        }}
                      >
                        {item.quotation_no}
                      </td>

                      <td style={{ padding: "14px" }}>
                        {formatDate(
                          item.quotation_date
                        )}
                      </td>

                      <td style={{ padding: "14px" }}>
                        {getCustomerName(item)}
                      </td>

                      <td style={{ padding: "14px" }}>
                        {item.project_name}
                      </td>

                      <td
                        style={{
                          padding: "14px",
                          textAlign: "right",
                          fontWeight: "700",
                        }}
                      >
                        ฿{formatMoney(
                          item.grand_total
                        )}
                      </td>

                      <td
                        style={{
                          padding: "14px",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "5px 10px",
                            borderRadius: "999px",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: "13px",
                            fontWeight: "600",
                          }}
                        >
                          {item.status || "draft"}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "14px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {/* ปุ่มเปิดดูใบเสนอราคา */}
                        <button
                          onClick={() =>
                            router.push(
                              `/quotations/${item.id}`
                            )
                          }
                          style={{
                            ...buttonStyle,
                            background: "#2563eb",
                            color: "white",
                            marginRight: "8px",
                          }}
                        >
                          เปิดดู
                        </button>

                        {/* ปุ่มลบ */}
                        <button
                          onClick={() =>
                            handleDelete(
                              item.id,
                              item.quotation_no
                            )
                          }
                          style={{
                            ...buttonStyle,
                            background: "#dc2626",
                            color: "white",
                          }}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
