"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function ProductionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [quotations, setQuotations] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadProduction();
  }, []);

  async function loadProduction() {
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
        id,
        quotation_no,
        project_name,
        grand_total,
        status,
        created_at,

        customers (
          customer_code,
          company_name,
          contact_name,
          phone
        ),

        production_jobs (
          id,
          status,
          started_at,
          completed_at,
          qc_sent_at,
          note,

          qc_jobs (
            id,
            status
          )
        )
      `)
      .in("status", ["sent", "approved"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("production load error:", error);

      alert(
        "โหลดงานผลิตไม่สำเร็จ: " +
          error.message
      );

      setLoading(false);
      return;
    }

    setQuotations(data || []);
    setLoading(false);
  }

  // ==========================================
  // PRODUCTION JOB HELPERS
  // ==========================================

  function getJobs(item) {
    if (!item?.production_jobs) {
      return [];
    }

    if (
      Array.isArray(item.production_jobs)
    ) {
      return item.production_jobs;
    }

    return [item.production_jobs];
  }

  function jobRank(status) {
    const ranks = {
      ready: 1,
      producing: 2,
      completed: 3,
      qc: 4,
    };

    return ranks[status] || 0;
  }

  function jobTime(job) {
    const value =
      job?.qc_sent_at ||
      job?.completed_at ||
      job?.started_at ||
      null;

    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();

    return Number.isNaN(time)
      ? 0
      : time;
  }

  /*
    สำคัญ:
    ห้ามใช้ production_jobs[0]
    เพราะอาจเป็น record เก่า

    เราจะเลือก job ที่เดินไปไกลที่สุด
    qc > completed > producing > ready

    ถ้าสถานะเท่ากัน
    ใช้ record ที่มีเวลาล่าสุด
  */
  function getJob(item) {
    const jobs = getJobs(item);

    if (jobs.length === 0) {
      return null;
    }

    return [...jobs].sort((a, b) => {
      const rankDiff =
        jobRank(b?.status) -
        jobRank(a?.status);

      if (rankDiff !== 0) {
        return rankDiff;
      }

      return jobTime(b) - jobTime(a);
    })[0];
  }

  function getQcJobs(job) {
    if (!job?.qc_jobs) {
      return [];
    }

    if (Array.isArray(job.qc_jobs)) {
      return job.qc_jobs;
    }

    return [job.qc_jobs];
  }

  /*
    ถ้างานผ่าน QC แล้ว
    ถือว่าออกจากคิว Production แล้ว

    จึงไม่ควรย้อนกลับมาแสดง
    "พร้อมผลิต"
  */
  function hasPassedQc(item) {
    const jobs = getJobs(item);

    return jobs.some((job) => {
      const qcJobs = getQcJobs(job);

      return qcJobs.some((qc) =>
        [
          "passed",
          "approved",
          "completed",
        ].includes(qc?.status)
      );
    });
  }

  function money(value) {
    return new Intl.NumberFormat(
      "th-TH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(value || 0));
  }

  function customerName(item) {
    return (
      item?.customers?.company_name ||
      item?.customers?.contact_name ||
      item?.customers?.customer_code ||
      "-"
    );
  }

  // ==========================================
  // STATUS
  // ==========================================

  function statusInfo(item) {
    const job = getJob(item);

    if (job?.status === "qc") {
      return {
        key: "qc",
        label: "ส่ง QC แล้ว",
        bg: "#f3e8ff",
        color: "#7e22ce",
      };
    }

    if (job?.status === "completed") {
      return {
        key: "completed",
        label: "ผลิตเสร็จ",
        bg: "#e0e7ff",
        color: "#4338ca",
      };
    }

    if (job?.status === "producing") {
      return {
        key: "producing",
        label: "กำลังผลิต",
        bg: "#dbeafe",
        color: "#1d4ed8",
      };
    }

    if (job?.status === "ready") {
      return {
        key: "ready",
        label: "พร้อมผลิต",
        bg: "#dcfce7",
        color: "#15803d",
      };
    }

    if (item?.status === "approved") {
      return {
        key: "ready",
        label: "พร้อมผลิต",
        bg: "#dcfce7",
        color: "#15803d",
      };
    }

    return {
      key: "waiting",
      label: "รอยืนยัน",
      bg: "#fef3c7",
      color: "#b45309",
    };
  }

  function openJob(item) {
    if (item?.status === "approved") {
      router.push(
        `/production/${item.id}`
      );
      return;
    }

    router.push(
      `/quotations/${item.id}`
    );
  }

  // ==========================================
  // ROWS
  // ==========================================

  const rows = useMemo(() => {
    return quotations
      .filter((item) => {
        /*
          งานที่ผ่าน QC แล้ว
          ไม่ควรอยู่ในคิวงานผลิตอีก
        */
        return !hasPassedQc(item);
      })
      .map((item) => ({
        ...item,
        productionStatus:
          statusInfo(item),
      }));
  }, [quotations]);

  const filtered = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((item) => {
      return (
        item?.quotation_no
          ?.toLowerCase()
          .includes(keyword) ||

        item?.project_name
          ?.toLowerCase()
          .includes(keyword) ||

        customerName(item)
          .toLowerCase()
          .includes(keyword) ||

        item?.productionStatus?.label
          ?.toLowerCase()
          .includes(keyword)
      );
    });
  }, [rows, search]);

  // ==========================================
  // SUMMARY
  // ==========================================

  const readyCount = rows.filter(
    (item) =>
      item.productionStatus.key ===
      "ready"
  ).length;

  const producingCount = rows.filter(
    (item) =>
      item.productionStatus.key ===
      "producing"
  ).length;

  const completedCount = rows.filter(
    (item) =>
      item.productionStatus.key ===
      "completed"
  ).length;

  const qcCount = rows.filter(
    (item) =>
      item.productionStatus.key ===
      "qc"
  ).length;

  const waitingCount = rows.filter(
    (item) =>
      item.productionStatus.key ===
      "waiting"
  ).length;

  const totalValue = rows.reduce(
    (sum, item) =>
      sum +
      Number(item?.grand_total || 0),
    0
  );

  // ==========================================
  // UI
  // ==========================================

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
            gap: "12px",
            flexWrap: "wrap",
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
              งานผลิต
            </h1>

            <p
              style={{
                color: "#6b7280",
                marginTop: "6px",
              }}
            >
              ติดตามงานตั้งแต่พร้อมผลิต
              จนถึงส่ง QC
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() =>
                router.push("/qc")
              }
              style={secondaryButton}
            >
              QC ตรวจสอบงาน
            </button>

            <button
              onClick={() =>
                router.push(
                  "/quotations/list"
                )
              }
              style={secondaryButton}
            >
              ใบเสนอราคา
            </button>

            <button
              onClick={() =>
                router.push("/")
              }
              style={secondaryButton}
            >
              ← Dashboard
            </button>
          </div>
        </div>

        {/* SUMMARY */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(6, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <Card
            title="งานทั้งหมด"
            value={
              loading
                ? "..."
                : `${rows.length} งาน`
            }
          />

          <Card
            title="พร้อมผลิต"
            value={
              loading
                ? "..."
                : `${readyCount} งาน`
            }
          />

          <Card
            title="กำลังผลิต"
            value={
              loading
                ? "..."
                : `${producingCount} งาน`
            }
          />

          <Card
            title="ผลิตเสร็จ"
            value={
              loading
                ? "..."
                : `${completedCount} งาน`
            }
          />

          <Card
            title="ส่ง QC แล้ว"
            value={
              loading
                ? "..."
                : `${qcCount} งาน`
            }
          />

          <Card
            title="รอยืนยัน"
            value={
              loading
                ? "..."
                : `${waitingCount} งาน`
            }
          />
        </div>

        {/* SEARCH */}

        <div
          style={{
            background: "white",
            padding: "14px",
            borderRadius: "12px",
            marginBottom: "16px",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="ค้นหาเลขที่ใบเสนอราคา / ลูกค้า / ชื่องาน / สถานะ"
            style={{
              width: "100%",
              padding: "12px",
              boxSizing:
                "border-box",
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
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
          <div
            style={{
              padding: "18px 20px",
              borderBottom:
                "1px solid #e5e7eb",
              display: "flex",
              justifyContent:
                "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
              }}
            >
              รายการงานผลิต
            </h2>

            <strong>
              มูลค่ารวม ฿
              {money(totalValue)}
            </strong>
          </div>

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
                minWidth: "950px",
              }}
            >
              <thead
                style={{
                  background:
                    "#f9fafb",
                }}
              >
                <tr>
                  <th style={th}>
                    เลขที่
                  </th>

                  <th style={th}>
                    ลูกค้า
                  </th>

                  <th style={th}>
                    โครงการ / งาน
                  </th>

                  <th
                    style={{
                      ...th,
                      textAlign:
                        "right",
                    }}
                  >
                    มูลค่างาน
                  </th>

                  <th
                    style={{
                      ...th,
                      textAlign:
                        "center",
                    }}
                  >
                    สถานะงานผลิต
                  </th>

                  <th
                    style={{
                      ...th,
                      textAlign:
                        "center",
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
                      colSpan={6}
                      style={empty}
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : filtered.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={empty}
                    >
                      ไม่มีงานที่อยู่ในขั้นตอนผลิต
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (item) => {
                      const status =
                        item.productionStatus;

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
                            style={td}
                          >
                            <strong>
                              {
                                item.quotation_no
                              }
                            </strong>
                          </td>

                          <td
                            style={td}
                          >
                            <div>
                              {customerName(
                                item
                              )}
                            </div>

                            {item
                              ?.customers
                              ?.phone && (
                              <div
                                style={{
                                  marginTop:
                                    "3px",
                                  color:
                                    "#6b7280",
                                  fontSize:
                                    "12px",
                                }}
                              >
                                {
                                  item
                                    .customers
                                    .phone
                                }
                              </div>
                            )}
                          </td>

                          <td
                            style={td}
                          >
                            {item.project_name ||
                              "-"}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "right",
                            }}
                          >
                            <strong>
                              ฿
                              {money(
                                item.grand_total
                              )}
                            </strong>
                          </td>

                          <td
                            style={{
                              ...td,
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
                                  status.bg,
                                color:
                                  status.color,
                                fontWeight:
                                  "700",
                                fontSize:
                                  "12px",
                              }}
                            >
                              {
                                status.label
                              }
                            </span>
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "center",
                            }}
                          >
                            <button
                              onClick={() =>
                                openJob(
                                  item
                                )
                              }
                              style={
                                primaryButton
                              }
                            >
                              เปิดดู
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

// ==========================================
// COMPONENTS
// ==========================================

function Card({ title, value }) {
  return (
    <div
      style={{
        background: "white",
        padding: "18px",
        borderRadius: "12px",
        boxShadow:
          "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: "12px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "23px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ==========================================
// STYLES
// ==========================================

const primaryButton = {
  padding: "8px 13px",
  border: "none",
  borderRadius: "7px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "700",
};

const secondaryButton = {
  padding: "9px 14px",
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: "600",
};

const th = {
  padding: "14px",
  textAlign: "left",
  color: "#374151",
  fontSize: "13px",
};

const td = {
  padding: "14px",
  color: "#111827",
  fontSize: "13px",
};

const empty = {
  padding: "40px",
  textAlign: "center",
  color: "#6b7280",
};