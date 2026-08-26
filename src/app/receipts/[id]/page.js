"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "../../lib/supabase";


export default function ReceiptDetailPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const id =
    params.id;

  const [
    receipt,
    setReceipt,
  ] =
    useState(null);

  const [
    items,
    setItems,
  ] =
    useState([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);


  useEffect(() => {
    if (id) {
      loadReceipt();
    }
  }, [id]);


  /* ============================================================
     LOAD RECEIPT
  ============================================================ */

  async function loadReceipt() {
    setLoading(true);

    try {
      /* ========================================================
         1. SESSION
      ======================================================== */

      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();


      if (!session) {
        router.push(
          "/login"
        );

        return;
      }


      /* ========================================================
         2. RECEIPT
         ต้องดึง invoice.quotation_id มาด้วย
      ======================================================== */

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "receipts"
          )
          .select(`
            *,
            customers (
              customer_code,
              company_name,
              contact_name,
              phone,
              email
            ),
            invoices (
              id,
              invoice_no,
              quotation_id,
              project_name,
              subtotal,
              discount,
              vat_percent,
              vat_amount,
              grand_total,
              status
            )
          `)
          .eq(
            "id",
            id
          )
          .single();


      if (error) {
        throw error;
      }


      if (!data) {
        throw new Error(
          "ไม่พบข้อมูลใบเสร็จ"
        );
      }


      /* ========================================================
         3. ลองโหลด receipt_items ก่อน
         รองรับใบเสร็จเก่าที่มีการ copy รายการไว้แล้ว
      ======================================================== */

      let finalItems =
        [];


      const {
        data:
          receiptItems,

        error:
          receiptItemError,
      } =
        await supabase
          .from(
            "receipt_items"
          )
          .select("*")
          .eq(
            "receipt_id",
            id
          )
          .order(
            "created_at",
            {
              ascending:
                true,
            }
          );


      if (
        !receiptItemError &&
        receiptItems &&
        receiptItems.length >
          0
      ) {
        finalItems =
          receiptItems.map(
            (
              item,
              index
            ) => ({
              ...item,

              _source:
                "receipt_items",

              _sort:
                item.sort_order ??
                index + 1,
            })
          );
      }


      /* ========================================================
         4. ถ้า receipt_items ว่าง
            ดึงต้นฉบับจาก quotation_items

            Receipt
              -> Invoice
              -> quotation_id
              -> quotation_items
      ======================================================== */

      if (
        finalItems.length ===
        0
      ) {
        const quotationId =
          data
            ?.invoices
            ?.quotation_id;


        if (quotationId) {
          const {
            data:
              quotationItems,

            error:
              quotationItemError,
          } =
            await supabase
              .from(
                "quotation_items"
              )
              .select("*")
              .eq(
                "quotation_id",
                quotationId
              )
              .order(
                "sort_order",
                {
                  ascending:
                    true,
                }
              );


          if (
            quotationItemError
          ) {
            console.error(
              "quotation_items:",
              quotationItemError
            );

            /*
             * เผื่อข้อมูลเก่าไม่มี sort_order
             * ลองใหม่โดยไม่ order
             */

            const {
              data:
                fallbackItems,

              error:
                fallbackError,
            } =
              await supabase
                .from(
                  "quotation_items"
                )
                .select("*")
                .eq(
                  "quotation_id",
                  quotationId
                );


            if (
              fallbackError
            ) {
              throw fallbackError;
            }


            finalItems =
              (
                fallbackItems ||
                []
              ).map(
                (
                  item,
                  index
                ) => ({
                  ...item,

                  _source:
                    "quotation_items",

                  _sort:
                    item.sort_order ??
                    index + 1,
                })
              );

          } else {
            finalItems =
              (
                quotationItems ||
                []
              ).map(
                (
                  item,
                  index
                ) => ({
                  ...item,

                  _source:
                    "quotation_items",

                  _sort:
                    item.sort_order ??
                    index + 1,
                })
              );
          }
        }
      }


      /* ========================================================
         5. SORT
      ======================================================== */

      finalItems.sort(
        (a, b) =>
          Number(
            a._sort || 0
          ) -
          Number(
            b._sort || 0
          )
      );


      setReceipt(
        data
      );

      setItems(
        finalItems
      );

    } catch (error) {
      console.error(
        "loadReceipt:",
        error
      );


      alert(
        "โหลดใบเสร็จไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );

    } finally {
      setLoading(
        false
      );
    }
  }


  /* ============================================================
     MONEY
  ============================================================ */

  function money(value) {
    return new Intl.NumberFormat(
      "th-TH",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      }
    ).format(
      Number(
        value ||
        0
      )
    );
  }


  /* ============================================================
     DATE
  ============================================================ */

  function formatDate(
    value
  ) {
    if (!value) {
      return "-";
    }


    const date =
      new Date(value);


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }


    return date.toLocaleDateString(
      "th-TH",
      {
        day:
          "2-digit",

        month:
          "long",

        year:
          "numeric",
      }
    );
  }


  /* ============================================================
     ITEM HELPERS
  ============================================================ */

  function itemDescription(
    item
  ) {
    return (
      item?.description ||
      "-"
    );
  }


  function itemSize(
    item
  ) {
    /*
     * quotation_items ของระบบใหม่ใช้ size เช่น:
     * "100*100 ซม."
     * "5 นิ้ว"
     */

    if (
      item?.size !==
        null &&
      item?.size !==
        undefined &&
      String(
        item.size
      ).trim() !==
        ""
    ) {
      return String(
        item.size
      );
    }


    /*
     * รองรับ receipt_items / ข้อมูลเก่า
     * ที่ใช้ width + height
     */

    if (
      item?.width &&
      item?.height
    ) {
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


  function itemQuantity(
    item
  ) {
    return Number(
      item?.quantity ??
        0
    );
  }


  function itemUnit(
    item
  ) {
    return (
      item?.unit ||
      "-"
    );
  }


  function itemUnitPrice(
    item
  ) {
    return Number(
      item?.unit_price ??
        item?.price ??
        0
    );
  }


  function itemAmount(
    item
  ) {
    /*
     * quotation_items ใช้ amount
     * receipt_items เก่าอาจใช้ line_total
     */

    if (
      item?.amount !==
        null &&
      item?.amount !==
        undefined
    ) {
      return Number(
        item.amount ||
          0
      );
    }


    if (
      item?.line_total !==
        null &&
      item?.line_total !==
        undefined
    ) {
      return Number(
        item.line_total ||
          0
      );
    }


    /*
     * fallback สุดท้าย
     */

    return (
      itemQuantity(item) *
      itemUnitPrice(item)
    );
  }


  /* ============================================================
     LOADING
  ============================================================ */

  if (loading) {
    return (
      <div
        style={
          loadingStyle
        }
      >
        กำลังโหลด...
      </div>
    );
  }


  if (!receipt) {
    return (
      <div
        style={
          loadingStyle
        }
      >
        ไม่พบใบเสร็จ
      </div>
    );
  }


  /* ============================================================
     DOCUMENT DATA
  ============================================================ */

  const customer =
    receipt.customers;


  const invoice =
    receipt.invoices;


  const subtotal =
    Number(
      receipt.subtotal ??
        invoice?.subtotal ??
        receipt.grand_total ??
        0
    );


  const discount =
    Number(
      receipt.discount ??
        invoice?.discount ??
        0
    );


  const vatPercent =
    Number(
      receipt.vat_percent ??
        invoice?.vat_percent ??
        0
    );


  const vatAmount =
    Number(
      receipt.vat_amount ??
        invoice?.vat_amount ??
        0
    );


  const grandTotal =
    Number(
      receipt.grand_total ??
        invoice?.grand_total ??
        0
    );


  const afterDiscount =
    Math.max(
      subtotal -
        discount,
      0
    );


  /* ============================================================
     UI
  ============================================================ */

  return (
    <>
      <style>
        {`
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
              box-shadow: none !important;
              border-radius: 0 !important;
            }

            tr {
              page-break-inside: avoid;
            }
          }
        `}
      </style>


      <main
        className="page-wrapper"

        style={
          styles.pageWrapper
        }
      >

        {/* ======================================================
            TOOLBAR
        ====================================================== */}

        <div
          className="no-print"

          style={
            styles.toolbar
          }
        >
          <button
            type="button"

            onClick={() =>
              router.push(
                "/receipts/list"
              )
            }

            style={
              styles.secondaryButton
            }
          >
            ← กลับรายการ
          </button>


          <button
            type="button"

            onClick={() =>
              window.print()
            }

            style={
              styles.primaryButton
            }
          >
            พิมพ์ / Save PDF
          </button>
        </div>


        {/* ======================================================
            DOCUMENT
        ====================================================== */}

        <article
          className="print-page"

          style={
            styles.document
          }
        >

          {/* ====================================================
              HEADER
          ==================================================== */}

          <header
            style={
              styles.header
            }
          >
            <div
              style={
                styles.companyArea
              }
            >
              <img
                src="/logo.png"

                alt="THANEE"

                style={
                  styles.logo
                }
              />


              <div>
                <div
                  style={
                    styles.companyName
                  }
                >
                  ธานี แอดเวอร์ไทซิ่ง
                </div>


                <div
                  style={
                    styles.companyEnglish
                  }
                >
                  THANEE ADVERTISING
                </div>


                <div
                  style={
                    styles.companyText
                  }
                >
                  1/5 ม.15 ถ.สันโค้งน้อย ต.รอบเวียง อ.เมือง จ.เชียงราย 57000
                </div>


                <div
                  style={
                    styles.companyText
                  }
                >
                  เลขประจำตัวผู้เสียภาษี: 0575565002465
                </div>


                <div
                  style={
                    styles.companyText
                  }
                >
                  โทร: 093-131-8183, 084-948-7213
                </div>


                <div
                  style={
                    styles.companyText
                  }
                >
                  อีเมล: siwanon_s@hotmail.com
                </div>


                <div
                  style={
                    styles.companyText
                  }
                >
                  LINE: 0931318183
                </div>
              </div>
            </div>


            <div
              style={
                styles.docMeta
              }
            >
              <h1
                style={
                  styles.docTitle
                }
              >
                ใบเสร็จรับเงิน
              </h1>


              <div
                style={
                  styles.docEnglish
                }
              >
                RECEIPT
              </div>


              <div
                style={
                  styles.metaText
                }
              >
                <div>
                  เลขที่:{" "}
                  <strong>
                    {receipt.receipt_no}
                  </strong>
                </div>


                <div>
                  วันที่:{" "}
                  {formatDate(
                    receipt.receipt_date
                  )}
                </div>


                <div>
                  สถานะ:{" "}

                  <strong>
                    {receipt.status ===
                    "received"
                      ? "รับชำระแล้ว"
                      : "ยกเลิก"}
                  </strong>
                </div>
              </div>
            </div>
          </header>


          <div
            style={
              styles.divider
            }
          />


          {/* ====================================================
              CUSTOMER + PAYMENT
          ==================================================== */}

          <section
            style={
              styles.infoGrid
            }
          >

            <div
              style={
                styles.infoBox
              }
            >
              <h3
                style={
                  styles.sectionTitle
                }
              >
                ได้รับเงินจาก
              </h3>


              <Info
                label="รหัสลูกค้า"

                value={
                  customer
                    ?.customer_code
                }
              />


              <Info
                label="บริษัท / ลูกค้า"

                value={
                  customer
                    ?.company_name ||
                  customer
                    ?.contact_name
                }
              />


              <Info
                label="ผู้ติดต่อ"

                value={
                  customer
                    ?.contact_name
                }
              />


              <Info
                label="โทรศัพท์"

                value={
                  customer
                    ?.phone
                }
              />


              <Info
                label="อีเมล"

                value={
                  customer
                    ?.email
                }
              />
            </div>


            <div
              style={
                styles.infoBox
              }
            >
              <h3
                style={
                  styles.sectionTitle
                }
              >
                รายละเอียดการรับชำระ
              </h3>


              <Info
                label="โครงการ / งาน"

                value={
                  receipt.project_name ||
                  invoice?.project_name
                }
              />


              <Info
                label="เลขที่ Invoice"

                value={
                  invoice?.invoice_no ||
                  "-"
                }
              />
            </div>
          </section>


          {/* ====================================================
              ITEMS
          ==================================================== */}

          <h3
            style={
              styles.sectionTitle
            }
          >
            รายการสินค้า / บริการ
          </h3>


          <table
            style={
              styles.table
            }
          >
            <thead>
              <tr>
                <th
                  style={
                    styles.th
                  }
                >
                  ลำดับ
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  รายละเอียด
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  ขนาด
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  จำนวน
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  หน่วย
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  ราคาต่อหน่วย
                </th>

                <th
                  style={
                    styles.th
                  }
                >
                  จำนวนเงิน
                </th>
              </tr>
            </thead>


            <tbody>
              {items.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={7}

                    style={{
                      ...styles.td,

                      padding:
                        "20px",

                      color:
                        "#6b7280",
                    }}
                  >
                    ไม่มีรายการ
                  </td>
                </tr>

              ) : (
                items.map(
                  (
                    item,
                    index
                  ) => (
                    <tr
                      key={
                        item.id ||
                        `${index}`
                      }
                    >
                      <td
                        style={
                          styles.td
                        }
                      >
                        {index +
                          1}
                      </td>


                      <td
                        style={{
                          ...styles.td,

                          textAlign:
                            "left",

                          fontWeight:
                            "600",
                        }}
                      >
                        {itemDescription(
                          item
                        )}
                      </td>


                      <td
                        style={
                          styles.td
                        }
                      >
                        {itemSize(
                          item
                        )}
                      </td>


                      <td
                        style={
                          styles.td
                        }
                      >
                        {itemQuantity(
                          item
                        )}
                      </td>


                      <td
                        style={
                          styles.td
                        }
                      >
                        {itemUnit(
                          item
                        )}
                      </td>


                      <td
                        style={{
                          ...styles.td,

                          textAlign:
                            "right",
                        }}
                      >
                        ฿
                        {money(
                          itemUnitPrice(
                            item
                          )
                        )}
                      </td>


                      <td
                        style={{
                          ...styles.td,

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


          {/* ====================================================
              SUMMARY
          ==================================================== */}

          <section
            style={
              styles.summaryGrid
            }
          >

            <div>
              <h3
                style={
                  styles.sectionTitle
                }
              >
                หมายเหตุ
              </h3>


              <div
                style={
                  styles.noteBox
                }
              >
                {receipt.note
                  ?.trim() ||
                  "-"}
              </div>


              <div
                style={
                  styles.paymentBox
                }
              >
                <strong>
                  รับชำระเงินเรียบร้อยแล้ว
                </strong>

                <div>
                  ขอขอบพระคุณที่ใช้บริการ ธานี แอดเวอร์ไทซิ่ง
                </div>
              </div>
            </div>


            <div
              style={
                styles.totalBox
              }
            >
              <Total
                label="รวมเป็นเงิน"

                value={
                  subtotal
                }
              />


              <Total
                label="ส่วนลด"

                value={
                  discount
                }
              />


              <Total
                label="มูลค่าหลังหักส่วนลด"

                value={
                  afterDiscount
                }
              />


              <Total
                label={`ภาษีมูลค่าเพิ่ม VAT (${vatPercent}%)`}

                value={
                  vatAmount
                }
              />


              <div
                style={
                  styles.totalDivider
                }
              />


              <div
                style={
                  styles.grandTotal
                }
              >
                <span>
                  รับชำระสุทธิ
                </span>


                <span
                  style={
                    styles.grandTotalValue
                  }
                >
                  ฿
                  {money(
                    grandTotal
                  )}
                </span>
              </div>
            </div>
          </section>


          {/* ====================================================
              SIGNATURES
          ==================================================== */}

          <section
            style={
              styles.signatures
            }
          >
            <Signature
              title="ผู้รับเงิน"
            />


            <Signature
              title="ผู้ชำระเงิน / ลูกค้า"
            />
          </section>
        </article>
      </main>
    </>
  );


  /* ============================================================
     TOTAL COMPONENT
  ============================================================ */

  function Total({
    label,
    value,
  }) {
    return (
      <div
        style={
          styles.totalRow
        }
      >
        <span>
          {label}
        </span>

        <strong>
          ฿{money(value)}
        </strong>
      </div>
    );
  }
}


/* ============================================================
   INFO
============================================================ */

function Info({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.infoRow
      }
    >
      <span
        style={
          styles.infoLabel
        }
      >
        {label}
      </span>


      <strong>
        {value || "-"}
      </strong>
    </div>
  );
}


/* ============================================================
   SIGNATURE
============================================================ */

function Signature({
  title,
}) {
  return (
    <div
      style={{
        textAlign:
          "center",
      }}
    >
      <div
        style={{
          height:
            "50px",
        }}
      />


      <strong>
        {title}
      </strong>


      <div
        style={
          styles.signatureText
        }
      >
        ลงชื่อ ______________________
      </div>


      <div
        style={
          styles.signatureText
        }
      >
        วันที่ ____ / ____ / ______
      </div>
    </div>
  );
}


/* ============================================================
   STYLES
============================================================ */

const loadingStyle = {
  padding:
    "50px",

  textAlign:
    "center",

  color:
    "#111827",
};


const styles = {

  pageWrapper: {
    minHeight:
      "100vh",

    background:
      "#eef2f7",

    padding:
      "30px 20px",

    color:
      "#111827",

    fontFamily:
      "Tahoma, Arial, sans-serif",
  },


  toolbar: {
    maxWidth:
      "1050px",

    margin:
      "0 auto 18px",

    display:
      "flex",

    justifyContent:
      "space-between",
  },


  primaryButton: {
    padding:
      "10px 18px",

    border:
      "none",

    borderRadius:
      "8px",

    background:
      "#2563eb",

    color:
      "white",

    cursor:
      "pointer",

    fontWeight:
      "700",
  },


  secondaryButton: {
    padding:
      "10px 16px",

    border:
      "1px solid #d1d5db",

    borderRadius:
      "8px",

    background:
      "white",

    color:
      "#111827",

    cursor:
      "pointer",

    fontWeight:
      "600",
  },


  document: {
    maxWidth:
      "1050px",

    margin:
      "0 auto",

    background:
      "white",

    padding:
      "34px 38px",

    borderRadius:
      "12px",

    boxShadow:
      "0 4px 20px rgba(0,0,0,0.08)",
  },


  header: {
    display:
      "grid",

    gridTemplateColumns:
      "1fr 300px",

    gap:
      "25px",
  },


  companyArea: {
    display:
      "flex",

    gap:
      "15px",
  },


  logo: {
    width:
      "125px",

    height:
      "auto",

    objectFit:
      "contain",
  },


  companyName: {
    fontSize:
      "21px",

    fontWeight:
      "800",
  },


  companyEnglish: {
    fontWeight:
      "700",

    marginBottom:
      "6px",
  },


  companyText: {
    fontSize:
      "12px",

    lineHeight:
      1.6,

    color:
      "#374151",
  },


  docMeta: {
    textAlign:
      "right",
  },


  docTitle: {
    margin: 0,

    fontSize:
      "30px",
  },


  docEnglish: {
    color:
      "#6b7280",
  },


  metaText: {
    marginTop:
      "12px",

    lineHeight:
      1.7,

    fontSize:
      "13px",
  },


  divider: {
    height:
      "3px",

    background:
      "#111827",

    margin:
      "22px 0",
  },


  infoGrid: {
    display:
      "grid",

    gridTemplateColumns:
      "1fr 1fr",

    gap:
      "18px",

    marginBottom:
      "24px",
  },


  infoBox: {
    background:
      "#fafafa",

    border:
      "1px solid #d1d5db",

    borderRadius:
      "8px",

    padding:
      "15px",
  },


  sectionTitle: {
    margin:
      "0 0 12px",
  },


  infoRow: {
    display:
      "grid",

    gridTemplateColumns:
      "120px 1fr",

    gap:
      "8px",

    marginBottom:
      "7px",

    fontSize:
      "13px",
  },


  infoLabel: {
    color:
      "#4b5563",
  },


  table: {
    width:
      "100%",

    borderCollapse:
      "collapse",

    fontSize:
      "12px",
  },


  th: {
    border:
      "1px solid #cbd5e1",

    background:
      "#f3f4f6",

    padding:
      "9px 7px",

    textAlign:
      "center",
  },


  td: {
    border:
      "1px solid #e5e7eb",

    padding:
      "9px 7px",

    textAlign:
      "center",
  },


  summaryGrid: {
    display:
      "grid",

    gridTemplateColumns:
      "1fr 340px",

    gap:
      "20px",

    marginTop:
      "22px",
  },


  noteBox: {
    minHeight:
      "70px",

    background:
      "#fafafa",

    border:
      "1px solid #e5e7eb",

    borderRadius:
      "8px",

    padding:
      "12px",

    fontSize:
      "13px",
  },


  paymentBox: {
    marginTop:
      "12px",

    border:
      "1px solid #d1d5db",

    borderRadius:
      "8px",

    padding:
      "12px",

    lineHeight:
      1.7,

    fontSize:
      "12px",
  },


  totalBox: {
    background:
      "#fafafa",

    border:
      "1px solid #d1d5db",

    borderRadius:
      "8px",

    padding:
      "15px",
  },


  totalRow: {
    display:
      "flex",

    justifyContent:
      "space-between",

    marginBottom:
      "9px",

    fontSize:
      "13px",
  },


  totalDivider: {
    borderTop:
      "2px solid #111827",

    margin:
      "12px 0",
  },


  grandTotal: {
    display:
      "flex",

    justifyContent:
      "space-between",

    fontSize:
      "19px",

    fontWeight:
      "800",
  },


  grandTotalValue: {
    color:
      "#2563eb",
  },


  signatures: {
    display:
      "grid",

    gridTemplateColumns:
      "1fr 1fr",

    gap:
      "70px",

    marginTop:
      "38px",
  },


  signatureText: {
    marginTop:
      "7px",

    fontSize:
      "12px",

    color:
      "#374151",
  },
};
