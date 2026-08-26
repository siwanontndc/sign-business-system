"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const STATUS_LABELS = {
  all: "ทั้งหมด",
  draft: "แบบร่าง",
  sent: "ส่งแล้ว",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิก",
};

const STATUS_COLORS = {
  draft: {
    background: "#f3f4f6",
    color: "#374151",
  },
  sent: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  approved: {
    background: "#dcfce7",
    color: "#15803d",
  },
  rejected: {
    background: "#fee2e2",
    color: "#b91c1c",
  },
  cancelled: {
    background: "#fef3c7",
    color: "#b45309",
  },
};

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
  const [statusFilter, setStatusFilter] = useState("all");

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
      alert(
        "โหลดใบเสนอราคาไม่สำเร็จ: " +
          error.message
      );
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
      alert(
        "ลบใบเสนอราคาไม่สำเร็จ: " +
          error.message
      );
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

    return new Date(value).toLocaleDateString(
      "th-TH",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
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

  function getStatusLabel(status) {
    return (
      STATUS_LABELS[status] ||
      status ||
      "แบบร่าง"
    );
  }

  function getStatusStyle(status) {
    return (
      STATUS_COLORS[status] ||
      STATUS_COLORS.draft
    );
  }

  const filteredQuotations = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    return quotations.filter((item) => {
      const customer =
        getCustomerName(item).toLowerCase();

      const matchesSearch =
        !keyword ||
        item.quotation_no
          ?.toLowerCase()
          .includes(keyword) ||
        item.project_name
          ?.toLowerCase()
          .includes(keyword) ||
        customer.includes(keyword);

      const matchesStatus =
        statusFilter === "all" ||
        item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    quotations,
    search,
    statusFilter,
  ]);

  const totalValue = useMemo(() => {
    return filteredQuotations.reduce(
      (sum, item) =>
        sum +
        Number(item.grand_total || 0),
      0
    );
  }, [filteredQuotations]);

  const statusSummary = useMemo(() => {
    const summary = {
      draft: 0,
      sent: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };

    quotations.forEach((item) => {
      if (
        Object.prototype.hasOwnProperty.call(
          summary,
          item.status
        )
      ) {
        summary[item.status] += 1;
      }
    });

    return summary;
  }, [quotations]);

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
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
            flexWrap: "wrap",
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
              ดูและจัดการใบเสนอราคาของ
              THANEE ADVERTISING
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              onClick={() =>
                router.push("/")
              }
              style={{
                ...buttonStyle,
                background: "white",
                border:
                  "1px solid #d1d5db",
              }}
            >
              ← Dashboard
            </button>

            <button
              onClick={() =>
                router.push(
                  "/quotations"
                )
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
          <SummaryCard
            title="จำนวนใบเสนอราคา"
            value={`${filteredQuotations.length} ใบ`}
          />

          <SummaryCard
            title="มูลค่ารวม"
            value={`฿${formatMoney(
              totalValue
            )}`}
            valueColor="#2563eb"
          />

          <SummaryCard
            title="อนุมัติแล้ว"
            value={`${statusSummary.approved} ใบ`}
            valueColor="#15803d"
          />
        </div>

        {/* STATUS CARDS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(5, minmax(0, 1fr))",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            "draft",
            "sent",
            "approved",
            "rejected",
            "cancelled",
          ].map((status) => {
            const color =
              getStatusStyle(status);

            return (
              <button
                key={status}
                onClick={() =>
                  setStatusFilter(
                    statusFilter === status
                      ? "all"
                      : status
                  )
                }
                style={{
                  border:
                    statusFilter === status
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                  background: "white",
                  borderRadius: "10px",
                  padding: "14px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  {getStatusLabel(
                    status
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "22px",
                    }}
                  >
                    {statusSummary[
                      status
                    ] || 0}
                  </strong>

                  <span
                    style={{
                      display:
                        "inline-block",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background:
                        color.background,
                      border: `2px solid ${color.color}`,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* FILTER */}
        <div
          style={{
            background: "white",
            padding: "16px",
            borderRadius: "12px",
            marginBottom: "16px",
            display: "grid",
            gridTemplateColumns:
              "1fr 220px",
            gap: "12px",
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
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
              boxSizing: "border-box",
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: "12px 14px",
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
              background: "white",
            }}
          >
            <option value="all">
              ทุกสถานะ
            </option>
            <option value="draft">
              แบบร่าง
            </option>
            <option value="sent">
              ส่งแล้ว
            </option>
            <option value="approved">
              อนุมัติ
            </option>
            <option value="rejected">
              ปฏิเสธ
            </option>
            <option value="cancelled">
              ยกเลิก
            </option>
          </select>
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
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: "1100px",
              }}
            >
              <thead
                style={{
                  background:
                    "#f9fafb",
                }}
              >
                <tr>
                  <th style={thLeft}>
                    เลขที่
                  </th>

                  <th style={thLeft}>
                    วันที่
                  </th>

                  <th style={thLeft}>
                    ลูกค้า
                  </th>

                  <th style={thLeft}>
                    โครงการ / งาน
                  </th>

                  <th style={thRight}>
                    ยอดสุทธิ
                  </th>

                  <th style={thCenter}>
                    สถานะ
                  </th>

                  <th style={thCenter}>
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
                        textAlign:
                          "center",
                      }}
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : filteredQuotations.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        padding: "40px",
                        textAlign:
                          "center",
                        color:
                          "#6b7280",
                      }}
                    >
                      ไม่พบใบเสนอราคา
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map(
                    (item) => {
                      const statusStyle =
                        getStatusStyle(
                          item.status
                        );

                      return (
                        <tr
                          key={
                            item.id
                          }
                          style={{
                            borderTop:
                              "1px solid #e5e7eb",
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "14px",
                              fontWeight:
                                "700",
                            }}
                          >
                            {
                              item.quotation_no
                            }
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                            }}
                          >
                            {formatDate(
                              item.quotation_date
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                            }}
                          >
                            {getCustomerName(
                              item
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                            }}
                          >
                            {
                              item.project_name
                            }
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                              textAlign:
                                "right",
                              fontWeight:
                                "700",
                            }}
                          >
                            ฿
                            {formatMoney(
                              item.grand_total
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                              textAlign:
                                "center",
                            }}
                          >
                            <span
                              style={{
                                display:
                                  "inline-block",
                                padding:
                                  "6px 11px",
                                borderRadius:
                                  "999px",
                                background:
                                  statusStyle.background,
                                color:
                                  statusStyle.color,
                                fontSize:
                                  "13px",
                                fontWeight:
                                  "700",
                              }}
                            >
                              {getStatusLabel(
                                item.status
                              )}
                            </span>
                          </td>

                          <td
                            style={{
                              padding:
                                "14px",
                              textAlign:
                                "center",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            <button
                              onClick={() =>
                                router.push(
                                  `/quotations/${item.id}`
                                )
                              }
                              style={{
                                ...buttonStyle,
                                background:
                                  "#2563eb",
                                color:
                                  "white",
                                marginRight:
                                  "8px",
                              }}
                            >
                              เปิดดู
                            </button>

                            <button
                              onClick={() =>
                                handleDelete(
                                  item.id,
                                  item.quotation_no
                                )
                              }
                              style={{
                                ...buttonStyle,
                                background:
                                  "#dc2626",
                                color:
                                  "white",
                              }}
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  valueColor = "#111827",
}) {
  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow:
          "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          color: "#6b7280",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "26px",
          fontWeight: "700",
          marginTop: "8px",
          color: valueColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const thLeft = {
  padding: "14px",
  textAlign: "left",
};

const thRight = {
  padding: "14px",
  textAlign: "right",
};

const thCenter = {
  padding: "14px",
  textAlign: "center",
};