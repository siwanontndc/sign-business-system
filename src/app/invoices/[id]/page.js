"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (id) {
      loadInvoice();
    }
  }, [id]);

  async function loadInvoice() {
    try {
      setLoading(true);

      // ตรวจ Login
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      // =====================================================
      // 1. โหลด Invoice
      // =====================================================
      const { data: invoiceData, error: invoiceError } =
        await supabase
          .from("invoices")
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

      if (invoiceError) {
        throw invoiceError;
      }

      if (!invoiceData) {
        throw new Error("ไม่พบใบแจ้งหนี้");
      }

      setInvoice(invoiceData);

      // =====================================================
      // 2. หา quotation_id ของ Invoice
      // =====================================================
      let quotationId =
        invoiceData.quotation_id || null;

      // เผื่อ Invoice เก่าบางใบไม่มี quotation_id
      // ให้ค้นจาก customer + project_name
      if (!quotationId && invoiceData.project_name) {
        let quotationQuery = supabase
          .from("quotations")
          .select("id")
          .eq(
            "project_name",
            invoiceData.project_name
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(1);

        if (invoiceData.customer_id) {
          quotationQuery = quotationQuery.eq(
            "customer_id",
            invoiceData.customer_id
          );
        }

        const {
          data: quotationData,
          error: quotationError,
        } = await quotationQuery.maybeSingle();

        if (!quotationError && quotationData?.id) {
          quotationId = quotationData.id;
        }
      }

      // =====================================================
      // 3. โหลดรายการจาก quotation_items
      //
      // จุดแก้หลักอยู่ตรงนี้
      // Invoice สร้างจากใบเสนอราคา
      // ดังนั้นรายการต้องดึงจาก quotation_items
      // =====================================================
      if (quotationId) {
        const {
          data: quotationItems,
          error: itemError,
        } = await supabase
          .from("quotation_items")
          .select("*")
          .eq("quotation_id", quotationId)
          .order("sort_order", {
            ascending: true,
          });

        if (itemError) {
          console.error(
            "load quotation_items:",
            itemError
          );

          // ถ้า DB เก่าไม่มี sort_order
          const {
            data: fallbackItems,
            error: fallbackError,
          } = await supabase
            .from("quotation_items")
            .select("*")
            .eq("quotation_id", quotationId)
            .order("created_at", {
              ascending: true,
            });

          if (fallbackError) {
            console.error(
              "fallback quotation_items:",
              fallbackError
            );

            setItems([]);
          } else {
            setItems(fallbackItems || []);
          }
        } else {
          setItems(quotationItems || []);
        }
      } else {
        console.warn(
          "Invoice ไม่มี quotation_id และหาใบเสนอราคาต้นทางไม่พบ"
        );

        setItems([]);
      }
    } catch (error) {
      console.error("loadInvoice error:", error);

      alert(
        "โหลดใบแจ้งหนี้ไม่สำเร็จ: " +
          (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // UPDATE STATUS
  // =========================================================

  async function changeStatus(newStatus) {
    if (!invoice || updatingStatus) return;

    try {
      setUpdatingStatus(true);

      const { data, error } = await supabase
        .from("invoices")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setInvoice((prev) => ({
        ...prev,
        ...data,
        customers: prev?.customers,
      }));
    } catch (error) {
      console.error(
        "change invoice status:",
        error
      );

      alert(
        "เปลี่ยนสถานะไม่สำเร็จ: " +
          (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  // =========================================================
  // FORMAT
  // =========================================================

  function money(value) {
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
        month: "long",
        year: "numeric",
      }
    );
  }

  function formatSize(item) {
    // ระบบปัจจุบันบางรายการใช้ size
    if (item?.size) {
      return item.size;
    }

    // รองรับข้อมูลเก่าที่แยก width / height
    if (item?.width && item?.height) {
      return `${item.width} × ${item.height} ซม.`;
    }

    if (item?.width) {
      return `${item.width} ซม.`;
    }

    if (item?.height) {
      return `${item.height} ซม.`;
    }

    return "-";
  }

  function itemAmount(item) {
    if (
      item?.amount !== null &&
      item?.amount !== undefined
    ) {
      return Number(item.amount || 0);
    }

    return (
      Number(item?.quantity || 0) *
      Number(item?.unit_price || 0)
    );
  }

  function statusLabel(status) {
    if (status === "paid") {
      return "ชำระแล้ว";
    }

    if (status === "pending") {
      return "รอชำระ";
    }

    if (status === "cancelled") {
      return "ยกเลิก";
    }

    return status || "-";
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <main style={loadingPage}>
        กำลังโหลดใบแจ้งหนี้...
      </main>
    );
  }

  if (!invoice) {
    return (
      <main style={loadingPage}>
        ไม่พบใบแจ้งหนี้
      </main>
    );
  }

  const customer = invoice.customers;

  const invoiceDate =
    invoice.invoice_date ||
    invoice.created_at;

  const dueDate =
    invoice.due_date || null;

  const subtotal =
    invoice.subtotal !== null &&
    invoice.subtotal !== undefined
      ? Number(invoice.subtotal)
      : items.reduce(
          (sum, item) =>
            sum + itemAmount(item),
          0
        );

  const discount =
    Number(invoice.discount || 0);

  const vat =
    Number(
      invoice.vat_amount ||
        invoice.vat ||
        0
    );

  const grandTotal =
    Number(invoice.grand_total || 0);

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
            color: #111827 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .page-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          .print-page {
            width: 190mm !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <main
        className="page-wrapper"
        style={pageWrapper}
      >
        {/* =============================================== */}
        {/* TOOLBAR */}
        {/* =============================================== */}

        <div
          className="no-print"
          style={toolbar}
        >
          <button
            type="button"
            onClick={() =>
              router.push("/invoices/list")
            }
            style={secondaryButton}
          >
            ← กลับรายการ
          </button>

          <div style={toolbarRight}>
            <select
              value={invoice.status || "pending"}
              disabled={updatingStatus || invoice.status === "paid"}
              onChange={(e) =>
                changeStatus(e.target.value)
              }
              style={statusSelect}
            >
              <option value="pending">
                รอชำระ
              </option>

              <option value="paid">
                ชำระแล้ว
              </option>

              

              <option value="cancelled">
                ยกเลิก
              </option>
            </select>

            <button
              type="button"
              onClick={() => window.print()}
              style={primaryButton}
            >
              พิมพ์ / Save PDF
            </button>
          </div>
        </div>

        {/* =============================================== */}
        {/* DOCUMENT */}
        {/* =============================================== */}

        <article
          className="print-page"
          style={documentStyle}
        >
          {/* HEADER */}

          <header style={header}>
            <div style={companyArea}>
              <img
                src="/logo.png"
                alt="THANEE"
                style={logo}
              />

              <div>
                <div style={companyName}>
                  ร้าน ธานี แอ็ดเวอร์ไทซิ่ง
                </div>

                <div style={companyEnglish}>
                  THANEE ADVERTISING
                </div>

                <div style={companyText}>
                  14/15 ม.8 ต.บางกระสั้น อ.บางปะอิน จ.พระนครศรีอยุธยา 13160
                </div>

                <div style={companyText}>
                  เลขประจำตัวผู้เสียภาษี: 3149900246546
                </div>

                <div style={companyText}>
                  โทร: 089-779-7319
                </div>

                <div style={companyText}>
                  อีเมล:
                  siwanon_s@hotmail.com
                </div>

                <div style={companyText}>
                  LINE: 0931318183
                </div>
              </div>
            </div>

            <div style={documentTitleArea}>
              <h1 style={documentTitle}>
                ใบแจ้งหนี้
              </h1>

              <div style={documentEnglish}>
                INVOICE
              </div>

              <div style={documentMeta}>
                <div>
                  เลขที่:{" "}
                  <strong>
                    {invoice.invoice_no ||
                      "-"}
                  </strong>
                </div>

                <div>
                  วันที่:{" "}
                  {formatDate(invoiceDate)}
                </div>

                <div>
                  ครบกำหนด:{" "}
                  {formatDate(dueDate)}
                </div>

                <div>
                  สถานะ:{" "}
                  <strong>
                    {statusLabel(
                      invoice.status
                    )}
                  </strong>
                </div>
              </div>
            </div>
          </header>

          <div style={divider} />

          {/* CUSTOMER / PROJECT */}

          <section style={infoGrid}>
            <div style={infoCard}>
              <h2 style={sectionTitle}>
                ข้อมูลลูกค้า
              </h2>

              <InfoRow
                label="รหัสลูกค้า"
                value={
                  customer?.customer_code
                }
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
                value={
                  customer?.contact_name
                }
              />

              <InfoRow
                label="โทรศัพท์"
                value={customer?.phone}
              />

              <InfoRow
                label="อีเมล"
                value={customer?.email}
              />
            </div>

            <div style={infoCard}>
              <h2 style={sectionTitle}>
                รายละเอียดงาน
              </h2>

              <InfoRow
                label="โครงการ / งาน"
                value={
                  invoice.project_name
                }
              />

              <InfoRow
                label="สถานะ"
                value={statusLabel(
                  invoice.status
                )}
              />
            </div>
          </section>

          {/* =============================================== */}
          {/* ITEMS */}
          {/* =============================================== */}

          <section style={itemsSection}>
            <h2 style={sectionTitle}>
              รายการสินค้า / บริการ
            </h2>

            <div
              style={{
                overflowX: "auto",
              }}
            >
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>
                      ลำดับ
                    </th>

                    <th
                      style={{
                        ...th,
                        textAlign: "left",
                      }}
                    >
                      รายละเอียด
                    </th>

                    <th style={th}>
                      ขนาด
                    </th>

                    <th style={th}>
                      จำนวน
                    </th>

                    <th style={th}>
                      หน่วย
                    </th>

                    <th
                      style={{
                        ...th,
                        textAlign: "right",
                      }}
                    >
                      ราคาต่อหน่วย
                    </th>

                    <th
                      style={{
                        ...th,
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
                        style={emptyCell}
                      >
                        ไม่พบรายการสินค้า /
                        บริการจากใบเสนอราคา
                      </td>
                    </tr>
                  ) : (
                    items.map(
                      (item, index) => (
                        <tr
                          key={
                            item.id ||
                            index
                          }
                        >
                          <td
                            style={{
                              ...td,
                              textAlign:
                                "center",
                            }}
                          >
                            {index + 1}
                          </td>

                          <td style={td}>
                            {item.description ||
                              "-"}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "center",
                            }}
                          >
                            {formatSize(
                              item
                            )}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "center",
                            }}
                          >
                            {Number(
                              item.quantity ||
                                0
                            )}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "center",
                            }}
                          >
                            {item.unit ||
                              "-"}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "right",
                            }}
                          >
                            ฿
                            {money(
                              item.unit_price
                            )}
                          </td>

                          <td
                            style={{
                              ...td,
                              textAlign:
                                "right",
                              fontWeight:
                                "700",
                            }}
                          >
                            ฿
                            {money(
                              itemAmount(
                                item
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* =============================================== */}
          {/* BOTTOM */}
          {/* =============================================== */}

          <section style={bottomGrid}>
            <div>
              <h2 style={sectionTitle}>
                หมายเหตุ / เงื่อนไข
              </h2>

              <div style={noteBox}>
                {invoice.note || "-"}
              </div>
            </div>

            <div style={summaryBox}>
              <SummaryRow
                label="รวมเป็นเงิน"
                value={`฿${money(
                  subtotal
                )}`}
              />

              {discount > 0 && (
                <SummaryRow
                  label="ส่วนลด"
                  value={`- ฿${money(
                    discount
                  )}`}
                />
              )}

              {vat > 0 && (
                <SummaryRow
                  label="ภาษีมูลค่าเพิ่ม"
                  value={`฿${money(
                    vat
                  )}`}
                />
              )}

              <div style={grandTotalRow}>
                <span>ยอดสุทธิ</span>

                <strong>
                  ฿{money(grandTotal)}
                </strong>
              </div>
            </div>
          </section>
        </article>
      </main>
    </>
  );
}

// ===========================================================
// COMPONENTS
// ===========================================================

function InfoRow({ label, value }) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>
        {label}
      </div>

      <div style={infoValue}>
        {value || "-"}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={summaryRow}>
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

// ===========================================================
// STYLE
// ===========================================================

const loadingPage = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef3f9",
  fontSize: "18px",
  color: "#111827",
};

const pageWrapper = {
  minHeight: "100vh",
  background: "#eef3f9",
  padding: "32px",
  color: "#111827",
};

const toolbar = {
  maxWidth: "1100px",
  margin: "0 auto 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const toolbarRight = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
};

const secondaryButton = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: "700",
  fontSize: "15px",
};

const primaryButton = {
  padding: "11px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "700",
  fontSize: "15px",
};

const statusSelect = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  background: "white",
  fontSize: "15px",
  fontWeight: "700",
  cursor: "pointer",
};

const documentStyle = {
  width: "100%",
  maxWidth: "1100px",
  margin: "0 auto",
  background: "white",
  borderRadius: "12px",
  padding: "34px",
  boxShadow:
    "0 2px 12px rgba(0,0,0,0.06)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "30px",
};

const companyArea = {
  display: "flex",
  alignItems: "center",
  gap: "18px",
};

const logo = {
  width: "135px",
  height: "auto",
  objectFit: "contain",
};

const companyName = {
  fontSize: "20px",
  fontWeight: "800",
};

const companyEnglish = {
  fontSize: "14px",
  fontWeight: "800",
  marginBottom: "8px",
};

const companyText = {
  fontSize: "12px",
  lineHeight: "1.7",
  color: "#374151",
};

const documentTitleArea = {
  textAlign: "right",
};

const documentTitle = {
  margin: 0,
  fontSize: "30px",
};

const documentEnglish = {
  color: "#6b7280",
  fontSize: "15px",
  marginTop: "4px",
};

const documentMeta = {
  marginTop: "14px",
  lineHeight: "1.8",
  fontSize: "13px",
};

const divider = {
  borderTop: "3px solid #111827",
  margin: "26px 0 22px",
};

const infoGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",
  gap: "18px",
};

const infoCard = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "16px",
  minHeight: "160px",
};

const sectionTitle = {
  margin: "0 0 14px",
  fontSize: "17px",
  fontWeight: "800",
};

const infoRow = {
  display: "grid",
  gridTemplateColumns: "135px 1fr",
  gap: "8px",
  marginBottom: "8px",
  fontSize: "13px",
};

const infoLabel = {
  color: "#4b5563",
};

const infoValue = {
  fontWeight: "700",
};

const itemsSection = {
  marginTop: "26px",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const th = {
  background: "#f3f4f6",
  border: "1px solid #d1d5db",
  padding: "10px 8px",
  textAlign: "center",
  fontWeight: "700",
};

const td = {
  border: "1px solid #e5e7eb",
  padding: "10px 8px",
};

const emptyCell = {
  border: "1px solid #e5e7eb",
  padding: "24px",
  textAlign: "center",
  color: "#6b7280",
};

const bottomGrid = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1fr) 360px",
  gap: "22px",
  marginTop: "24px",
  alignItems: "start",
};

const noteBox = {
  border: "1px solid #e5e7eb",
  minHeight: "90px",
  borderRadius: "8px",
  padding: "14px",
  fontSize: "13px",
  whiteSpace: "pre-wrap",
};

const summaryBox = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "16px",
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  padding: "7px 0",
  fontSize: "13px",
  borderBottom: "1px solid #f3f4f6",
};

const grandTotalRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  marginTop: "10px",
  paddingTop: "12px",
  borderTop: "2px solid #111827",
  fontSize: "18px",
  fontWeight: "800",
};
