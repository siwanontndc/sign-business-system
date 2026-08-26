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


export default function InstallationPage() {
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
    loadInstallation();
  }, []);


  /* ==========================================================
     LOAD INSTALLATION
  ========================================================== */

  async function loadInstallation() {
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


      /* ======================================================
         1. โหลด QC ที่ผ่านแล้วทั้งหมด
      ====================================================== */

      const {
        data: qcData,
        error: qcError,
      } =
        await supabase
          .from("qc_jobs")
          .select(`
            id,
            production_job_id,
            status,
            checked_at,
            note,
            created_at,
            updated_at,

            production_jobs (
              id,
              quotation_id,
              status,

              quotations (
                id,
                quotation_no,
                project_name,
                grand_total,

                customers (
                  customer_code,
                  company_name,
                  contact_name,
                  phone
                )
              )
            )
          `)
          .eq(
            "status",
            "passed"
          )
          .order(
            "checked_at",
            {
              ascending: false,
            }
          );


      if (qcError) {
        throw qcError;
      }


      const passedJobs =
        qcData || [];


      /* ======================================================
         2. สร้าง installation job ให้ QC ที่ผ่านแล้ว
            ถ้ามีอยู่แล้วจะไม่สร้างซ้ำ

            สำคัญ:
            installation_jobs ใช้ qc_job_id
      ====================================================== */

      for (
        const qcJob of passedJobs
      ) {
        const {
          data: existing,
          error: existingError,
        } =
          await supabase
            .from(
              "installation_jobs"
            )
            .select("*")
            .eq(
              "qc_job_id",
              qcJob.id
            )
            .maybeSingle();


        if (existingError) {
          console.error(
            "check installation:",
            existingError
          );

          continue;
        }


        if (!existing) {
          const now =
            new Date()
              .toISOString();


          const {
            error: insertError,
          } =
            await supabase
              .from(
                "installation_jobs"
              )
              .insert({
                qc_job_id:
                  qcJob.id,

                status:
                  "waiting",

                created_at:
                  now,

                updated_at:
                  now,
              });


          if (insertError) {
            console.error(
              "create installation:",
              insertError
            );

            /*
             * ไม่หยุดทั้งหน้า
             * เพื่อให้งานอื่นยังโหลดได้
             */
          }
        }
      }


      /* ======================================================
         3. โหลด installation jobs ที่สัมพันธ์กับ QC
      ====================================================== */

      const qcIds =
        passedJobs.map(
          (item) =>
            item.id
        );


      let installationRows =
        [];


      if (
        qcIds.length >
        0
      ) {
        const {
          data:
            installationData,

          error:
            installationError,
        } =
          await supabase
            .from(
              "installation_jobs"
            )
            .select("*")
            .in(
              "qc_job_id",
              qcIds
            );


        if (
          installationError
        ) {
          throw installationError;
        }


        installationRows =
          installationData ||
          [];
      }


      /* ======================================================
         4. MERGE QC + INSTALLATION
      ====================================================== */

      const merged =
        passedJobs.map(
          (qcJob) => ({
            ...qcJob,

            installation:
              installationRows.find(
                (installation) =>
                  installation.qc_job_id ===
                  qcJob.id
              ) ||
              null,
          })
        );


      setJobs(
        merged
      );
    } catch (
      error
    ) {
      console.error(
        "load installation:",
        error
      );


      alert(
        "โหลดงานติดตั้งไม่สำเร็จ: " +
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


  /* ==========================================================
     QUOTATION
  ========================================================== */

  function quotationOf(
    job
  ) {
    return (
      job
        ?.production_jobs
        ?.quotations ||
      null
    );
  }


  /* ==========================================================
     CUSTOMER
  ========================================================== */

  function customerName(
    job
  ) {
    const customer =
      quotationOf(
        job
      )?.customers;


    return (
      customer
        ?.company_name ||

      customer
        ?.contact_name ||

      customer
        ?.customer_code ||

      "-"
    );
  }


  /* ==========================================================
     MONEY
  ========================================================== */

  function money(
    value
  ) {
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


  /* ==========================================================
     STATUS
  ========================================================== */

  function statusInfo(
    status
  ) {
    if (
      status ===
      "scheduled"
    ) {
      return {
        label:
          "นัดติดตั้งแล้ว",

        bg:
          "#fef3c7",

        color:
          "#b45309",
      };
    }


    if (
      status ===
      "installing"
    ) {
      return {
        label:
          "กำลังติดตั้ง",

        bg:
          "#dbeafe",

        color:
          "#1d4ed8",
      };
    }


    if (
      status ===
      "completed"
    ) {
      return {
        label:
          "ติดตั้งเสร็จ",

        bg:
          "#dcfce7",

        color:
          "#15803d",
      };
    }


    return {
      label:
        "รอนัดติดตั้ง",

      bg:
        "#f3f4f6",

      color:
        "#374151",
    };
  }


  /* ==========================================================
     DATE
  ========================================================== */

  function formatDateTime(
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


    return date.toLocaleString(
      "th-TH",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",
      }
    );
  }


  /* ==========================================================
     UPDATE STATUS
  ========================================================== */

  async function updateStatus(
    job,
    nextStatus
  ) {
    if (
      !job?.installation ||
      savingId
    ) {
      return;
    }


    const installationId =
      job.installation.id;


    if (
      !installationId
    ) {
      alert(
        "ไม่พบรหัสงานติดตั้ง"
      );

      return;
    }


    const now =
      new Date()
        .toISOString();


    const updateData = {
      status:
        nextStatus,

      updated_at:
        now,
    };


    /* ======================================================
       SCHEDULE
    ====================================================== */

    if (
      nextStatus ===
      "scheduled"
    ) {
      const input =
        window.prompt(
          "กรอกวันนัดติดตั้ง เช่น 25/08/2569 09:00",
          ""
        );


      if (
        input === null
      ) {
        return;
      }


      const value =
        input.trim();


      const match =
        value.match(
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
        );


      if (!match) {
        alert(
          "รูปแบบวันที่ไม่ถูกต้อง\nกรุณากรอก เช่น 25/08/2569 09:00"
        );

        return;
      }


      let day =
        Number(
          match[1]
        );


      let month =
        Number(
          match[2]
        );


      let year =
        Number(
          match[3]
        );


      let hour =
        match[4]
          ? Number(
              match[4]
            )
          : 9;


      let minute =
        match[5]
          ? Number(
              match[5]
            )
          : 0;


      /* พ.ศ. -> ค.ศ. */

      if (
        year >=
        2400
      ) {
        year -=
          543;
      }


      if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
      ) {
        alert(
          "วันที่หรือเวลาไม่ถูกต้อง"
        );

        return;
      }


      const scheduledDate =
        new Date(
          year,
          month - 1,
          day,
          hour,
          minute,
          0,
          0
        );


      /*
       * ตรวจวันที่จริง
       * เช่น 31/02 จะไม่ผ่าน
       */

      if (
        Number.isNaN(
          scheduledDate
            .getTime()
        ) ||

        scheduledDate
          .getFullYear() !==
          year ||

        scheduledDate
          .getMonth() !==
          month - 1 ||

        scheduledDate
          .getDate() !==
          day ||

        scheduledDate
          .getHours() !==
          hour ||

        scheduledDate
          .getMinutes() !==
          minute
      ) {
        alert(
          "วันที่หรือเวลาไม่ถูกต้อง"
        );

        return;
      }


      updateData.scheduled_at =
        scheduledDate
          .toISOString();
    }


    /* ======================================================
       START INSTALLATION
    ====================================================== */

    if (
      nextStatus ===
      "installing"
    ) {
      updateData.started_at =
        now;
    }


    /* ======================================================
       COMPLETE
    ====================================================== */

    if (
      nextStatus ===
      "completed"
    ) {
      if (
        !window.confirm(
          "ยืนยันว่าติดตั้งงานเสร็จเรียบร้อยแล้ว?"
        )
      ) {
        return;
      }


      updateData.completed_at =
        now;
    }


    /* ======================================================
       SAVE
    ====================================================== */

    try {
      setSavingId(
        installationId
      );


      const {
        error,
      } =
        await supabase
          .from(
            "installation_jobs"
          )
          .update(
            updateData
          )
          .eq(
            "id",
            installationId
          );


      if (error) {
        throw error;
      }


      await loadInstallation();
    } catch (
      error
    ) {
      console.error(
        "updateStatus:",
        error
      );


      alert(
        "อัปเดตงานติดตั้งไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );
    } finally {
      setSavingId(
        null
      );
    }
  }


  /* ==========================================================
     FILTER
  ========================================================== */

  const rows =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();


      if (
        !keyword
      ) {
        return jobs;
      }


      return jobs.filter(
        (job) => {
          const quotation =
            quotationOf(
              job
            );


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

            customerName(
              job
            )
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


  /* ==========================================================
     SUMMARY
  ========================================================== */

  const waitingCount =
    jobs.filter(
      (job) =>
        job
          .installation
          ?.status ===
        "waiting"
    ).length;


  const scheduledCount =
    jobs.filter(
      (job) =>
        job
          .installation
          ?.status ===
        "scheduled"
    ).length;


  const installingCount =
    jobs.filter(
      (job) =>
        job
          .installation
          ?.status ===
        "installing"
    ).length;


  const completedCount =
    jobs.filter(
      (job) =>
        job
          .installation
          ?.status ===
        "completed"
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
            quotationOf(
              job
            )?.grand_total ||
              0
          )
        );
      },

      0
    );


  /* ==========================================================
     UI
  ========================================================== */

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

        {/* TOP */}

        <div
          style={
            topBar
          }
        >
          <div>
            <h1
              style={{
                margin: 0,

                fontSize:
                  "32px",
              }}
            >
              งานติดตั้ง
            </h1>


            <p
              style={{
                color:
                  "#6b7280",

                marginTop:
                  "6px",
              }}
            >
              จัดคิวและติดตามงานหลังผ่าน QC
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
                  "/qc"
                )
              }

              style={
                secondaryButton
              }
            >
              QC ตรวจสอบงาน
            </button>


            <button
              type="button"

              onClick={() =>
                router.push(
                  "/delivery"
                )
              }

              style={
                secondaryButton
              }
            >
              ส่งมอบ / ปิดงาน
            </button>


            <button
              type="button"

              onClick={() =>
                router.push(
                  "/"
                )
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
            title="รอนัดติดตั้ง"

            value={
              loading
                ? "..."
                : `${waitingCount} งาน`
            }
          />


          <Card
            title="นัดแล้ว"

            value={
              loading
                ? "..."
                : `${scheduledCount} งาน`
            }
          />


          <Card
            title="กำลังติดตั้ง"

            value={
              loading
                ? "..."
                : `${installingCount} งาน`
            }
          />


          <Card
            title="ติดตั้งเสร็จ"

            value={
              loading
                ? "..."
                : `${completedCount} งาน`
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
            value={
              search
            }

            onChange={(
              event
            ) =>
              setSearch(
                event
                  .target
                  .value
              )
            }

            placeholder="ค้นหาเลขที่ใบเสนอราคา / ลูกค้า / ชื่องาน"

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

                fontSize:
                  "20px",
              }}
            >
              รายการงานติดตั้ง
            </h2>
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
                  "1000px",
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
                    วันนัด
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
                      colSpan={
                        7
                      }

                      style={
                        empty
                      }
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : rows.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={
                        7
                      }

                      style={
                        empty
                      }
                    >
                      ยังไม่มีงานที่ผ่าน QC
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
                            .installation
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
                            style={
                              td
                            }
                          >
                            <strong>
                              {
                                quotation
                                  ?.quotation_no ||
                                "-"
                              }
                            </strong>
                          </td>


                          <td
                            style={
                              td
                            }
                          >
                            {customerName(
                              job
                            )}
                          </td>


                          <td
                            style={
                              td
                            }
                          >
                            {
                              quotation
                                ?.project_name ||
                              "-"
                            }
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
                            {formatDateTime(
                              job
                                .installation
                                ?.scheduled_at
                            )}
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

                              {job
                                .installation
                                ?.status ===
                                "waiting" && (
                                <button
                                  type="button"

                                  disabled={
                                    savingId ===
                                    job
                                      .installation
                                      .id
                                  }

                                  onClick={() =>
                                    updateStatus(
                                      job,
                                      "scheduled"
                                    )
                                  }

                                  style={
                                    primaryButton
                                  }
                                >
                                  นัดติดตั้ง
                                </button>
                              )}


                              {job
                                .installation
                                ?.status ===
                                "scheduled" && (
                                <button
                                  type="button"

                                  disabled={
                                    savingId ===
                                    job
                                      .installation
                                      .id
                                  }

                                  onClick={() =>
                                    updateStatus(
                                      job,
                                      "installing"
                                    )
                                  }

                                  style={
                                    primaryButton
                                  }
                                >
                                  เริ่มติดตั้ง
                                </button>
                              )}


                              {job
                                .installation
                                ?.status ===
                                "installing" && (
                                <button
                                  type="button"

                                  disabled={
                                    savingId ===
                                    job
                                      .installation
                                      .id
                                  }

                                  onClick={() =>
                                    updateStatus(
                                      job,
                                      "completed"
                                    )
                                  }

                                  style={
                                    finishButton
                                  }
                                >
                                  ติดตั้งเสร็จ
                                </button>
                              )}


                              {job
                                .installation
                                ?.status ===
                                "completed" && (
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
                                    ✓ เสร็จเรียบร้อย
                                  </span>


                                  <button
                                    type="button"

                                    onClick={() =>
                                      router.push(
                                        "/delivery"
                                      )
                                    }

                                    style={
                                      deliveryButton
                                    }
                                  >
                                    ไปส่งมอบ
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
      style={{
        background:
          "white",

        padding:
          "18px",

        borderRadius:
          "12px",

        boxShadow:
          "0 2px 8px rgba(0,0,0,0.05)",
      }}
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
    "repeat(6, minmax(0, 1fr))",

  gap:
    "12px",

  marginBottom:
    "20px",
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
};


const sectionHeader = {
  padding:
    "18px 20px",

  borderBottom:
    "1px solid #e5e7eb",
};


const primaryButton = {
  padding:
    "8px 12px",

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
    "8px 12px",

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


const deliveryButton = {
  padding:
    "8px 12px",

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