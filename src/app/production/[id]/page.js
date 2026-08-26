"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const STATUS_INFO = {
  ready: {
    label: "พร้อมผลิต",
    step: 1,
  },
  producing: {
    label: "กำลังผลิต",
    step: 2,
  },
  in_progress: {
    label: "กำลังผลิต",
    step: 2,
  },
  completed: {
    label: "ผลิตเสร็จ",
    step: 3,
  },
  qc_sent: {
    label: "ส่ง QC แล้ว",
    step: 4,
  },
  sent_qc: {
    label: "ส่ง QC แล้ว",
    step: 4,
  },
};

export default function ProductionDetailPage() {
  const params = useParams();
  const router = useRouter();

  // URL นี้ใช้ quotation id
  const quotationId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quotation, setQuotation] = useState(null);
  const [items, setItems] = useState([]);
  const [productionJob, setProductionJob] = useState(null);

  useEffect(() => {
    if (quotationId) {
      loadPage();
    }
  }, [quotationId]);

  async function loadPage() {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      /* =======================================================
         1. ใบเสนอราคา
      ======================================================= */

      const {
        data: quotationData,
        error: quotationError,
      } = await supabase
        .from("quotations")
        .select(`
          *,
          customers (
            id,
            customer_code,
            company_name,
            contact_name,
            phone,
            email
          )
        `)
        .eq("id", quotationId)
        .single();

      if (quotationError) {
        throw quotationError;
      }

      setQuotation(quotationData);

      /* =======================================================
         2. รายการสินค้า
      ======================================================= */

      const {
        data: itemData,
        error: itemError,
      } = await supabase
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", quotationId)
        .order("sort_order", {
          ascending: true,
        });

      if (itemError) {
        throw itemError;
      }

      setItems(itemData || []);

      /* =======================================================
         3. หา production job ที่มีอยู่แล้ว
         ห้าม insert ซ้ำ quotation_id
      ======================================================= */

      const {
        data: existingJob,
        error: jobError,
      } = await supabase
        .from("production_jobs")
        .select("*")
        .eq("quotation_id", quotationId)
        .maybeSingle();

      if (jobError) {
        throw jobError;
      }

      if (existingJob) {
        setProductionJob(existingJob);
      } else {
        /* =====================================================
           ถ้ายังไม่มี ค่อยสร้าง
        ===================================================== */

        const {
          data: newJob,
          error: createError,
        } = await supabase
          .from("production_jobs")
          .insert({
            quotation_id: quotationId,
            status: "ready",
          })
          .select()
          .single();

        if (createError) {
          // เผื่อถูกสร้างพร้อมกันอีกหน้าหนึ่ง
          if (
            String(createError.message || "").includes(
              "duplicate key"
            )
          ) {
            const {
              data: retryJob,
              error: retryError,
            } = await supabase
              .from("production_jobs")
              .select("*")
              .eq("quotation_id", quotationId)
              .single();

            if (retryError) {
              throw retryError;
            }

            setProductionJob(retryJob);
          } else {
            throw createError;
          }
        } else {
          setProductionJob(newJob);
        }
      }
    } catch (error) {
      console.error("load production:", error);

      alert(
        "โหลดข้อมูลงานผลิตไม่สำเร็จ: " +
          (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setLoading(false);
    }
  }

  /* ===========================================================
     FORMAT
  =========================================================== */

  function money(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }

  function formatItemSize(item) {
    if (item?.size) {
      const value = String(item.size).trim();
      const unit = String(item.unit || "").trim();

      if (
        ["ตร.ม.", "ตร.ม", "ตรม.", "ตรม", "ตารางเมตร"].includes(
          unit
        )
      ) {
        if (
          !value.includes("ซม") &&
          !value.toLowerCase().includes("cm")
        ) {
          return `${value} ซม.`;
        }
      }

      if (unit === "นิ้ว" && !value.includes("นิ้ว")) {
        return `${value} นิ้ว`;
      }

      return value;
    }

    // fallback สำหรับข้อมูลเก่า
    const width = item?.width;
    const height = item?.height;

    if (width && height) {
      return `${width} × ${height} ซม.`;
    }

    return "-";
  }

  function itemAmount(item) {
    return Number(
      item?.amount ??
        item?.line_total ??
        0
    );
  }

  /* ===========================================================
     TOTAL
  =========================================================== */

  const itemsTotal = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + itemAmount(item),
      0
    );
  }, [items]);

  const grandTotal = Number(
    quotation?.grand_total ?? itemsTotal
  );

  /* ===========================================================
     STATUS
  =========================================================== */

  const currentStatus =
    productionJob?.status || "ready";

  const currentStep =
    STATUS_INFO[currentStatus]?.step || 1;

  function isDone(step) {
    return currentStep > step;
  }

  function isActive(step) {
    return currentStep === step;
  }

  /* ===========================================================
     UPDATE STATUS
  =========================================================== */

  async function updateProductionStatus(
    newStatus,
    extraFields = {}
  ) {
    if (!productionJob?.id || saving) {
      return;
    }

    setSaving(true);

    try {
      const {
        data,
        error,
      } = await supabase
        .from("production_jobs")
        .update({
          status: newStatus,
          ...extraFields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productionJob.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setProductionJob(data);
    } catch (error) {
      console.error(
        "update production:",
        error
      );

      alert(
        "อัปเดตสถานะงานผลิตไม่สำเร็จ: " +
          (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setSaving(false);
    }
  }

  /* ===========================================================
     START
  =========================================================== */

  async function startProduction() {
    if (
      !window.confirm(
        "ต้องการเริ่มผลิตงานนี้ใช่หรือไม่?"
      )
    ) {
      return;
    }

    await updateProductionStatus("producing", {
      started_at: new Date().toISOString(),
    });
  }

  /* ===========================================================
     COMPLETE
  =========================================================== */

  async function completeProduction() {
    if (
      !window.confirm(
        "ยืนยันว่าผลิตงานนี้เสร็จแล้ว?"
      )
    ) {
      return;
    }

    await updateProductionStatus("completed", {
      completed_at: new Date().toISOString(),
    });
  }

  /* ===========================================================
     SEND QC
  =========================================================== */

  async function sendToQc() {
    if (
      !window.confirm(
        "ต้องการส่งงานนี้ไปตรวจ QC ใช่หรือไม่?"
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      /*
       * อัปเดต production ก่อน
       */

      const now = new Date().toISOString();

      const {
        data: updatedProduction,
        error: productionError,
      } = await supabase
        .from("production_jobs")
        .update({
          status: "qc_sent",
          qc_sent_at: now,
          updated_at: now,
        })
        .eq("id", productionJob.id)
        .select()
        .single();

      if (productionError) {
        throw productionError;
      }

      /*
       * ตรวจว่ามี qc_jobs แล้วหรือยัง
       */

      const {
        data: existingQc,
        error: qcCheckError,
      } = await supabase
        .from("qc_jobs")
        .select("*")
        .eq("production_job_id", productionJob.id)
        .maybeSingle();

      if (qcCheckError) {
        throw qcCheckError;
      }

      if (!existingQc) {
        const {
          error: qcCreateError,
        } = await supabase
          .from("qc_jobs")
          .insert({
            production_job_id: productionJob.id,
            status: "pending",
          });

        if (qcCreateError) {
          /*
           * รองรับ schema เดิมที่ใช้ waiting
           */
          const {
            error: fallbackError,
          } = await supabase
            .from("qc_jobs")
            .insert({
              production_job_id: productionJob.id,
              status: "waiting",
            });

          if (fallbackError) {
            throw qcCreateError;
          }
        }
      }

      setProductionJob(updatedProduction);

      alert("ส่ง QC เรียบร้อยแล้ว");
    } catch (error) {
      console.error("send QC:", error);

      alert(
        "ส่ง QC ไม่สำเร็จ: " +
          (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setSaving(false);
    }
  }

  /* ===========================================================
     LOADING
  =========================================================== */

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>
          กำลังโหลดงานผลิต...
        </div>
      </main>
    );
  }

  if (!quotation) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>
          ไม่พบข้อมูลงาน
        </div>
      </main>
    );
  }

  const customer =
    quotation.customers || {};

  /* ===========================================================
     RENDER
  =========================================================== */

  return (
    <main style={styles.page}>
      <div style={styles.container}>

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div style={styles.header}>
          <div>
            <div style={styles.smallTitle}>
              รายละเอียดงานผลิต
            </div>

            <h1 style={styles.quotationNo}>
              {quotation.quotation_no || "-"}
            </h1>
          </div>

          <div style={styles.headerButtons}>
            <button
              type="button"
              onClick={() =>
                router.push("/production")
              }
              style={styles.secondaryButton}
            >
              ← กลับงานผลิต
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/quotations/${quotation.id}`
                )
              }
              style={styles.secondaryButton}
            >
              ดูใบเสนอราคา
            </button>
          </div>
        </div>

        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <div style={styles.summaryGrid}>
          <SummaryCard
            title="สถานะงานผลิต"
            value={
              STATUS_INFO[currentStatus]?.label ||
              currentStatus
            }
          />

          <SummaryCard
            title="ลูกค้า"
            value={
              customer.company_name ||
              customer.contact_name ||
              "-"
            }
          />

          <SummaryCard
            title="โครงการ / งาน"
            value={quotation.project_name || "-"}
          />

          <SummaryCard
            title="มูลค่างาน"
            value={`฿${money(grandTotal)}`}
          />
        </div>

        {/* =====================================================
            STEPS
        ===================================================== */}

        <section style={styles.card}>
          <div style={styles.cardTitle}>
            ขั้นตอนงานผลิต
          </div>

          <div style={styles.steps}>
            <StepBox
              number={1}
              text="พร้อมผลิต"
              done={isDone(1)}
              active={isActive(1)}
            />

            <StepBox
              number={2}
              text="กำลังผลิต"
              done={isDone(2)}
              active={isActive(2)}
            />

            <StepBox
              number={3}
              text="ผลิตเสร็จ"
              done={isDone(3)}
              active={isActive(3)}
            />

            <StepBox
              number={4}
              text="ส่ง QC"
              done={false}
              active={isActive(4)}
            />
          </div>

          <div style={styles.actionArea}>
            {currentStep === 1 && (
              <button
                type="button"
                disabled={saving}
                onClick={startProduction}
                style={styles.primaryButton}
              >
                {saving
                  ? "กำลังบันทึก..."
                  : "เริ่มผลิต"}
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                disabled={saving}
                onClick={completeProduction}
                style={styles.primaryButton}
              >
                {saving
                  ? "กำลังบันทึก..."
                  : "ผลิตเสร็จ"}
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                disabled={saving}
                onClick={sendToQc}
                style={styles.primaryButton}
              >
                {saving
                  ? "กำลังส่ง..."
                  : "ส่ง QC"}
              </button>
            )}

            {currentStep >= 4 && (
              <div style={styles.successMessage}>
                ✓ ส่ง QC เรียบร้อยแล้ว
              </div>
            )}
          </div>
        </section>

        {/* =====================================================
            ITEMS
        ===================================================== */}

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>
              รายการสินค้า / บริการ
            </div>

            <strong>
              รวม ฿{money(itemsTotal)}
            </strong>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    ลำดับ
                  </th>

                  <th style={styles.th}>
                    รายละเอียด
                  </th>

                  <th style={styles.th}>
                    ขนาด
                  </th>

                  <th style={styles.th}>
                    จำนวน
                  </th>

                  <th style={styles.th}>
                    หน่วย
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      textAlign: "right",
                    }}
                  >
                    ราคาต่อหน่วย
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      textAlign: "right",
                    }}
                  >
                    จำนวนเงิน
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={styles.empty}
                    >
                      ไม่มีรายการสินค้า / บริการ
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td style={styles.td}>
                        {index + 1}
                      </td>

                      <td style={styles.td}>
                        {item.description || "-"}
                      </td>

                      <td style={styles.td}>
                        {formatItemSize(item)}
                      </td>

                      <td style={styles.td}>
                        {Number(
                          item.quantity || 0
                        ).toLocaleString("th-TH")}
                      </td>

                      <td style={styles.td}>
                        {item.unit || "-"}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "right",
                        }}
                      >
                        ฿{money(item.unit_price)}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "right",
                          fontWeight: 800,
                        }}
                      >
                        ฿{money(itemAmount(item))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {items.length > 0 && (
                <tfoot>
                  <tr>
                    <td
                      colSpan={6}
                      style={styles.totalLabel}
                    >
                      รวมรายการ
                    </td>

                    <td style={styles.totalValue}>
                      ฿{money(itemsTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* =====================================================
            TIME
        ===================================================== */}

        <section style={styles.card}>
          <div style={styles.cardTitle}>
            ข้อมูลเวลา
          </div>

          <div style={styles.timeGrid}>
            <TimeItem
              label="เริ่มผลิต"
              value={formatDateTime(
                productionJob?.started_at
              )}
            />

            <TimeItem
              label="ผลิตเสร็จ"
              value={formatDateTime(
                productionJob?.completed_at
              )}
            />

            <TimeItem
              label="ส่ง QC"
              value={formatDateTime(
                productionJob?.qc_sent_at
              )}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

/* =============================================================
   COMPONENTS
============================================================= */

function SummaryCard({ title, value }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryTitle}>
        {title}
      </div>

      <div style={styles.summaryValue}>
        {value}
      </div>
    </div>
  );
}

function StepBox({
  number,
  text,
  done,
  active,
}) {
  let style = {
    ...styles.step,
  };

  if (done) {
    style = {
      ...style,
      background: "#dcfce7",
      borderColor: "#bbf7d0",
    };
  }

  if (active) {
    style = {
      ...style,
      background: "#eff6ff",
      borderColor: "#2563eb",
      borderWidth: "2px",
    };
  }

  return (
    <div style={style}>
      {done ? "✓ " : ""}
      {number}. {text}
    </div>
  );
}

function TimeItem({
  label,
  value,
}) {
  return (
    <div style={styles.timeItem}>
      <div style={styles.timeLabel}>
        {label}
      </div>

      <strong>
        {value}
      </strong>
    </div>
  );
}

/* =============================================================
   STYLES
============================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    padding: "32px",
    color: "#111827",
  },

  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },

  loading: {
    maxWidth: "1000px",
    margin: "80px auto",
    background: "white",
    padding: "40px",
    borderRadius: "12px",
    textAlign: "center",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "15px",
    marginBottom: "22px",
  },

  smallTitle: {
    fontSize: "16px",
    fontWeight: 700,
    marginBottom: "5px",
  },

  quotationNo: {
    margin: 0,
    fontSize: "18px",
    color: "#6b7280",
  },

  headerButtons: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  secondaryButton: {
    padding: "10px 15px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "white",
    color: "#111827",
    fontWeight: 700,
    cursor: "pointer",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0,1fr))",
    gap: "16px",
    marginBottom: "20px",
  },

  summaryCard: {
    background: "white",
    padding: "20px",
    borderRadius: "12px",
    boxShadow:
      "0 2px 8px rgba(0,0,0,0.05)",
  },

  summaryTitle: {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "8px",
  },

  summaryValue: {
    fontSize: "23px",
    fontWeight: 800,
  },

  card: {
    background: "white",
    borderRadius: "12px",
    boxShadow:
      "0 2px 8px rgba(0,0,0,0.05)",
    marginBottom: "20px",
    overflow: "hidden",
  },

  cardHeader: {
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #e5e7eb",
  },

  cardTitle: {
    padding: "20px",
    fontSize: "20px",
    fontWeight: 800,
  },

  steps: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0,1fr))",
    gap: "14px",
    padding: "20px",
    borderTop: "1px solid #e5e7eb",
  },

  step: {
    padding: "20px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    textAlign: "center",
    fontWeight: 800,
    background: "white",
  },

  actionArea: {
    padding: "0 20px 22px",
  },

  primaryButton: {
    padding: "12px 18px",
    border: "none",
    borderRadius: "8px",
    background: "#2563eb",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },

  successMessage: {
    display: "inline-block",
    padding: "11px 16px",
    borderRadius: "8px",
    background: "#dcfce7",
    color: "#15803d",
    fontWeight: 800,
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "950px",
  },

  th: {
    padding: "13px 14px",
    background: "#f9fafb",
    color: "#374151",
    fontSize: "13px",
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
  },

  td: {
    padding: "14px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: "13px",
  },

  empty: {
    padding: "40px",
    textAlign: "center",
    color: "#6b7280",
  },

  totalLabel: {
    padding: "15px",
    textAlign: "right",
    background: "#f9fafb",
    fontWeight: 800,
  },

  totalValue: {
    padding: "15px",
    textAlign: "right",
    background: "#f9fafb",
    fontWeight: 800,
    fontSize: "16px",
  },

  timeGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0,1fr))",
    gap: "16px",
    padding: "0 20px 22px",
  },

  timeItem: {
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
  },

  timeLabel: {
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "6px",
  },
};