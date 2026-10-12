"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

function fitDocumentToSingleA4() {}
function resetDocumentPrintFit() {}
function printSingleA4() {
  window.print();
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

  const hasIncludedTotal =
    Number(quotation.subtotal || 0) > 0 ||
    Number(quotation.grand_total || 0) > 0;

  const customerName =
    customer?.company_name ||
    customer?.contact_name ||
    customer?.customer_code ||
    "-";

  return (
    <>
      <style>{`
        .quote-title{font-size:25px;font-weight:800;text-align:right;text-decoration:underline;margin-bottom:8px}
        .quote-company-name{font-size:21px;font-weight:800;text-align:center;margin-bottom:18px}
        .quote-company-meta{font-size:12px;line-height:1.55;margin-bottom:10px}
        .quote-customer-box{display:grid;grid-template-columns:1.7fr .95fr;border:1.4px solid #111827;margin-bottom:0}
        .quote-customer-left{padding:9px 11px;border-right:1.4px solid #111827}
        .quote-customer-right{padding:9px 11px}
        .quote-field-row{display:grid;grid-template-columns:145px 1fr;gap:8px;min-height:24px;align-items:center;border-bottom:1px solid #d1d5db}
        .quote-field-row:last-child{border-bottom:0}
        .quote-field-label{font-weight:700}
        .quote-meta-row{display:grid;grid-template-columns:92px 1fr;gap:8px;align-items:center;min-height:31px}
        .quote-meta-row strong{text-align:right}
        .quote-items-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px}
        .quote-items-table th,.quote-items-table td{border:1.2px solid #111827;padding:7px 6px;vertical-align:top}
        .quote-items-table th{text-align:center;background:#fff;font-weight:800}
        .quote-items-table th>div{font-size:10px;font-weight:500;margin-top:2px}
        .quote-project-row td{padding-top:9px;padding-bottom:9px}
        .quote-project-note{white-space:pre-wrap;margin-top:5px;line-height:1.45}
        .quote-item-row td{padding-top:11px;padding-bottom:11px}
        .quote-description{white-space:pre-wrap;font-weight:700;line-height:1.45}
        .quote-subdetail{font-size:10px;margin-top:4px;color:#374151}
        .quote-center{text-align:center;vertical-align:middle!important}
        .quote-money{text-align:right;white-space:nowrap;vertical-align:middle!important}
        .quote-total{font-weight:800}
        .quote-empty{text-align:center;padding:20px!important}
        .quote-bottom{display:grid;grid-template-columns:1fr 270px;border:1.2px solid #111827;border-top:0;min-height:100px}
        .quote-bottom-left{padding:12px 14px;display:flex;align-items:flex-end}
        .quote-payment{font-size:10.5px;line-height:1.45}
        .quote-payment strong{display:block;font-size:11.5px;margin-bottom:4px}
        .quote-summary{border-left:1.2px solid #111827;padding:0}
        .quote-summary>div:not(.quote-choice-note){display:flex;justify-content:space-between;gap:12px;padding:7px 9px;border-bottom:1px solid #111827;font-size:11px}
        .quote-summary>div:last-child{border-bottom:0}
        .quote-grand{font-size:13px!important;font-weight:800}
        .quote-choice-note{padding:14px 12px;display:flex;flex-direction:column;gap:5px;font-size:11px}
        .quote-signatures{display:grid;grid-template-columns:1fr 1fr;border:1.2px solid #111827;border-top:0;min-height:115px}
        .quote-signatures>div{text-align:center;padding:10px 14px;font-size:11px}
        .quote-signatures>div+div{border-left:1.2px solid #111827}
        .quote-sign-space{height:42px}
        @media print{
          @page{size:A4 portrait;margin:10mm}
          html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .no-print{display:none!important}
          .page-wrapper{width:190mm!important;height:277mm!important;min-height:277mm!important;max-height:277mm!important;margin:0 auto!important;padding:0!important;background:#fff!important;overflow:hidden!important}
          .print-page{width:190mm!important;height:277mm!important;max-width:none!important;margin:0 auto!important;padding:7mm 8mm 8mm!important;box-sizing:border-box!important;background:#fff!important;border-radius:0!important;box-shadow:none!important;display:flex!important;flex-direction:column!important}
          .quote-title{font-size:22px;margin-bottom:6px}
          .quote-company-name{font-size:18px;margin-bottom:12px}
          .quote-company-meta{font-size:10.2px;line-height:1.45;margin-bottom:9px}
          .quote-customer-left,.quote-customer-right{padding:6px 8px}
          .quote-field-row{grid-template-columns:118px 1fr;min-height:21px;font-size:10px}
          .quote-meta-row{grid-template-columns:72px 1fr;min-height:25px;font-size:10px}
          .quote-items-table{font-size:10px}
          .quote-items-table th,.quote-items-table td{padding:5px 5px;line-height:1.32}
          .quote-items-table th>div{font-size:8px}
          .quote-project-row td{padding-top:7px;padding-bottom:7px}
          .quote-project-note{margin-top:3px;line-height:1.3}
          .quote-item-row td{padding-top:9px;padding-bottom:9px}
          .quote-description{line-height:1.3}
          .quote-subdetail{font-size:8.2px}
          .quote-bottom{grid-template-columns:1fr 245px;min-height:86px}
          .quote-bottom-left{padding:8px 10px}
          .quote-payment{font-size:9.2px;line-height:1.4}
          .quote-payment strong{font-size:10px;margin-bottom:3px}
          .quote-summary>div:not(.quote-choice-note){padding:6px 8px;font-size:9.5px}
          .quote-grand{font-size:11px!important}
          .quote-choice-note{padding:9px;font-size:8.8px}
          .quote-signatures{min-height:96px;margin-top:auto!important}
          .quote-signatures>div{padding:8px 12px;font-size:9.5px}
          .quote-sign-space{height:30px}
          tr{break-inside:avoid;page-break-inside:avoid}
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
          {/* PROFESSIONAL A4 QUOTATION */}
          <div className="quote-title">ใบเสนอราคา</div>
          <div className="quote-company-name">
            บริษัท ธานี แอดเวอร์ไทซิ่ง จำกัด (สำนักงานใหญ่)
          </div>
          <div className="quote-company-meta">
            <div>1/5 หมู่ 15 ถนนสันโค้งน้อย ตำบลรอบเวียง อำเภอเมืองเชียงราย จังหวัดเชียงราย 57000</div>
            <div>โทร 093-1318183</div>
            <div>เลขประจำตัวผู้เสียภาษีอากร 0575565002465</div>
          </div>

          <section className="quote-customer-box">
            <div className="quote-customer-left">
              <div className="quote-field-row">
                <span className="quote-field-label">ชื่อลูกค้า / Customers:</span>
                <strong>{customerName}</strong>
              </div>
              <div className="quote-field-row">
                <span className="quote-field-label">ผู้ติดต่อ / Contact:</span>
                <span>{customer?.contact_name || "-"}</span>
              </div>
              {customer?.phone && (
                <div className="quote-field-row">
                  <span className="quote-field-label">โทรศัพท์ / Tel:</span>
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer?.email && (
                <div className="quote-field-row">
                  <span className="quote-field-label">อีเมล / Email:</span>
                  <span>{customer.email}</span>
                </div>
              )}
            </div>

            <div className="quote-customer-right">
              <div className="quote-meta-row">
                <span>เลขที่ / No.</span>
                <strong>{quotation.quotation_no || "-"}</strong>
              </div>
              <div className="quote-meta-row">
                <span>วันที่ / Date</span>
                <strong>{formatDate(quotation.quotation_date)}</strong>
              </div>
              <div className="quote-meta-row">
                <span>ยืนราคา / Valid</span>
                <strong>{quotation.valid_days ?? "-"} วัน</strong>
              </div>
            </div>
          </section>

          <table className="quote-items-table">
            <colgroup>
              <col style={{width:"6%"}} />
              <col style={{width:"47%"}} />
              <col style={{width:"10%"}} />
              <col style={{width:"13%"}} />
              <col style={{width:"11%"}} />
              <col style={{width:"13%"}} />
            </colgroup>
            <thead>
              <tr>
                <th>ลำดับที่<div>Item</div></th>
                <th>รายการ<div>Description</div></th>
                <th>จำนวน<div>Quantity</div></th>
                <th>ราคา/หน่วย<div>Unit Price</div></th>
                <th>VAT</th>
                <th>จำนวนเงิน<div>Amount</div></th>
              </tr>
            </thead>
            <tbody>
              <tr className="quote-project-row">
                <td></td>
                <td colSpan={5}>
                  <strong>{quotation.project_name || "รายละเอียดงาน"}</strong>
                  {quotation.note?.trim() && (
                    <div className="quote-project-note">{quotation.note}</div>
                  )}
                </td>
              </tr>

              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="quote-empty">ไม่มีรายการงาน</td>
                </tr>
              ) : items.map((item,index)=>{
                const base=displayItemAmount(item);
                const vat=base*(Number(quotation.vat_percent||0)/100);
                const total=base+vat;
                return (
                  <tr key={item.id || index} className="quote-item-row">
                    <td className="quote-center">{index+1}</td>
                    <td>
                      <div className="quote-description">{item.description || "-"}</div>
                      {item.size && <div className="quote-subdetail">ขนาด: {formatItemSize(item)}</div>}
                    </td>
                    <td className="quote-center">{item.quantity ?? "-"}</td>
                    <td className="quote-money">฿{formatMoney(item.unit_price)}</td>
                    <td className="quote-money">฿{formatMoney(vat)}</td>
                    <td className="quote-money quote-total">฿{formatMoney(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <section className="quote-bottom">
            <div className="quote-bottom-left">
              <div className="quote-payment">
                <strong>ข้อมูลการชำระเงิน</strong>
                <div>ธนาคาร: กรุงไทย</div>
                <div>ชื่อบัญชี: ธานีแอดเวอร์ไทซิ่ง โดยนายศิวนนท์ ศุภฐิติพงศ์</div>
                <div>เลขบัญชี: 983-4-51403-4</div>
              </div>
            </div>

            <div className="quote-summary">
              {hasIncludedTotal ? (
                <>
                  <div><span>มูลค่าสินค้า</span><strong>฿{formatMoney(quotation.subtotal)}</strong></div>
                  {Number(quotation.discount || 0) > 0 && (
                    <div><span>ส่วนลด</span><strong>- ฿{formatMoney(quotation.discount)}</strong></div>
                  )}
                  <div><span>ภาษีมูลค่าเพิ่ม {quotation.vat_percent ?? 0}%</span><strong>฿{formatMoney(quotation.vat_amount)}</strong></div>
                  <div className="quote-grand"><span>รวมทั้งสิ้น</span><strong>฿{formatMoney(quotation.grand_total)}</strong></div>
                </>
              ) : (
                <div className="quote-choice-note">
                  <strong>เสนอราคาเปรียบเทียบตามตัวเลือกด้านบน</strong>
                  <span>ยอดรวม VAT แสดงแยกในแต่ละรายการ</span>
                </div>
              )}
            </div>
          </section>

          <section className="quote-signatures">
            <div>
              <strong>ผู้อนุมัติ</strong>
              <div className="quote-sign-space"></div>
              <div>ลงชื่อ __________________________</div>
              <div>วันที่ ____ / ____ / ______</div>
            </div>
            <div>
              <strong>ผู้เสนอราคา</strong>
              <div className="quote-sign-space"></div>
              <div>(นายศิวนนท์ ศุภฐิติพงศ์)</div>
              <div>ผู้จัดการ</div>
              <div>วันที่ {formatDate(quotation.quotation_date)}</div>
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
    width: "210mm",
    minHeight: "297mm",
    maxWidth: "calc(100vw - 40px)",
    margin: "0 auto",
    background: "white",
    padding: "14mm 15mm 16mm",
    boxSizing: "border-box",
    borderRadius: "8px",
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

