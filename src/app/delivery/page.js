"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "../lib/supabase";


export default function DeliveryPage() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [jobs, setJobs] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [savingId, setSavingId] =
    useState(null);


  useEffect(() => {
    loadDelivery();
  }, []);


  /* ============================================================
     MONEY
  ============================================================ */

  function money(value) {
    return new Intl.NumberFormat(
      "th-TH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(
      Number(value || 0)
    );
  }


  /* ============================================================
     QUOTATION
  ============================================================ */

  function quotationOf(job) {
    return (
      job
        ?.qc_jobs
        ?.production_jobs
        ?.quotations ||
      null
    );
  }


  /* ============================================================
     CUSTOMER
  ============================================================ */

  function customerName(job) {
    const customer =
      quotationOf(job)
        ?.customers;

    return (
      customer?.company_name ||
      customer?.contact_name ||
      customer?.customer_code ||
      "-"
    );
  }


  /* ============================================================
     CREATE INVOICE NUMBER
  ============================================================ */

  function createInvoiceNo() {
    const now =
      new Date();

    const year =
      now.getFullYear();

    const random =
      Math.floor(
        100000 +
          Math.random() *
            900000
      );

    return `INV-${year}-${random}`;
  }


  /* ============================================================
     YYYY-MM-DD LOCAL
  ============================================================ */

  function localDateString(date) {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }


  /* ============================================================
     ENSURE INVOICE
     - quotation 1 ใบ = invoice ไม่เกิน 1 ใบ
     - ถ้ามีแล้วคืนของเดิม
     - ถ้ายังไม่มีสร้าง pending
  ============================================================ */

  async function ensureInvoice(
    quotationId
  ) {
    if (!quotationId) {
      throw new Error(
        "ไม่พบ quotation_id"
      );
    }


    /* ----------------------------------------------------------
       1. ตรวจ Invoice เดิม
    ---------------------------------------------------------- */

    const {
      data: existingInvoice,
      error: existingError,
    } =
      await supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          quotation_id,
          customer_id,
          project_name,
          subtotal,
          discount,
          vat_percent,
          vat_amount,
          grand_total,
          status,
          invoice_date,
          due_date
        `)
        .eq(
          "quotation_id",
          quotationId
        )
        .maybeSingle();


    if (existingError) {
      throw existingError;
    }


    if (existingInvoice) {
      return existingInvoice;
    }


    /* ----------------------------------------------------------
       2. โหลด Quotation ต้นฉบับ
    ---------------------------------------------------------- */

    const {
      data: quotation,
      error: quotationError,
    } =
      await supabase
        .from("quotations")
        .select(`
          id,
          quotation_no,
          customer_id,
          project_name,
          subtotal,
          discount,
          vat_percent,
          vat_amount,
          grand_total
        `)
        .eq(
          "id",
          quotationId
        )
        .single();


    if (quotationError) {
      throw quotationError;
    }


    if (!quotation) {
      throw new Error(
        "ไม่พบใบเสนอราคา"
      );
    }


    /* ----------------------------------------------------------
       3. วันที่ Invoice / Due date
    ---------------------------------------------------------- */

    const now =
      new Date();

    const dueDateObject =
      new Date(now);

    dueDateObject.setDate(
      dueDateObject.getDate() +
        30
    );


    const invoiceDate =
      localDateString(now);

    const dueDate =
      localDateString(
        dueDateObject
      );


    /* ----------------------------------------------------------
       4. ตัวเลข
    ---------------------------------------------------------- */

    const subtotal =
      Number(
        quotation.subtotal ??
          quotation.grand_total ??
          0
      );

    const discount =
      Number(
        quotation.discount ??
          0
      );

    const vatPercent =
      Number(
        quotation.vat_percent ??
          0
      );

    const vatAmount =
      Number(
        quotation.vat_amount ??
          0
      );

    const grandTotal =
      Number(
        quotation.grand_total ??
          0
      );


    /* ----------------------------------------------------------
       5. สร้าง Invoice
    ---------------------------------------------------------- */

    const invoiceNo =
      createInvoiceNo();


    const {
      data: invoice,
      error: invoiceError,
    } =
      await supabase
        .from("invoices")
        .insert({
          invoice_no:
            invoiceNo,

          quotation_id:
            quotation.id,

          customer_id:
            quotation.customer_id,

          project_name:
            quotation.project_name,

          invoice_date:
            invoiceDate,

          due_date:
            dueDate,

          subtotal:
            subtotal,

          discount:
            discount,

          vat_percent:
            vatPercent,

          vat_amount:
            vatAmount,

          grand_total:
            grandTotal,

          note:
            `สร้างอัตโนมัติจากการปิดงาน ${quotation.quotation_no}`,

          status:
            "pending",
        })
        .select()
        .single();


    if (invoiceError) {
      /*
       * เผื่อมีหน้าอื่นสร้าง Invoice พร้อมกัน
       * ให้ลองหา quotation_id อีกครั้ง
       */

      const {
        data: retryInvoice,
        error: retryError,
      } =
        await supabase
          .from("invoices")
          .select("*")
          .eq(
            "quotation_id",
            quotation.id
          )
          .maybeSingle();


      if (
        !retryError &&
        retryInvoice
      ) {
        return retryInvoice;
      }


      throw invoiceError;
    }


    return invoice;
  }


  /* ============================================================
     LOAD DELIVERY
  ============================================================ */

  async function loadDelivery() {
    setLoading(true);

    try {
      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();


      if (!session) {
        router.push("/login");
        return;
      }


      /* ----------------------------------------------------------
         1. โหลดงานติดตั้งที่เสร็จแล้ว
      ---------------------------------------------------------- */

      const {
        data: installationData,
        error: installationError,
      } =
        await supabase
          .from(
            "installation_jobs"
          )
          .select(`
            id,
            qc_job_id,
            status,
            scheduled_at,
            started_at,
            completed_at,

            qc_jobs (
              id,
              status,

              production_jobs (
                id,
                quotation_id,

                quotations (
                  id,
                  quotation_no,
                  customer_id,
                  project_name,
                  subtotal,
                  discount,
                  vat_percent,
                  vat_amount,
                  grand_total,

                  customers (
                    customer_code,
                    company_name,
                    contact_name,
                    phone
                  )
                )
              )
            )
          `)
          .eq(
            "status",
            "completed"
          )
          .order(
            "completed_at",
            {
              ascending: false,
            }
          );


      if (installationError) {
        throw installationError;
      }


      const completedInstallations =
        installationData || [];


      /* ----------------------------------------------------------
         2. สร้าง Delivery Job ถ้ายังไม่มี
         ไม่ใช้ upsert เพื่อไม่ผูกกับ unique constraint
      ---------------------------------------------------------- */

      for (
        const installation
        of completedInstallations
      ) {
        const {
          data: existingDelivery,
          error: checkError,
        } =
          await supabase
            .from(
              "delivery_jobs"
            )
            .select("id")
            .eq(
              "installation_job_id",
              installation.id
            )
            .maybeSingle();


        if (checkError) {
          console.error(
            "check delivery:",
            checkError
          );

          continue;
        }


        if (!existingDelivery) {
          const now =
            new Date()
              .toISOString();


          const {
            error: createError,
          } =
            await supabase
              .from(
                "delivery_jobs"
              )
              .insert({
                installation_job_id:
                  installation.id,

                status:
                  "waiting",

                created_at:
                  now,

                updated_at:
                  now,
              });


          if (createError) {
            console.error(
              "create delivery:",
              createError
            );
          }
        }
      }


      /* ----------------------------------------------------------
         3. โหลด Delivery Jobs
      ---------------------------------------------------------- */

      const installationIds =
        completedInstallations.map(
          (item) =>
            item.id
        );


      let deliveryRows =
        [];


      if (
        installationIds.length >
        0
      ) {
        const {
          data: deliveryData,
          error: deliveryError,
        } =
          await supabase
            .from(
              "delivery_jobs"
            )
            .select("*")
            .in(
              "installation_job_id",
              installationIds
            );


        if (deliveryError) {
          throw deliveryError;
        }


        deliveryRows =
          deliveryData || [];
      }


      /* ----------------------------------------------------------
         4. Merge
      ---------------------------------------------------------- */

      const merged =
        completedInstallations.map(
          (installation) => ({
            ...installation,

            delivery:
              deliveryRows.find(
                (delivery) =>
                  delivery.installation_job_id ===
                  installation.id
              ) ||
              null,
          })
        );


      /* ----------------------------------------------------------
         5. BACKFILL INVOICE
         งานที่เคยปิดไปแล้วก่อนแก้โค้ด
         จะถูกสร้าง Invoice ให้ตอนเปิดหน้านี้
      ---------------------------------------------------------- */

      for (
        const job of merged
      ) {
        if (
          job.delivery?.status !==
          "closed"
        ) {
          continue;
        }


        const quotation =
          quotationOf(job);


        if (!quotation?.id) {
          continue;
        }


        try {
          await ensureInvoice(
            quotation.id
          );
        } catch (error) {
          console.error(
            "backfill invoice:",
            quotation.quotation_no,
            error
          );
        }
      }


      setJobs(merged);

    } catch (error) {
      console.error(
        "loadDelivery:",
        error
      );


      alert(
        "โหลดงานส่งมอบไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );

    } finally {
      setLoading(false);
    }
  }


  /* ============================================================
     STATUS
  ============================================================ */

  function statusInfo(status) {
    if (
      status ===
      "delivered"
    ) {
      return {
        label:
          "ส่งมอบแล้ว",

        bg:
          "#dbeafe",

        color:
          "#1d4ed8",
      };
    }


    if (
      status ===
      "closed"
    ) {
      return {
        label:
          "ปิดงานแล้ว",

        bg:
          "#dcfce7",

        color:
          "#15803d",
      };
    }


    return {
      label:
        "รอส่งมอบ",

      bg:
        "#fef3c7",

      color:
        "#b45309",
    };
  }


  /* ============================================================
     MARK DELIVERED
  ============================================================ */

  async function markDelivered(
    job
  ) {
    if (
      !job?.delivery ||
      savingId
    ) {
      return;
    }


    const receiver =
      window.prompt(
        "ชื่อผู้รับงาน / ลูกค้า",
        customerName(job)
      );


    if (
      receiver === null
    ) {
      return;
    }


    const receiverName =
      receiver.trim();


    if (!receiverName) {
      alert(
        "กรุณาระบุชื่อผู้รับงาน"
      );

      return;
    }


    const confirmed =
      window.confirm(
        "ยืนยันการส่งมอบงานแล้ว?"
      );


    if (!confirmed) {
      return;
    }


    setSavingId(
      job.delivery.id
    );


    try {
      const now =
        new Date()
          .toISOString();


      const {
        error,
      } =
        await supabase
          .from(
            "delivery_jobs"
          )
          .update({
            status:
              "delivered",

            receiver_name:
              receiverName,

            delivered_at:
              now,

            updated_at:
              now,
          })
          .eq(
            "id",
            job.delivery.id
          );


      if (error) {
        throw error;
      }


      await loadDelivery();

    } catch (error) {
      console.error(
        "markDelivered:",
        error
      );


      alert(
        "บันทึกการส่งมอบไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );

    } finally {
      setSavingId(null);
    }
  }


  /* ============================================================
     CLOSE JOB
     ปิดงาน + สร้าง Invoice
  ============================================================ */

  async function closeJob(
    job
  ) {
    if (
      !job?.delivery ||
      savingId
    ) {
      return;
    }


    const quotation =
      quotationOf(job);


    if (!quotation?.id) {
      alert(
        "ไม่พบข้อมูลใบเสนอราคา"
      );

      return;
    }


    const note =
      window.prompt(
        "หมายเหตุปิดงาน (ถ้าไม่มี กดตกลงได้เลย)",
        ""
      );


    if (
      note === null
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        "ยืนยันปิดงานนี้?\nระบบจะสร้าง Invoice และส่งเข้าการเงินอัตโนมัติ"
      );


    if (!confirmed) {
      return;
    }


    setSavingId(
      job.delivery.id
    );


    try {
      /* ----------------------------------------------------------
         1. สร้าง Invoice ก่อน
         ถ้าสร้างไม่ได้ จะยังไม่ปิดงาน
      ---------------------------------------------------------- */

      const invoice =
        await ensureInvoice(
          quotation.id
        );


      /* ----------------------------------------------------------
         2. ปิดงาน
      ---------------------------------------------------------- */

      const now =
        new Date()
          .toISOString();


      const {
        error:
          closeError,
      } =
        await supabase
          .from(
            "delivery_jobs"
          )
          .update({
            status:
              "closed",

            note:
              note.trim() ||
              null,

            closed_at:
              now,

            updated_at:
              now,
          })
          .eq(
            "id",
            job.delivery.id
          );


      if (closeError) {
        throw closeError;
      }


      alert(
        "ปิดงานเรียบร้อย\n\n" +
          "Invoice: " +
          invoice.invoice_no +
          "\n" +
          "ยอด: ฿" +
          money(
            invoice.grand_total
          ) +
          "\n" +
          "สถานะ: รอชำระ"
      );


      await loadDelivery();

    } catch (error) {
      console.error(
        "closeJob:",
        error
      );


      alert(
        "ปิดงาน / สร้าง Invoice ไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );

    } finally {
      setSavingId(null);
    }
  }


  /* ============================================================
     FILTER
  ============================================================ */

  const rows =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();


      if (!keyword) {
        return jobs;
      }


      return jobs.filter(
        (job) => {
          const quotation =
            quotationOf(job);


          const status =
            statusInfo(
              job.delivery?.status
            ).label;


          return (
            quotation
              ?.quotation_no
              ?.toLowerCase()
              .includes(
                keyword
              ) ||

            quotation
              ?.project_name
              ?.toLowerCase()
              .includes(
                keyword
              ) ||

            customerName(job)
              .toLowerCase()
              .includes(
                keyword
              ) ||

            status
              .toLowerCase()
              .includes(
                keyword
              )
          );
        }
      );

    }, [
      jobs,
      search,
    ]);


  /* ============================================================
     SUMMARY
  ============================================================ */

  const waitingCount =
    jobs.filter(
      (job) =>
        job.delivery?.status ===
        "waiting"
    ).length;


  const deliveredCount =
    jobs.filter(
      (job) =>
        job.delivery?.status ===
        "delivered"
    ).length;


  const closedCount =
    jobs.filter(
      (job) =>
        job.delivery?.status ===
        "closed"
    ).length;


  const totalValue =
    jobs.reduce(
      (
        sum,
        job
      ) => {
        return (
          sum +
          Number(
            quotationOf(job)
              ?.grand_total ||
              0
          )
        );
      },

      0
    );


  /* ============================================================
     UI
  ============================================================ */

  return (
    <main
      style={{
        minHeight:
          "100vh",

        background:
          "#f3f4f6",

        padding:
          "32px",

        color:
          "#111827",
      }}
    >
      <div
        style={{
          maxWidth:
            "1400px",

          margin:
            "0 auto",
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
              ส่งมอบ / ปิดงาน
            </h1>

            <p
              style={{
                color:
                  "#6b7280",

                marginTop:
                  "6px",
              }}
            >
              ส่งมอบงานหลังติดตั้งเสร็จ และปิดงานให้สมบูรณ์
            </p>
          </div>


          <div
            style={{
              display:
                "flex",

              gap:
                "10px",

              flexWrap:
                "wrap",
            }}
          >
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/installation"
                )
              }
              style={
                secondaryButton
              }
            >
              งานติดตั้ง
            </button>


            <button
              type="button"
              onClick={() =>
                router.push(
                  "/finance"
                )
              }
              style={
                secondaryButton
              }
            >
              การเงิน
            </button>


            <button
              type="button"
              onClick={() =>
                router.push("/")
              }
              style={
                secondaryButton
              }
            >
              ← Dashboard
            </button>
          </div>
        </div>


        {/* SUMMARY */}

        <div
          style={
            summaryGrid
          }
        >
          <Card
            title="รอส่งมอบ"
            value={
              loading
                ? "..."
                : `${waitingCount} งาน`
            }
          />

          <Card
            title="ส่งมอบแล้ว"
            value={
              loading
                ? "..."
                : `${deliveredCount} งาน`
            }
          />

          <Card
            title="ปิดงานแล้ว"
            value={
              loading
                ? "..."
                : `${closedCount} งาน`
            }
          />

          <Card
            title="งานทั้งหมด"
            value={
              loading
                ? "..."
                : `${jobs.length} งาน`
            }
          />

          <Card
            title="มูลค่างาน"
            value={
              loading
                ? "..."
                : `฿${money(
                    totalValue
                  )}`
            }
          />
        </div>


        {/* SEARCH */}

        <div
          style={
            searchBox
          }
        >
          <input
            value={search}

            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }

            placeholder="ค้นหาเลขที่ใบเสนอราคา / ลูกค้า / ชื่องาน / สถานะ"

            style={
              inputStyle
            }
          />
        </div>


        {/* TABLE */}

        <section
          style={
            boxStyle
          }
        >
          <div
            style={
              sectionHeader
            }
          >
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
              }}
            >
              รายการส่งมอบงาน
            </h2>


            <strong>
              มูลค่ารวม ฿
              {money(
                totalValue
              )}
            </strong>
          </div>


          <div
            style={{
              overflowX:
                "auto",
            }}
          >
            <table
              style={{
                width:
                  "100%",

                borderCollapse:
                  "collapse",

                minWidth:
                  "1100px",
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
                    สถานะ
                  </th>

                  <th
                    style={{
                      ...th,
                      textAlign:
                        "center",
                    }}
                  >
                    ผู้รับงาน
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
                      colSpan={7}
                      style={empty}
                    >
                      กำลังโหลด...
                    </td>
                  </tr>

                ) : rows.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={empty}
                    >
                      ยังไม่มีงานติดตั้งเสร็จ
                    </td>
                  </tr>

                ) : (
                  rows.map(
                    (job) => {
                      const quotation =
                        quotationOf(
                          job
                        );


                      const status =
                        statusInfo(
                          job
                            .delivery
                            ?.status
                        );


                      return (
                        <tr
                          key={
                            job.id
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
                              {quotation
                                ?.quotation_no ||
                                "-"}
                            </strong>
                          </td>


                          <td
                            style={td}
                          >
                            {customerName(
                              job
                            )}
                          </td>


                          <td
                            style={td}
                          >
                            {quotation
                              ?.project_name ||
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
                                quotation
                                  ?.grand_total
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
                                  "6px 10px",

                                borderRadius:
                                  "999px",

                                background:
                                  status.bg,

                                color:
                                  status.color,

                                fontWeight:
                                  "700",
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
                            {job
                              .delivery
                              ?.receiver_name ||
                              "-"}
                          </td>


                          <td
                            style={{
                              ...td,

                              textAlign:
                                "center",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",

                                justifyContent:
                                  "center",

                                gap:
                                  "8px",

                                flexWrap:
                                  "wrap",
                              }}
                            >

                              {/* WAITING */}

                              {job
                                .delivery
                                ?.status ===
                                "waiting" && (
                                <button
                                  type="button"

                                  disabled={
                                    savingId ===
                                    job
                                      .delivery
                                      .id
                                  }

                                  onClick={() =>
                                    markDelivered(
                                      job
                                    )
                                  }

                                  style={
                                    primaryButton
                                  }
                                >
                                  ส่งมอบงาน
                                </button>
                              )}


                              {/* DELIVERED */}

                              {job
                                .delivery
                                ?.status ===
                                "delivered" && (
                                <button
                                  type="button"

                                  disabled={
                                    savingId ===
                                    job
                                      .delivery
                                      .id
                                  }

                                  onClick={() =>
                                    closeJob(
                                      job
                                    )
                                  }

                                  style={
                                    finishButton
                                  }
                                >
                                  ปิดงาน + สร้าง Invoice
                                </button>
                              )}


                              {/* CLOSED */}

                              {job
                                .delivery
                                ?.status ===
                                "closed" && (
                                <>
                                  <span
                                    style={{
                                      color:
                                        "#15803d",

                                      fontWeight:
                                        "700",

                                      padding:
                                        "8px",
                                    }}
                                  >
                                    ✓ เสร็จสมบูรณ์
                                  </span>


                                  <button
                                    type="button"

                                    onClick={() =>
                                      router.push(
                                        "/finance"
                                      )
                                    }

                                    style={
                                      financeButton
                                    }
                                  >
                                    ไปการเงิน
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
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


/* ============================================================
   CARD
============================================================ */

function Card({
  title,
  value,
}) {
  return (
    <div
      style={
        cardStyle
      }
    >
      <div
        style={{
          color:
            "#6b7280",

          fontSize:
            "12px",
        }}
      >
        {title}
      </div>


      <div
        style={{
          marginTop:
            "8px",

          fontSize:
            "23px",

          fontWeight:
            "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}


/* ============================================================
   STYLES
============================================================ */

const topBar = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",

  gap:
    "12px",

  flexWrap:
    "wrap",

  marginBottom:
    "24px",
};


const summaryGrid = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(5, minmax(0, 1fr))",

  gap:
    "12px",

  marginBottom:
    "20px",
};


const cardStyle = {
  background:
    "white",

  padding:
    "18px",

  borderRadius:
    "12px",

  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};


const searchBox = {
  background:
    "white",

  padding:
    "14px",

  borderRadius:
    "12px",

  marginBottom:
    "16px",
};


const inputStyle = {
  width:
    "100%",

  padding:
    "12px",

  boxSizing:
    "border-box",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "8px",

  color:
    "#111827",

  background:
    "white",
};


const boxStyle = {
  background:
    "white",

  borderRadius:
    "12px",

  overflow:
    "hidden",

  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
};


const sectionHeader = {
  padding:
    "18px 20px",

  borderBottom:
    "1px solid #e5e7eb",

  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",
};


const primaryButton = {
  padding:
    "8px 13px",

  border:
    "none",

  borderRadius:
    "7px",

  background:
    "#2563eb",

  color:
    "white",

  cursor:
    "pointer",

  fontWeight:
    "700",
};


const finishButton = {
  padding:
    "8px 13px",

  border:
    "none",

  borderRadius:
    "7px",

  background:
    "#16a34a",

  color:
    "white",

  cursor:
    "pointer",

  fontWeight:
    "700",
};


const financeButton = {
  padding:
    "8px 13px",

  border:
    "none",

  borderRadius:
    "7px",

  background:
    "#7c3aed",

  color:
    "white",

  cursor:
    "pointer",

  fontWeight:
    "700",
};


const secondaryButton = {
  padding:
    "9px 14px",

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
};


const th = {
  padding:
    "14px",

  textAlign:
    "left",

  color:
    "#374151",

  fontSize:
    "13px",
};


const td = {
  padding:
    "14px",

  color:
    "#111827",

  fontSize:
    "13px",
};


const empty = {
  padding:
    "40px",

  textAlign:
    "center",

  color:
    "#6b7280",
};
