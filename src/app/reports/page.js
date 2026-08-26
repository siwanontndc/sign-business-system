"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function ReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [deliveryJobs, setDeliveryJobs] = useState([]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const [
      customerResult,
      quotationResult,
      invoiceResult,
      receiptResult,
      deliveryResult,
    ] = await Promise.all([
      supabase
        .from("customers")
        .select(`
          id,
          customer_code,
          company_name,
          contact_name,
          created_at
        `)
        .order("created_at", { ascending: false }),

      supabase
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
            contact_name
          )
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          project_name,
          grand_total,
          status,
          created_at,
          customers (
            customer_code,
            company_name,
            contact_name
          )
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("receipts")
        .select(`
          id,
          receipt_no,
          project_name,
          grand_total,
          status,
          created_at,
          customers (
            customer_code,
            company_name,
            contact_name
          )
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("delivery_jobs")
        .select(`
          id,
          status,
          delivered_at,
          closed_at,
          receiver_name,
          note,
          created_at,
          installation_jobs (
            id,
            qc_jobs (
              id,
              production_jobs (
                id,
                quotation_id,
                quotations (
                  id,
                  quotation_no,
                  project_name,
                  grand_total,
                  customers (
                    customer_code,
                    company_name,
                    contact_name
                  )
                )
              )
            )
          )
        `)
        .order("created_at", { ascending: false }),
    ]);

    if (customerResult.error) {
      console.error(
        "customers:",
        customerResult.error
      );
    }

    if (quotationResult.error) {
      console.error(
        "quotations:",
        quotationResult.error
      );
    }

    if (invoiceResult.error) {
      console.error(
        "invoices:",
        invoiceResult.error
      );
    }

    if (receiptResult.error) {
      console.error(
        "receipts:",
        receiptResult.error
      );
    }

    if (deliveryResult.error) {
      console.error(
        "delivery_jobs:",
        deliveryResult.error
      );
    }

    setCustomers(
      customerResult.data || []
    );

    setQuotations(
      quotationResult.data || []
    );

    setInvoices(
      invoiceResult.data || []
    );

    setReceipts(
      receiptResult.data || []
    );

    setDeliveryJobs(
      deliveryResult.data || []
    );

    setLoading(false);
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

  function customerName(customer) {
    return (
      customer?.company_name ||
      customer?.contact_name ||
      customer?.customer_code ||
      "-"
    );
  }

  function isInDateRange(value) {
    if (!dateFrom && !dateTo) {
      return true;
    }

    if (!value) {
      return false;
    }

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return false;
    }

    if (dateFrom) {
      const from = new Date(
        `${dateFrom}T00:00:00`
      );

      if (date < from) {
        return false;
      }
    }

    if (dateTo) {
      const to = new Date(
        `${dateTo}T23:59:59.999`
      );

      if (date > to) {
        return false;
      }
    }

    return true;
  }

  const keyword = search.trim().toLowerCase();

  function matchesSearch(values = []) {
    if (!keyword) return true;

    return values.some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(keyword)
    );
  }

  const filteredQuotations = useMemo(() => {
    return quotations.filter((item) => {
      const dateOk = isInDateRange(item.created_at);

      const searchOk = matchesSearch([
        item.quotation_no,
        item.project_name,
        item.status,
        customerName(item.customers),
        item.customers?.customer_code,
        item.customers?.company_name,
        item.customers?.contact_name,
      ]);

      return dateOk && searchOk;
    });
  }, [
    quotations,
    dateFrom,
    dateTo,
    search,
  ]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((item) => {
      const dateOk = isInDateRange(item.created_at);

      const searchOk = matchesSearch([
        item.invoice_no,
        item.project_name,
        item.status,
        customerName(item.customers),
        item.customers?.customer_code,
        item.customers?.company_name,
        item.customers?.contact_name,
      ]);

      return dateOk && searchOk;
    });
  }, [
    invoices,
    dateFrom,
    dateTo,
    search,
  ]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((item) => {
      const dateOk = isInDateRange(item.created_at);

      const searchOk = matchesSearch([
        item.receipt_no,
        item.project_name,
        item.status,
        customerName(item.customers),
        item.customers?.customer_code,
        item.customers?.company_name,
        item.customers?.contact_name,
      ]);

      return dateOk && searchOk;
    });
  }, [
    receipts,
    dateFrom,
    dateTo,
    search,
  ]);

  const filteredDeliveryJobs = useMemo(() => {
    return deliveryJobs.filter((item) => {
      const compareDate =
        item?.closed_at ||
        item?.delivered_at ||
        item?.created_at;

      const quotation =
        item?.installation_jobs
          ?.qc_jobs
          ?.production_jobs
          ?.quotations;

      const dateOk = isInDateRange(compareDate);

      const searchOk = matchesSearch([
        quotation?.quotation_no,
        quotation?.project_name,
        quotation?.grand_total,
        quotation?.customers?.customer_code,
        quotation?.customers?.company_name,
        quotation?.customers?.contact_name,
        customerName(quotation?.customers),
        item?.status,
        item?.receiver_name,
        item?.note,
      ]);

      return dateOk && searchOk;
    });
  }, [
    deliveryJobs,
    dateFrom,
    dateTo,
    search,
  ]);

  const totalQuotationValue = useMemo(() => {
    return filteredQuotations.reduce(
      (sum, item) =>
        sum + Number(item?.grand_total || 0),
      0
    );
  }, [filteredQuotations]);

  const totalInvoiceValue = useMemo(() => {
    return filteredInvoices.reduce(
      (sum, item) =>
        sum + Number(item?.grand_total || 0),
      0
    );
  }, [filteredInvoices]);

  const totalReceived = useMemo(() => {
    return filteredReceipts
      .filter((item) => item?.status === "received")
      .reduce(
        (sum, item) =>
          sum + Number(item?.grand_total || 0),
        0
      );
  }, [filteredReceipts]);

  const totalOutstanding = useMemo(() => {
    return filteredInvoices
      .filter((item) => item?.status === "pending")
      .reduce(
        (sum, item) =>
          sum + Number(item?.grand_total || 0),
        0
      );
  }, [filteredInvoices]);

  const paidInvoiceCount = useMemo(() => {
    return filteredInvoices.filter(
      (item) => item?.status === "paid"
    ).length;
  }, [filteredInvoices]);

  const pendingInvoiceCount = useMemo(() => {
    return filteredInvoices.filter(
      (item) => item?.status === "pending"
    ).length;
  }, [filteredInvoices]);

  const approvedQuotations = useMemo(() => {
    return filteredQuotations.filter(
      (item) => item?.status === "approved"
    ).length;
  }, [filteredQuotations]);

  const deliveredJobs = useMemo(() => {
    return filteredDeliveryJobs.filter((item) =>
      ["delivered", "closed"].includes(item?.status)
    );
  }, [filteredDeliveryJobs]);

  const closedJobs = useMemo(() => {
    return filteredDeliveryJobs.filter(
      (item) => item?.status === "closed"
    );
  }, [filteredDeliveryJobs]);

  const waitingDeliveryJobs = useMemo(() => {
    return filteredDeliveryJobs.filter(
      (item) => item?.status === "waiting"
    );
  }, [filteredDeliveryJobs]);

  const closedJobValue = useMemo(() => {
    return closedJobs.reduce((sum, item) => {
      const quotation =
        item?.installation_jobs
          ?.qc_jobs
          ?.production_jobs
          ?.quotations;

      return (
        sum +
        Number(quotation?.grand_total || 0)
      );
    }, 0);
  }, [closedJobs]);
  const recentRows =
    useMemo(() => {
      const rows = [];

      filteredReceipts.forEach(
        (item) => {
          rows.push({
            type: "ใบเสร็จ",
            no: item.receipt_no,
            project:
              item.project_name,
            customer:
              customerName(
                item.customers
              ),
            total: Number(
              item.grand_total || 0
            ),
            status: item.status,
            date: item.created_at,
            href: `/receipts/${item.id}`,
          });
        }
      );

      filteredInvoices.forEach(
        (item) => {
          rows.push({
            type: "ใบแจ้งหนี้",
            no: item.invoice_no,
            project:
              item.project_name,
            customer:
              customerName(
                item.customers
              ),
            total: Number(
              item.grand_total || 0
            ),
            status: item.status,
            date: item.created_at,
            href: `/invoices/${item.id}`,
          });
        }
      );

      filteredQuotations.forEach(
        (item) => {
          rows.push({
            type: "ใบเสนอราคา",
            no: item.quotation_no,
            project:
              item.project_name,
            customer:
              customerName(
                item.customers
              ),
            total: Number(
              item.grand_total || 0
            ),
            status: item.status,
            date: item.created_at,
            href: `/quotations/${item.id}`,
          });
        }
      );

      filteredDeliveryJobs.forEach(
        (item) => {
          const quotation =
            item?.installation_jobs
              ?.qc_jobs
              ?.production_jobs
              ?.quotations;

          if (!quotation) {
            return;
          }

          rows.push({
            type:
              "ส่งมอบ / ปิดงาน",
            no:
              quotation.quotation_no,
            project:
              quotation.project_name,
            customer:
              customerName(
                quotation.customers
              ),
            total: Number(
              quotation.grand_total ||
                0
            ),
            status: item.status,
            date:
              item.closed_at ||
              item.delivered_at ||
              item.created_at,
            href: "/delivery",
          });
        }
      );

      const keyword =
        search
          .trim()
          .toLowerCase();

      let result = rows;

      if (keyword) {
        result = rows.filter(
          (item) => {
            return (
              item.type
                ?.toLowerCase()
                .includes(keyword) ||
              item.no
                ?.toLowerCase()
                .includes(keyword) ||
              item.project
                ?.toLowerCase()
                .includes(keyword) ||
              item.customer
                ?.toLowerCase()
                .includes(keyword) ||
              statusLabel(
                item.status
              )
                .toLowerCase()
                .includes(keyword)
            );
          }
        );
      }

      return result.sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      );
    }, [
      filteredQuotations,
      filteredInvoices,
      filteredReceipts,
      filteredDeliveryJobs,
      search,
    ]);

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  function printReport() {
    window.print();
  }

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
          maxWidth: "1500px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}
        <div style={topBar}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "32px",
              }}
            >
              รายงาน
            </h1>

            <p
              style={{
                color: "#6b7280",
                marginTop: "6px",
              }}
            >
              สรุปยอดขาย ลูกหนี้
              เอกสาร และสถานะงาน
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
              onClick={printReport}
              style={primaryButton}
            >
              พิมพ์รายงาน
            </button>

            <button
              onClick={() =>
                router.push(
                  "/finance"
                )
              }
              style={secondaryButton}
            >
              การเงิน
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

        {/* FILTER */}
        <section style={filterBox}>
          <div>
            <label style={labelStyle}>
              ตั้งแต่วันที่
            </label>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) =>
                setDateFrom(
                  e.target.value
                )
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              ถึงวันที่
            </label>

            <input
              type="date"
              value={dateTo}
              onChange={(e) =>
                setDateTo(
                  e.target.value
                )
              }
              style={inputStyle}
            />
          </div>

          <div
            style={{
              flex: "1 1 320px",
            }}
          >
            <label style={labelStyle}>
              ค้นหา
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="เลขที่เอกสาร / ลูกค้า / ชื่องาน / สถานะ"
              style={{
                ...inputStyle,
                width: "100%",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <button
              onClick={clearFilters}
              style={
                secondaryButton
              }
            >
              ล้างตัวกรอง
            </button>
          </div>
        </section>

        {/* SUMMARY หลัก */}
        <div style={summaryGrid}>
          <ReportCard
            title="ยอดรับชำระแล้ว"
            value={
              loading
                ? "..."
                : `฿${money(
                    totalReceived
                  )}`
            }
            sub={`${filteredReceipts.length} ใบเสร็จ`}
            color="#15803d"
          />

          <ReportCard
            title="ลูกหนี้คงค้าง"
            value={
              loading
                ? "..."
                : `฿${money(
                    totalOutstanding
                  )}`
            }
            sub={`${filteredInvoices.filter((item) => item.status === "pending").length} Invoice รอชำระ`}
            color="#dc2626"
          />

          <ReportCard
            title="ยอด Invoice"
            value={
              loading
                ? "..."
                : `฿${money(
                    totalInvoiceValue
                  )}`
            }
            sub={`${filteredInvoices.length} ใบ`}
            color="#2563eb"
          />

          <ReportCard
            title="ยอดใบเสนอราคา"
            value={
              loading
                ? "..."
                : `฿${money(
                    totalQuotationValue
                  )}`
            }
            sub={`${filteredQuotations.length} ใบ`}
            color="#7c3aed"
          />
        </div>

        {/* สรุปย่อย */}
        <div style={smallCardGrid}>
          <SmallCard
            title="ลูกค้าทั้งหมด"
            value={`${customers.length} ราย`}
          />

          <SmallCard
            title="ใบเสนอราคาอนุมัติ"
            value={`${filteredQuotations.filter((item) => item.status === "approved").length} ใบ`}
          />

          <SmallCard
            title="Invoice ชำระแล้ว"
            value={`${filteredInvoices.filter((item) => item.status === "paid").length} ใบ`}
          />

          <SmallCard
            title="Invoice รอชำระ"
            value={`${filteredInvoices.filter((item) => item.status === "pending").length} ใบ`}
          />

          <SmallCard
            title="ส่งมอบแล้ว"
            value={`${deliveredJobs.length} งาน`}
          />

          <SmallCard
            title="ปิดงานแล้ว"
            value={`${closedJobs.length} งาน`}
          />
        </div>

        {/* สถานะส่งมอบ */}
        <section
          style={{
            ...boxStyle,
            marginBottom: "20px",
          }}
        >
          <div style={sectionHeader}>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
              }}
            >
              สรุปสถานะงาน
            </h2>
          </div>

          <div
            style={{
              padding: "20px",
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <SummaryLine
              title="รอส่งมอบ"
              value={`${waitingDeliveryJobs.length} งาน`}
            />

            <SummaryLine
              title="ส่งมอบแล้ว"
              value={`${deliveredJobs.length} งาน`}
            />

            <SummaryLine
              title="ปิดงานสมบูรณ์"
              value={`${closedJobs.length} งาน`}
            />

            <SummaryLine
              title="มูลค่างานที่ปิดแล้ว"
              value={`฿${money(
                closedJobValue
              )}`}
            />
          </div>
        </section>

        {/* สรุปเอกสาร */}
        <section
          style={{
            ...boxStyle,
            marginBottom: "20px",
          }}
        >
          <div style={sectionHeader}>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
              }}
            >
              สรุปธุรกิจ
            </h2>
          </div>

          <div
            style={{
              padding: "20px",
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <SummaryLine
              title="จำนวนใบเสนอราคา"
              value={`${filteredQuotations.length} ใบ`}
            />

            <SummaryLine
              title="จำนวนใบแจ้งหนี้"
              value={`${filteredInvoices.length} ใบ`}
            />

            <SummaryLine
              title="จำนวนใบเสร็จ"
              value={`${filteredReceipts.length} ใบ`}
            />

            <SummaryLine
              title="งานปิดสมบูรณ์"
              value={`${closedJobs.length} งาน`}
            />
          </div>
        </section>

        {/* TABLE */}
        <section style={boxStyle}>
          <div style={sectionHeader}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                }}
              >
                รายการทั้งหมด
              </h2>

              <div
                style={{
                  color: "#6b7280",
                  fontSize: "12px",
                  marginTop: "4px",
                }}
              >
                เรียงจากรายการล่าสุด
              </div>
            </div>

            <strong>
              {recentRows.length} รายการ
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
                minWidth: "1050px",
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
                    วันที่
                  </th>

                  <th style={th}>
                    ประเภท
                  </th>

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
                    มูลค่า
                  </th>

                  <th
                    style={{
                      ...th,
                      textAlign:
                        "center",
                    }}
                  >
                    สถานะ
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={empty}
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : recentRows.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={empty}
                    >
                      ไม่พบข้อมูลตามเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  recentRows.map(
                    (
                      item,
                      index
                    ) => (
                      <tr
                        key={`${item.type}-${item.no}-${index}`}
                        onClick={() =>
                          router.push(
                            item.href
                          )
                        }
                        style={{
                          borderTop:
                            "1px solid #e5e7eb",
                          cursor:
                            "pointer",
                        }}
                      >
                        <td style={td}>
                          {formatThaiDate(
                            item.date
                          )}
                        </td>

                        <td style={td}>
                          {item.type}
                        </td>

                        <td
                          style={{
                            ...td,
                            fontWeight:
                              "700",
                          }}
                        >
                          {item.no ||
                            "-"}
                        </td>

                        <td style={td}>
                          {
                            item.customer
                          }
                        </td>

                        <td style={td}>
                          {item.project ||
                            "-"}
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
                            item.total
                          )}
                        </td>

                        <td
                          style={{
                            ...td,
                            textAlign:
                              "center",
                          }}
                        >
                          <StatusBadge
                            value={
                              item.status
                            }
                          />
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReportCard({
  title,
  value,
  sub,
  color,
}) {
  return (
    <div style={reportCard}>
      <div
        style={{
          color: "#6b7280",
          fontSize: "13px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "28px",
          fontWeight: "800",
          color,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "6px",
          color: "#9ca3af",
          fontSize: "12px",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function SmallCard({
  title,
  value,
}) {
  return (
    <div style={smallCard}>
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
          marginTop: "7px",
          fontSize: "22px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryLine({
  title,
  value,
}) {
  return (
    <div
      style={{
        padding: "16px",
        background: "#f9fafb",
        borderRadius: "10px",
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
          marginTop: "6px",
          fontWeight: "800",
          fontSize: "20px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  value,
}) {
  const info =
    statusInfo(value);

  return (
    <span
      style={{
        display:
          "inline-block",
        padding: "5px 9px",
        borderRadius:
          "999px",
        background:
          info.bg,
        color: info.color,
        fontWeight: "700",
        fontSize: "12px",
      }}
    >
      {info.label}
    </span>
  );
}

function statusLabel(value) {
  return statusInfo(value)
    .label;
}

function statusInfo(value) {
  if (value === "received") {
    return {
      label: "รับชำระแล้ว",
      bg: "#dcfce7",
      color: "#15803d",
    };
  }

  if (value === "paid") {
    return {
      label: "ชำระแล้ว",
      bg: "#dcfce7",
      color: "#15803d",
    };
  }

  if (value === "pending") {
    return {
      label: "รอชำระ",
      bg: "#fef3c7",
      color: "#b45309",
    };
  }

  if (value === "approved") {
    return {
      label: "อนุมัติ",
      bg: "#dcfce7",
      color: "#15803d",
    };
  }

  if (value === "sent") {
    return {
      label: "ส่งแล้ว",
      bg: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  if (value === "draft") {
    return {
      label: "แบบร่าง",
      bg: "#f3f4f6",
      color: "#374151",
    };
  }

  if (value === "rejected") {
    return {
      label: "ปฏิเสธ",
      bg: "#fee2e2",
      color: "#b91c1c",
    };
  }

  if (
    value === "cancelled"
  ) {
    return {
      label: "ยกเลิก",
      bg: "#fee2e2",
      color: "#b91c1c",
    };
  }

  if (value === "waiting") {
    return {
      label: "รอส่งมอบ",
      bg: "#fef3c7",
      color: "#b45309",
    };
  }

  if (
    value === "delivered"
  ) {
    return {
      label: "ส่งมอบแล้ว",
      bg: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  if (value === "closed") {
    return {
      label: "ปิดงานแล้ว",
      bg: "#dcfce7",
      color: "#15803d",
    };
  }

  return {
    label: value || "-",
    bg: "#f3f4f6",
    color: "#374151",
  };
}

function formatThaiDate(
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

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

const topBar = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "20px",
};

const filterBox = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "flex-end",
  background: "white",
  padding: "16px",
  borderRadius: "12px",
  marginBottom: "20px",
  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "6px",
};

const inputStyle = {
  padding: "10px 12px",
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
  boxSizing: "border-box",
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(4, minmax(0, 1fr))",
  gap: "16px",
  marginBottom: "16px",
};

const smallCardGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(6, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "20px",
};

const reportCard = {
  background: "white",
  padding: "20px",
  borderRadius: "12px",
  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};

const smallCard = {
  background: "white",
  padding: "16px",
  borderRadius: "12px",
  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};

const boxStyle = {
  background: "white",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};

const sectionHeader = {
  padding: "18px 20px",
  borderBottom:
    "1px solid #e5e7eb",
  display: "flex",
  justifyContent:
    "space-between",
  alignItems: "center",
  gap: "12px",
};

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
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: "600",
};

const th = {
  padding: "13px 14px",
  textAlign: "left",
  fontSize: "13px",
  color: "#374151",
};

const td = {
  padding: "13px 14px",
  color: "#111827",
  fontSize: "13px",
};

const empty = {
  padding: "40px",
  textAlign: "center",
  color: "#6b7280",
};