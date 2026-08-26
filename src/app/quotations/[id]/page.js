"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const STATUS_LABELS = {
  draft: "แบบร่าง",
  sent: "ส่งแล้ว",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิก",
};

const STATUS_COLORS = {
  draft: { bg: "#f3f4f6", color: "#374151" },
  sent: { bg: "#dbeafe", color: "#1d4ed8" },
  approved: { bg: "#dcfce7", color: "#15803d" },
  rejected: { bg: "#fee2e2", color: "#b91c1c" },
  cancelled: { bg: "#fef3c7", color: "#b45309" },
};

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [quotation, setQuotation] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    async function loadQuotation() {
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
            contact_name,
            phone,
            email
          )
        `)
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        alert("โหลดใบเสนอราคาไม่สำเร็จ: " + error.message);
        setLoading(false);
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", id)
        .order("created_at", { ascending: true });

      if (itemError) {
        console.error(itemError);
        alert("โหลดรายการงานไม่สำเร็จ: " + itemError.message);
        setLoading(false);
        return;
      }

      setQuotation(data);
      setItems(itemData || []);
      setLoading(false);
    }

    if (id) {
      loadQuotation();
    }
  }, [id, router]);

  async function handleStatusChange(newStatus) {
    if (!quotation || updatingStatus) return;

    const label = STATUS_LABELS[newStatus] || newStatus;

    const ok = window.confirm(
      `ต้องการเปลี่ยนสถานะใบเสนอราคาเป็น "${label}" ใช่หรือไม่?`
    );

    if (!ok) return;

    setUpdatingStatus(true);

    const { data, error } = await supabase
      .from("quotations")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("เปลี่ยนสถานะไม่สำเร็จ: " + error.message);
      setUpdatingStatus(false);
      return;
    }

    setQuotation((prev) => ({
      ...prev,
      ...data,
      customers: prev.customers,
    }));

    setUpdatingStatus(false);
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
      month: "long",
      year: "numeric",
    });
  }

  function formatSizeLegacy(width, height) {
    const w = width ?? "";
    const h = height ?? "";

    if (!w && !h) return "-";
    if (w && h) return `${w} × ${h} ซม.`;
    return w || h;
  }

  function formatItemSize(item) {
    if (item?.size) {
      const value = String(item.size).trim();
      const unit = String(item.unit || "").trim();

      if (
        ["ตร.ม.", "ตร.ม", "ตรม.", "ตรม", "ตารางเมตร"].includes(unit)
      ) {
        if (
          !value.includes("ซม") &&
          !value.toLowerCase().includes("cm")
        ) {
          return `${value} ซม.`;
        }

        return value;
      }

      if (unit === "นิ้ว") {
        if (!value.includes("นิ้ว")) {
          return `${value} นิ้ว`;
        }

        return value;
      }

      return value;
    }

    if (item?.width || item?.height) {
      const w = item.width ?? "";
      const h = item.height ?? "";

      if (w && h) {
        return `${w} × ${h} ซม.`;
      }

      return w || h || "-";
    }

    return "-";
  }
  function getValidUntilDate(quotationDate, validDays) {
    if (!quotationDate || !validDays) return "-";

    const date = new Date(quotationDate);
    date.setDate(date.getDate() + Number(validDays));

    return formatDate(date.toISOString());
  }

  function getStatusStyle(status) {
    return STATUS_COLORS[status] || STATUS_COLORS.draft;
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || status || "แบบร่าง";
  }

  if (loading) {
    return (
      <main style={styles.loadingPage}>
        <div style={styles.loadingBox}>
          กำลังโหลดใบเสนอราคา...
        </div>
      </main>
    );
  }

  if (!quotation) {
    return (
      <main style={styles.loadingPage}>
        <div style={styles.loadingBox}>
          <p style={{ margin: "0 0 16px" }}>
            ไม่พบใบเสนอราคา
          </p>

          <button
            type="button"
            onClick={() => router.push("/quotations/list")}
            style={styles.secondaryButton}
          >
            ← กลับรายการ
          </button>
        </div>
      </main>
    );
  }

  const customer = quotation.customers;
  const statusStyle = getStatusStyle(quotation.status);

  const afterDiscount = Math.max(
    Number(quotation.subtotal || 0) -
      Number(quotation.discount || 0),
    0
  );

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .page-wrapper {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-page {
            width: 190mm !important;
            min-height: 0 !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          table {
            page-break-inside: auto;
          }

          thead {
            display: table-header-group;
          }

          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          img {
            max-height: 75px !important;
            width: auto !important;
          }
        }
      `}</style>

      <main
        style={styles.pageWrapper}
        className="page-wrapper"
      >
        {/* TOOLBAR */}
        <div
          style={styles.toolbar}
          className="no-print"
        >
          <button
            type="button"
            onClick={() =>
              router.push("/quotations/list")
            }
            style={styles.secondaryButton}
          >
            ← กลับรายการ
          </button>

          <div style={styles.toolbarActions}>
            {/* STATUS */}
            <div style={styles.statusControl}>
              <span style={styles.statusControlLabel}>
                สถานะ:
              </span>

              <select
                value={quotation.status || "draft"}
                disabled={updatingStatus}
                onChange={(e) =>
                  handleStatusChange(e.target.value)
                }
                style={styles.statusSelect}
              >
                <option value="draft">แบบร่าง</option>
                <option value="sent">ส่งแล้ว</option>
                <option value="approved">อนุมัติ</option>
                <option value="rejected">ปฏิเสธ</option>
                <option value="cancelled">ยกเลิก</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(`/quotations/${id}/edit`)
              }
              style={styles.editButton}
            >
              แก้ไขใบเสนอราคา
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              style={styles.primaryButton}
            >
              พิมพ์ / Save PDF
            </button>
          </div>
        </div>

        {/* DOCUMENT */}
        <article
          style={styles.document}
          className="print-page"
        >
          {/* HEADER */}
          <header style={styles.header}>
            <div style={styles.companyArea}>
              <img
                src="/logo.png"
                alt="THANEE ADVERTISING"
                style={styles.logo}
              />

              <div style={styles.companyDetails}>
                <div style={styles.companyName}>
                  ธานี แอดเวอร์ไทซิ่ง
                </div>

                <div style={styles.companyEnglish}>
                  THANEE ADVERTISING
                </div>

                <div style={styles.companyContact}>
                  1/5 ม.15 ถ.สันโค้งน้อย ต.รอบเวียง
                  อ.เมือง จ.เชียงราย 57000
                </div>

                <div style={styles.companyContact}>
                  เลขประจำตัวผู้เสียภาษี: 0575565002465
                </div>

                <div style={styles.companyContact}>
                  โทร: 093-131-8183 , 084-948-7213
                </div>

                <div style={styles.companyContact}>
                  อีเมล: siwanon_s@hotmail.com
                </div>

                <div style={styles.companyContact}>
                  LINE: 0931318183
                </div>
              </div>
            </div>

            <div style={styles.docTitleBlock}>
              <h1 style={styles.docTitle}>
                ใบเสนอราคา
              </h1>

              <div style={styles.quotationEnglish}>
                QUOTATION
              </div>

              <div style={styles.docMeta}>
                <div>
                  เลขที่:{" "}
                  <strong>
                    {quotation.quotation_no || "-"}
                  </strong>
                </div>

                <div>
                  วันที่:{" "}
                  {formatDate(
                    quotation.quotation_date
                  )}
                </div>

                <div>
                  ยืนราคา:{" "}
                  {quotation.valid_days ?? "-"} วัน
                </div>

                <div>
                  ใช้ได้ถึง:{" "}
                  {getValidUntilDate(
                    quotation.quotation_date,
                    quotation.valid_days
                  )}
                </div>
              </div>
            </div>
          </header>

          <div style={styles.divider} />

          {/* CUSTOMER / PROJECT */}
          <section style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <h2 style={styles.sectionTitle}>
                ข้อมูลลูกค้า
              </h2>

              <dl style={styles.definitionList}>
                <InfoRow
                  label="รหัสลูกค้า"
                  value={customer?.customer_code}
                />

                <InfoRow
                  label="บริษัท / ลูกค้า"
                  value={
                    customer?.company_name ||
                    customer?.contact_name
                  }
                />

                <InfoRow
                  label="ผู้ติดต่อ"
                  value={customer?.contact_name}
                />

                <InfoRow
                  label="โทรศัพท์"
                  value={customer?.phone}
                />

                <InfoRow
                  label="อีเมล"
                  value={customer?.email}
                />
              </dl>
            </div>

            <div style={styles.infoCard}>
              <h2 style={styles.sectionTitle}>
                รายละเอียดโครงการ
              </h2>

              <dl style={styles.definitionList}>
                <InfoRow
                  label="ชื่อโครงการ / งาน"
                  value={quotation.project_name}
                />

                <div style={styles.definitionRow}>
                  <dt style={styles.definitionTerm}>
                    สถานะ
                  </dt>

                  <dd style={styles.definitionDesc}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        background: statusStyle.bg,
                        color: statusStyle.color,
                      }}
                    >
                      {getStatusLabel(
                        quotation.status
                      )}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* ITEMS */}
          <section style={styles.tableSection}>
            <h2 style={styles.sectionTitle}>
              รายการสินค้า / บริการ
            </h2>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...styles.th,
                      width: "44px",
                    }}
                  >
                    ลำดับ
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      textAlign: "left",
                    }}
                  >
                    รายละเอียด
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      width: "120px",
                    }}
                  >
                    ขนาด
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      width: "70px",
                    }}
                  >
                    จำนวน
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      width: "70px",
                    }}
                  >
                    หน่วย
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      width: "120px",
                      textAlign: "right",
                    }}
                  >
                    ราคาต่อหน่วย
                  </th>

                  <th
                    style={{
                      ...styles.th,
                      width: "120px",
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
                      style={styles.emptyCell}
                    >
                      ไม่มีรายการงาน
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={item.id}>
                      <td
                        style={{
                          ...styles.td,
                          textAlign: "center",
                        }}
                      >
                        {index + 1}
                      </td>

                      <td style={styles.td}>
                        {item.description || "-"}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "center",
                        }}
                      >
                        {formatItemSize(item)}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "center",
                        }}
                      >
                        {item.quantity ?? "-"}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "center",
                        }}
                      >
                        {item.unit || "-"}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "right",
                        }}
                      >
                        ฿
                        {formatMoney(
                          item.unit_price
                        )}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          textAlign: "right",
                          fontWeight: 700,
                        }}
                      >
                        ฿
                        {formatMoney(
                          item.amount
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* SUMMARY */}
          <section
            style={styles.summaryGrid}
            className="avoid-break"
          >
            <div>
              <div style={styles.noteBlock}>
                <h2 style={styles.sectionTitle}>
                  หมายเหตุ / เงื่อนไข
                </h2>

                <div style={styles.noteContent}>
                  {quotation.note?.trim()
                    ? quotation.note
                    : "-"}
                </div>
              </div>

              <div style={styles.paymentBox}>
                <h2 style={styles.paymentTitle}>
                  ข้อมูลการชำระเงิน
                </h2>

                <div style={styles.paymentRow}>
                  <strong>ธนาคาร:</strong>{" "}
                  กรุงไทย
                </div>

                <div style={styles.paymentRow}>
                  <strong>ชื่อบัญชี:</strong>{" "}
                  ธานีแอดเวอร์ไทซิ่ง
                  โดยนายศิวนนท์ ศุภฐิติพงศ์
                </div>

                <div style={styles.paymentRow}>
                  <strong>เลขบัญชี:</strong>{" "}
                  983-4-51403-4
                </div>
              </div>
            </div>

            <div style={styles.totalsBlock}>
              <div style={styles.totalRow}>
                <span>รวมเป็นเงิน</span>

                <strong>
                  ฿
                  {formatMoney(
                    quotation.subtotal
                  )}
                </strong>
              </div>

              <div style={styles.totalRow}>
                <span>ส่วนลด</span>

                <strong>
                  ฿
                  {formatMoney(
                    quotation.discount
                  )}
                </strong>
              </div>

              <div style={styles.totalRow}>
                <span>
                  มูลค่าหลังหักส่วนลด
                </span>

                <strong>
                  ฿{formatMoney(afterDiscount)}
                </strong>
              </div>

              <div style={styles.totalRow}>
                <span>
                  ภาษีมูลค่าเพิ่ม VAT (
                  {quotation.vat_percent ?? 0}
                  %)
                </span>

                <strong>
                  ฿
                  {formatMoney(
                    quotation.vat_amount
                  )}
                </strong>
              </div>

              <div style={styles.totalDivider} />

              <div style={styles.grandTotalRow}>
                <span>ยอดสุทธิ</span>

                <strong
                  style={styles.grandTotalValue}
                >
                  ฿
                  {formatMoney(
                    quotation.grand_total
                  )}
                </strong>
              </div>
            </div>
          </section>

          <div
            style={styles.notice}
            className="avoid-break"
          >
            กรุณาตรวจสอบรายละเอียดก่อนยืนยันการสั่งผลิต
          </div>

          {/* SIGNATURE */}
          <section
            style={styles.signatureSection}
            className="avoid-break"
          >
            <div style={styles.signatureBox}>
              <div style={styles.signatureSpace} />

              <div style={styles.signatureLabel}>
                ผู้เสนอราคา
              </div>

              <div style={styles.signatureText}>
                ลงชื่อ __________________________
              </div>

              <div style={styles.signatureText}>
                วันที่ ____ / ____ / ______
              </div>
            </div>

            <div style={styles.signatureBox}>
              <div style={styles.signatureSpace} />

              <div style={styles.signatureLabel}>
                ผู้อนุมัติ / ลูกค้า
              </div>

              <div style={styles.signatureText}>
                ลงชื่อ __________________________
              </div>

              <div style={styles.signatureText}>
                วันที่ ____ / ____ / ______
              </div>
            </div>
          </section>
        </article>
      </main>
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.definitionRow}>
      <dt style={styles.definitionTerm}>
        {label}
      </dt>

      <dd style={styles.definitionDesc}>
        {value || "-"}
      </dd>
    </div>
  );
}

const styles = {
  pageWrapper: {
    minHeight: "100vh",
    background: "#eef2f7",
    padding: "32px 20px",
    color: "#111827",
    fontFamily: "Tahoma, Arial, sans-serif",
  },

  loadingPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eef2f7",
  },

  loadingBox: {
    background: "white",
    padding: "32px 40px",
    borderRadius: "12px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.08)",
    textAlign: "center",
  },

  toolbar: {
    maxWidth: "1050px",
    margin: "0 auto 18px",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },

  toolbarActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
  },

  statusControl: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "white",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "5px 8px 5px 12px",
  },

  statusControlLabel: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#374151",
  },

  statusSelect: {
    border: "none",
    outline: "none",
    background: "transparent",
    padding: "5px",
    cursor: "pointer",
    fontWeight: 600,
    color: "#111827",
  },

  secondaryButton: {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "white",
    cursor: "pointer",
    fontWeight: 600,
    color: "#374151",
  },

  primaryButton: {
    padding: "10px 18px",
    border: "none",
    borderRadius: "8px",
    background: "#2563eb",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },

  editButton: {
    padding: "10px 18px",
    border: "none",
    borderRadius: "8px",
    background: "#0f766e",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },

  document: {
    maxWidth: "1050px",
    margin: "0 auto",
    background: "white",
    padding: "34px 38px",
    borderRadius: "12px",
    boxShadow:
      "0 4px 20px rgba(15,23,42,0.08)",
  },

  header: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0,1fr) 300px",
    gap: "28px",
    alignItems: "start",
  },

  companyArea: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  },

  logo: {
    width: "125px",
    height: "auto",
    objectFit: "contain",
    flexShrink: 0,
  },

  companyDetails: {
    minWidth: 0,
  },

  companyName: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#111827",
    lineHeight: 1.25,
  },

  companyEnglish: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#374151",
    marginTop: "3px",
    marginBottom: "8px",
    letterSpacing: "0.04em",
  },

  companyContact: {
    fontSize: "12px",
    lineHeight: 1.6,
    color: "#4b5563",
  },

  docTitleBlock: {
    textAlign: "right",
  },

  docTitle: {
    margin: 0,
    fontSize: "30px",
    color: "#111827",
    fontWeight: 800,
  },

  quotationEnglish: {
    marginTop: "2px",
    fontSize: "13px",
    letterSpacing: "0.12em",
    color: "#6b7280",
  },

  docMeta: {
    marginTop: "14px",
    lineHeight: 1.75,
    color: "#374151",
    fontSize: "13px",
  },

  divider: {
    height: "3px",
    background: "#111827",
    margin: "24px 0",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0,1fr))",
    gap: "18px",
    marginBottom: "24px",
  },

  infoCard: {
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "16px 18px",
  },

  sectionTitle: {
    margin: "0 0 12px",
    fontSize: "15px",
    color: "#111827",
    fontWeight: 800,
  },

  definitionList: {
    margin: 0,
  },

  definitionRow: {
    display: "grid",
    gridTemplateColumns:
      "125px minmax(0,1fr)",
    gap: "8px",
    marginBottom: "7px",
    alignItems: "start",
  },

  definitionTerm: {
    margin: 0,
    color: "#6b7280",
    fontSize: "13px",
  },

  definitionDesc: {
    margin: 0,
    color: "#111827",
    fontSize: "13px",
    wordBreak: "break-word",
    fontWeight: 500,
  },

  statusBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
  },

  tableSection: {
    marginBottom: "24px",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "10px",
    fontSize: "12px",
  },

  th: {
    padding: "10px 8px",
    border: "1px solid #cbd5e1",
    background: "#f3f4f6",
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
  },

  td: {
    padding: "10px 8px",
    border: "1px solid #e5e7eb",
    verticalAlign: "top",
  },

  emptyCell: {
    padding: "22px",
    textAlign: "center",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0,1fr) 340px",
    gap: "22px",
    alignItems: "start",
  },

  noteBlock: {
    marginBottom: "14px",
  },

  noteContent: {
    whiteSpace: "pre-wrap",
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "14px",
    minHeight: "80px",
    color: "#374151",
    lineHeight: 1.6,
    fontSize: "13px",
  },

  paymentBox: {
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "14px 16px",
    background: "#fff",
  },

  paymentTitle: {
    margin: "0 0 9px",
    fontSize: "14px",
    fontWeight: 800,
    color: "#111827",
  },

  paymentRow: {
    fontSize: "12px",
    lineHeight: 1.7,
    color: "#374151",
  },

  totalsBlock: {
    background: "#fafafa",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "16px 18px",
  },

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "9px",
    fontSize: "13px",
    color: "#374151",
  },

  totalDivider: {
    borderTop: "2px solid #111827",
    margin: "12px 0",
  },

  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    fontSize: "18px",
    fontWeight: 800,
    color: "#111827",
  },

  grandTotalValue: {
    color: "#1d4ed8",
    fontSize: "21px",
  },

  notice: {
    marginTop: "22px",
    padding: "10px 14px",
    background: "#f9fafb",
    borderLeft: "4px solid #111827",
    fontSize: "12px",
    color: "#374151",
    fontWeight: 600,
  },

  signatureSection: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "70px",
    marginTop: "38px",
  },

  signatureBox: {
    textAlign: "center",
  },

  signatureSpace: {
    height: "48px",
  },

  signatureLabel: {
    fontWeight: 700,
    color: "#111827",
    marginBottom: "12px",
  },

  signatureText: {
    marginTop: "7px",
    fontSize: "12px",
    color: "#374151",
  },
};

