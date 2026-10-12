"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

function fitDocumentToSingleA4() {
  const page = document.querySelector(".print-page");
  const wrapper = page?.closest(".page-wrapper");
  if (!page || !wrapper) return;

  const PX_PER_MM = 96 / 25.4;
  const targetWidthPx = 198 * PX_PER_MM;
  const targetHeightPx = 285 * PX_PER_MM;

  page.style.removeProperty("zoom");
  page.style.removeProperty("transform");
  page.style.removeProperty("transform-origin");
  page.style.setProperty("width", "198mm", "important");
  page.style.setProperty("max-width", "none", "important");

  wrapper.style.setProperty("width", "198mm", "important");
  wrapper.style.setProperty("height", "285mm", "important");
  wrapper.style.setProperty("min-height", "285mm", "important");
  wrapper.style.setProperty("max-height", "285mm", "important");
  wrapper.style.setProperty("overflow", "hidden", "important");

  const contentWidth = Math.max(page.scrollWidth || 0, page.getBoundingClientRect().width || 0);
  const contentHeight = Math.max(page.scrollHeight || 0, page.getBoundingClientRect().height || 0);

  let scale = Math.min(
    1,
    targetWidthPx / Math.max(contentWidth, 1),
    targetHeightPx / Math.max(contentHeight, 1)
  );

  scale = Math.max(0.32, scale * 0.985);
  page.style.setProperty("transform-origin", "top left", "important");
  page.style.setProperty("transform", `scale(${scale})`, "important");
}

function resetDocumentPrintFit() {
  const page = document.querySelector(".print-page");
  const wrapper = page?.closest(".page-wrapper");
  if (page) {
    page.style.removeProperty("zoom");
    page.style.removeProperty("transform");
    page.style.removeProperty("transform-origin");
    page.style.removeProperty("width");
    page.style.removeProperty("max-width");
  }
  if (wrapper) {
    wrapper.style.removeProperty("width");
    wrapper.style.removeProperty("height");
    wrapper.style.removeProperty("min-height");
    wrapper.style.removeProperty("max-height");
    wrapper.style.removeProperty("overflow");
  }
}

function printSingleA4() {
  fitDocumentToSingleA4();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}

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
  useEffect(() => {
    window.addEventListener("beforeprint", fitDocumentToSingleA4);
    window.addEventListener("afterprint", resetDocumentPrintFit);
    return () => {
      window.removeEventListener("beforeprint", fitDocumentToSingleA4);
      window.removeEventListener("afterprint", resetDocumentPrintFit);
    };
  }, []);
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
  function displayItemAmount(item) {
    const stored = Number(item?.amount ?? item?.line_total ?? 0);
    if (stored > 0) return stored;
    return Number(item?.quantity || 0) * Number(item?.unit_price || 0);
  }

  function optionVat(item) {
    return displayItemAmount(item) * (Number(quotation?.vat_percent || 0) / 100);
  }

  function optionTotal(item) {
    return displayItemAmount(item) + optionVat(item);
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
            margin: 6mm;
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
            margin: 0 auto !important;
            width: 198mm !important;
            height: 285mm !important;
            min-height: 285mm !important;
            max-height: 285mm !important;
            overflow: hidden !important;
          }

          .print-page {
            width: 198mm !important;
            min-height: 0 !important;
            break-after: avoid !important;
            page-break-after: avoid !important;
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

          .print-page header {
            gap: 12px !important;
            margin-bottom: 8px !important;
          }

          .print-page table {
            font-size: 10px !important;
          }

          .print-page th,
          .print-page td {
            padding: 5px 6px !important;
            line-height: 1.25 !important;
          }

          .print-page h1 {
            font-size: 22px !important;
            margin: 0 !important;
          }

          .print-page h2 {
            font-size: 13px !important;
            margin-top: 8px !important;
            margin-bottom: 8px !important;
          }

          .print-page p,
          .print-page div,
          .print-page span,
          .print-page dt,
          .print-page dd {
            line-height: 1.35 !important;
          }

          .print-page .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }


          /* Compact quotation layout so the complete document, including signatures,
             fits on a single A4 page whenever content is reasonably sized. */
          .print-header {
            grid-template-columns: minmax(0, 1fr) 205px !important;
            gap: 10px !important;
            margin-bottom: 4px !important;
          }

          .print-header img {
            width: 72px !important;
            max-height: 58px !important;
          }

          .print-header > div:first-child {
            gap: 8px !important;
          }

          .print-header h1 {
            font-size: 19px !important;
          }

          .print-header [style*="font-size: 22px"],
          .print-header [style*="fontSize: 22"] {
            font-size: 15px !important;
          }

          .print-header [style*="line-height"] {
            line-height: 1.25 !important;
          }

          .compact-info {
            gap: 8px !important;
            margin-bottom: 9px !important;
          }

          .compact-info-card {
            padding: 7px 9px !important;
            border-radius: 5px !important;
          }

          .compact-info-card h2 {
            margin: 0 0 5px !important;
            font-size: 12px !important;
          }

          .compact-info-card dl > div {
            grid-template-columns: 92px minmax(0,1fr) !important;
            gap: 5px !important;
            margin-bottom: 2px !important;
          }

          .compact-info-card dt,
          .compact-info-card dd {
            font-size: 10px !important;
          }

          .compact-table {
            margin-bottom: 8px !important;
          }

          .compact-table h2 {
            margin-bottom: 5px !important;
          }

          .compact-table table {
            margin-top: 4px !important;
          }

          .compact-summary {
            display: grid !important;
            grid-template-columns: minmax(0,1.7fr) minmax(215px,.75fr) !important;
            gap: 9px !important;
            align-items: stretch !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          .summary-left-grid {
            display: grid !important;
            grid-template-columns: minmax(0,1.35fr) minmax(0,1fr) !important;
            gap: 8px !important;
            align-items: stretch !important;
          }

          .summary-note,
          .summary-payment,
          .summary-totals {
            margin: 0 !important;
            padding: 8px 9px !important;
            min-height: 0 !important;
          }

          .summary-note h2,
          .summary-payment h2 {
            margin: 0 0 5px !important;
            font-size: 11px !important;
          }

          .summary-note > div,
          .summary-payment > div,
          .summary-totals > div {
            font-size: 9px !important;
            line-height: 1.25 !important;
          }

          .print-notice {
            margin-top: 8px !important;
            padding: 5px 8px !important;
            font-size: 9px !important;
          }

          .print-signatures {
            margin-top: 8px !important;
            gap: 36px !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          .print-signature-space {
            height: 8px !important;
          }

          .print-signatures div {
            font-size: 9px !important;
            line-height: 1.2 !important;
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
                disabled={updatingStatus || quotation.status === "approved"}
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
              onClick={() => {
                if (quotation.status === "approved") {
                  alert("ไม่สามารถแก้ไขใบเสนอราคาที่อนุมัติแล้วได้");
                  return;
                }

                router.push(`/quotations/${id}/edit`);
              }}
              style={styles.editButton}
            >
              แก้ไขใบเสนอราคา
            </button>

            <button
              type="button"
              onClick={printSingleA4}
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
          <header style={styles.header} className="print-header">
            <div style={styles.companyArea}>
              <img
                src="/logo.png"
                alt="THANEE ADVERTISING"
                style={styles.logo}
              />

              <div style={styles.companyDetails}>
                <div style={styles.companyName}>
                  ร้าน ธานี แอ็ดเวอร์ไทซิ่ง
                </div>

                <div style={styles.companyEnglish}>
                  THANEE ADVERTISING
                </div>

                <div style={styles.companyContact}>
                  14/15 ม.8 ต.บางกระสั้น อ.บางปะอิน จ.พระนครศรีอยุธยา 13160
                </div>

                <div style={styles.companyContact}>
                  เลขประจำตัวผู้เสียภาษี: 3149900246546
                </div>

                <div style={styles.companyContact}>
                  โทร: 089-779-7319
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
          <section style={styles.infoGrid} className="compact-info">
            <div style={styles.infoCard} className="compact-info-card">
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

            <div style={styles.infoCard} className="compact-info-card">
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
          <section style={styles.tableSection} className="compact-table">
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
                        <div style={{whiteSpace:"pre-wrap"}}>{item.description || "-"}</div>
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
                        {item.included_in_total === false ? <>
                          <div>฿{formatMoney(displayItemAmount(item))}</div>
                          <div style={{fontSize:11,color:"#374151",marginTop:3}}>VAT {Number(quotation.vat_percent||0)}%: ฿{formatMoney(optionVat(item))}</div>
                          <div style={{fontSize:12,color:"#111827",fontWeight:800}}>รวม VAT: ฿{formatMoney(optionTotal(item))}</div>
                        </> : <>฿{formatMoney(displayItemAmount(item))}</>}
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
            className="compact-summary"
          >
            <div style={styles.summaryLeftGrid} className="summary-left-grid">
              <div style={styles.noteBlock} className="summary-note">
                <h2 style={styles.sectionTitle}>
                  หมายเหตุ / เงื่อนไข
                </h2>

                <div style={styles.noteContent}>
                  {quotation.note?.trim()
                    ? quotation.note
                    : "-"}
                </div>
              </div>

              <div style={styles.paymentBox} className="summary-payment">
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

            <div style={styles.totalsBlock} className="summary-totals">
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
            className="print-notice"
          >
            กรุณาตรวจสอบรายละเอียดก่อนยืนยันการสั่งผลิต
          </div>

          {/* SIGNATURE */}
          <section
            style={styles.signatureSection}
            className="print-signatures"
          >
            <div style={styles.signatureBox}>
              <div style={styles.signatureSpace} className="print-signature-space" />

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
              <div style={styles.signatureSpace} className="print-signature-space" />

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
  if (value === null || value === undefined || ["", "-"].includes(String(value).trim())) return null;
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
    height: "2px",
    background: "#111827",
    margin: "18px 0",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0,1fr))",
    gap: "18px",
    marginBottom: "24px",
  },

  infoCard: {
    background: "#fbfcfe",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "14px 16px",
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
      "minmax(0,1.7fr) minmax(290px,.8fr)",
    gap: "16px",
    alignItems: "stretch",
  },

  summaryLeftGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
    gap: "12px",
    alignItems: "stretch",
  },

  noteBlock: {
    marginBottom: "14px",
  },

  noteContent: {
    whiteSpace: "pre-wrap",
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "12px",
    minHeight: "96px",
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
    gap: "56px",
    marginTop: "22px",
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

