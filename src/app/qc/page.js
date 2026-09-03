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


/* ============================================================
   QC PAGE
============================================================ */

export default function QCPage() {
  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    jobs,
    setJobs,
  ] =
    useState([]);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    savingId,
    setSavingId,
  ] =
    useState(null);


  /* ==========================================================
     LOAD
  ========================================================== */

  useEffect(() => {
    loadQC();
  }, []);


  async function loadQC() {
    setLoading(true);

    try {
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


      /* ======================================================
         LOAD PRODUCTION JOBS
         รองรับ status เก่า + ใหม่
      ====================================================== */

      const {
        data:
          productionData,

        error:
          productionError,
      } =
        await supabase
          .from(
            "production_jobs"
          )
          .select(`
            id,
            quotation_id,
            status,
            started_at,
            completed_at,
            qc_sent_at,
            created_at,
            updated_at,

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
          `)
          .in(
            "status",
            [
              "qc",
              "qc_sent",
              "sent_qc",
            ]
          )
          .order(
            "qc_sent_at",
            {
              ascending:
                false,

              nullsFirst:
                false,
            }
          );


      if (
        productionError
      ) {
        throw productionError;
      }


      const productionJobs =
        productionData ||
        [];


      /* ======================================================
         ENSURE QC JOB EXISTS
      ====================================================== */

      for (
        const productionJob
        of productionJobs
      ) {
        const {
          error:
            ensureQcError,
        } =
          await supabase
            .from(
              "qc_jobs"
            )
            .upsert(
              {
                production_job_id:
                  productionJob.id,

                status:
                  "pending",
              },

              {
                onConflict:
                  "production_job_id",

                ignoreDuplicates:
                  true,
              }
            );


        if (
          ensureQcError
        ) {
          console.error(
            "ensure QC job:",
            ensureQcError
          );
        }
      }


      /* ======================================================
         LOAD QC ROWS
      ====================================================== */

      const productionIds =
        productionJobs.map(
          (item) =>
            item.id
        );


      let qcRows =
        [];


      if (
        productionIds.length >
        0
      ) {
        const {
          data:
            qcData,

          error:
            qcError,
        } =
          await supabase
            .from(
              "qc_jobs"
            )
            .select("*")
            .in(
              "production_job_id",
              productionIds
            );


        if (qcError) {
          throw qcError;
        }


        qcRows =
          qcData ||
          [];
      }


      /* ======================================================
         LOAD INSTALLATION JOBS
      ====================================================== */

      let installationRows =
        [];


      const quotationIds =
        productionJobs
          .map(
            (item) =>
              item.quotation_id
          )
          .filter(Boolean);


      if (
        quotationIds.length >
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
              "quotation_id",
              quotationIds
            );


        if (
          installationError
        ) {
          console.error(
            "load installation:",
            installationError
          );
        } else {
          installationRows =
            installationData ||
            [];
        }
      }


      /* ======================================================
         MERGE
      ====================================================== */

      const merged =
        productionJobs.map(
          (job) => ({
            ...job,

            qc:
              qcRows.find(
                (qc) =>
                  qc.production_job_id ===
                  job.id
              ) ||
              null,

            installation:
              installationRows.find(
                (installation) =>
                  installation.quotation_id ===
                  job.quotation_id
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
        "load QC:",
        error
      );

      alert(
        "โหลดงาน QC ไม่สำเร็จ: " +
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
     CREATE INSTALLATION JOB
  ========================================================== */

  async function ensureInstallationJob(
    job
  ) {
    if (
      !job?.quotation_id
    ) {
      throw new Error(
        "ไม่พบ quotation_id"
      );
    }


    /* --------------------------------------------------------
       CHECK EXISTING
    -------------------------------------------------------- */

    const {
      data:
        existing,

      error:
        existingError,
    } =
      await supabase
        .from(
          "installation_jobs"
        )
        .select("*")
        .eq(
          "quotation_id",
          job.quotation_id
        )
        .maybeSingle();


    if (
      existingError
    ) {
      throw existingError;
    }


    if (existing) {
      return existing;
    }


    /* --------------------------------------------------------
       CREATE
       ใช้ field ขั้นต่ำเพื่อไม่ชน schema เดิม
    -------------------------------------------------------- */

    const now =
      new Date()
        .toISOString();


    const {
      data:
        created,

      error:
        createError,
    } =
      await supabase
        .from(
          "installation_jobs"
        )
        .insert({
          qc_job_id:
            job.qc?.id || null,

          quotation_id:
            job.quotation_id,

          status:
            "pending",

          created_at:
            now,

          updated_at:
            now,
        })
        .select()
        .single();


    if (
      createError
    ) {
      /*
        ถ้า schema เดิมไม่รับ pending
        ลอง waiting
      */

      const {
        data:
          fallback,

        error:
          fallbackError,
      } =
        await supabase
          .from(
            "installation_jobs"
          )
          .insert({
            qc_job_id:
              job.qc?.id || null,

            quotation_id:
              job.quotation_id,

            status:
              "waiting",

            created_at:
              now,

            updated_at:
              now,
          })
          .select()
          .single();


      if (
        fallbackError
      ) {
        throw createError;
      }


      return fallback;
    }


    return created;
  }


  /* ==========================================================
     PASS QC
  ========================================================== */

  async function passQC(
    job
  ) {
    if (
      !job.qc ||
      savingId
    ) {
      return;
    }


    if (
      !window.confirm(
        "ยืนยันว่าตรวจ QC ผ่านแล้ว และส่งต่องานติดตั้ง?"
      )
    ) {
      return;
    }


    setSavingId(
      job.id
    );


    try {
      const now =
        new Date()
          .toISOString();


      /* ======================================================
         1. PASS QC
      ====================================================== */

      const {
        error:
          qcError,
      } =
        await supabase
          .from(
            "qc_jobs"
          )
          .update({
            status:
              "passed",

            checked_at:
              now,

            updated_at:
              now,
          })
          .eq(
            "id",
            job.qc.id
          );


      if (qcError) {
        throw qcError;
      }


      /* ======================================================
         2. CREATE INSTALLATION JOB
      ====================================================== */

      await ensureInstallationJob(
        job
      );


      /* ======================================================
         3. OPTIONAL PRODUCTION STATUS
         ใช้ qc_sent คงไว้ ไม่บังคับเปลี่ยน
      ====================================================== */

      alert(
        "QC ผ่านแล้ว และส่งต่องานติดตั้งเรียบร้อย"
      );


      await loadQC();
    } catch (
      error
    ) {
      console.error(
        "pass QC:",
        error
      );


      alert(
        "ส่งต่องานติดตั้งไม่สำเร็จ: " +
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
     SEND PASSED JOB TO INSTALLATION
     สำหรับงานที่ผ่าน QC เก่าแล้ว
  ========================================================== */

  async function sendPassedToInstallation(
    job
  ) {
    if (
      savingId
    ) {
      return;
    }


    setSavingId(
      job.id
    );


    try {
      await ensureInstallationJob(
        job
      );


      alert(
        "ส่งงานไปงานติดตั้งเรียบร้อยแล้ว"
      );


      await loadQC();
    } catch (
      error
    ) {
      console.error(
        "send installation:",
        error
      );


      alert(
        "สร้างงานติดตั้งไม่สำเร็จ: " +
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
     FAIL QC
  ========================================================== */

  async function failQC(
    job
  ) {
    if (
      !job.qc ||
      savingId
    ) {
      return;
    }


    const note =
      window.prompt(
        "ระบุสาเหตุที่ไม่ผ่าน QC",
        ""
      ) ||
      "";


    if (
      !note.trim()
    ) {
      return;
    }


    if (
      !window.confirm(
        "ยืนยันไม่ผ่าน QC และส่งกลับฝ่ายผลิต?"
      )
    ) {
      return;
    }


    setSavingId(
      job.id
    );


    try {
      const now =
        new Date()
          .toISOString();


      /* ======================================================
         QC FAILED
      ====================================================== */

      const {
        error:
          qcError,
      } =
        await supabase
          .from(
            "qc_jobs"
          )
          .update({
            status:
              "failed",

            note:
              note.trim(),

            checked_at:
              now,

            updated_at:
              now,
          })
          .eq(
            "id",
            job.qc.id
          );


      if (qcError) {
        throw qcError;
      }


      /* ======================================================
         RETURN TO PRODUCTION
      ====================================================== */

      const {
        error:
          productionError,
      } =
        await supabase
          .from(
            "production_jobs"
          )
          .update({
            status:
              "producing",

            completed_at:
              null,

            qc_sent_at:
              null,

            note:
              `QC ไม่ผ่าน: ${note.trim()}`,

            updated_at:
              now,
          })
          .eq(
            "id",
            job.id
          );


      if (
        productionError
      ) {
        throw productionError;
      }


      alert(
        "บันทึก QC ไม่ผ่าน และส่งกลับฝ่ายผลิตแล้ว"
      );


      await loadQC();
    } catch (
      error
    ) {
      console.error(
        "fail QC:",
        error
      );


      alert(
        "บันทึก QC ไม่สำเร็จ: " +
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
     HELPERS
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


  function customerName(
    job
  ) {
    const customer =
      job.quotations
        ?.customers;


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


  function qcLabel(
    status
  ) {
    if (
      status ===
      "passed"
    ) {
      return {
        text:
          "ผ่าน QC",

        bg:
          "#dcfce7",

        color:
          "#15803d",
      };
    }


    if (
      status ===
      "failed"
    ) {
      return {
        text:
          "ไม่ผ่าน QC",

        bg:
          "#fee2e2",

        color:
          "#b91c1c",
      };
    }


    return {
      text:
        "รอตรวจ QC",

      bg:
        "#fef3c7",

      color:
        "#b45309",
    };
  }


  /* ==========================================================
     FILTER
  ========================================================== */

  const filtered =
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
            job.quotations;


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

  const pendingCount =
    jobs.filter(
      (job) =>
        !job.qc ||
        job.qc.status ===
          "pending"
    ).length;


  const passedCount =
    jobs.filter(
      (job) =>
        job.qc?.status ===
        "passed"
    ).length;


  const sentInstallationCount =
    jobs.filter(
      (job) =>
        Boolean(
          job.installation
        )
    ).length;


  const totalValue =
    jobs.reduce(
      (
        sum,
        job
      ) =>
        sum +
        Number(
          job
            .quotations
            ?.grand_total ||
            0
        ),

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

        {/* =====================================================
            TOP BAR
        ===================================================== */}

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
              QC ตรวจสอบงาน
            </h1>


            <p
              style={{
                marginTop:
                  "6px",

                color:
                  "#6b7280",
              }}
            >
              ตรวจสอบคุณภาพงานก่อนส่งติดตั้ง
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
                  "/production"
                )
              }

              style={
                secondaryButton
              }
            >
              งานผลิต
            </button>


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


        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <div
          style={
            summaryGrid
          }
        >
          <Card
            title="งานรอตรวจ QC"

            value={
              loading
                ? "..."
                : `${pendingCount} งาน`
            }
          />


          <Card
            title="ผ่าน QC"

            value={
              loading
                ? "..."
                : `${passedCount} งาน`
            }
          />


          <Card
            title="ส่งงานติดตั้งแล้ว"

            value={
              loading
                ? "..."
                : `${sentInstallationCount} งาน`
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


        {/* =====================================================
            SEARCH
        ===================================================== */}

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


        {/* =====================================================
            TABLE
        ===================================================== */}

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
              รายการตรวจ QC
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
                  "1050px",
              }}
            >
              <thead
                style={{
                  background:
                    "#f9fafb",
                }}
              >
                <tr>
                  <th
                    style={
                      th
                    }
                  >
                    เลขที่
                  </th>


                  <th
                    style={
                      th
                    }
                  >
                    ลูกค้า
                  </th>


                  <th
                    style={
                      th
                    }
                  >
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
                    ผล QC
                  </th>


                  <th
                    style={{
                      ...th,

                      textAlign:
                        "center",
                    }}
                  >
                    งานติดตั้ง
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
                ) : filtered.length ===
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
                      ยังไม่มีงานส่ง QC
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (job) => {
                      const quotation =
                        job.quotations;


                      const status =
                        qcLabel(
                          job.qc
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
                                  ?.quotation_no
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
                                status.text
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
                            {job.installation ? (
                              <span
                                style={
                                  installationBadge
                                }
                              >
                                ✓ ส่งแล้ว
                              </span>
                            ) : (
                              <span
                                style={
                                  waitingBadge
                                }
                              >
                                -
                              </span>
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

                              {/* ==================================
                                  VIEW
                              ================================== */}

                              <button
                                type="button"

                                onClick={() =>
                                  router.push(
                                    `/production/${job.quotation_id}`
                                  )
                                }

                                style={
                                  viewButton
                                }
                              >
                                เปิดดู
                              </button>


                              {/* ==================================
                                  PENDING
                              ================================== */}

                              {job.qc
                                ?.status ===
                                "pending" && (
                                <>
                                  <button
                                    type="button"

                                    disabled={
                                      savingId ===
                                      job.id
                                    }

                                    onClick={() =>
                                      passQC(
                                        job
                                      )
                                    }

                                    style={
                                      passButton
                                    }
                                  >
                                    {savingId ===
                                    job.id
                                      ? "กำลังบันทึก..."
                                      : "ผ่าน QC"}
                                  </button>


                                  <button
                                    type="button"

                                    disabled={
                                      savingId ===
                                      job.id
                                    }

                                    onClick={() =>
                                      failQC(
                                        job
                                      )
                                    }

                                    style={
                                      failButton
                                    }
                                  >
                                    ไม่ผ่าน
                                  </button>
                                </>
                              )}


                              {/* ==================================
                                  PASSED BUT NO INSTALLATION
                              ================================== */}

                              {job.qc
                                ?.status ===
                                "passed" &&
                                !job.installation && (
                                  <button
                                    type="button"

                                    disabled={
                                      savingId ===
                                      job.id
                                    }

                                    onClick={() =>
                                      sendPassedToInstallation(
                                        job
                                      )
                                    }

                                    style={
                                      installationButton
                                    }
                                  >
                                    ส่งงานติดตั้ง
                                  </button>
                                )}


                              {/* ==================================
                                  INSTALLATION EXISTS
                              ================================== */}

                              {job.installation && (
                                <button
                                  type="button"

                                  onClick={() =>
                                    router.push(
                                      "/installation"
                                    )
                                  }

                                  style={
                                    installationButton
                                  }
                                >
                                  ไปงานติดตั้ง
                                </button>
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
            "13px",
        }}
      >
        {title}
      </div>


      <div
        style={{
          marginTop:
            "8px",

          fontSize:
            "27px",

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
    "repeat(4, minmax(0, 1fr))",

  gap:
    "16px",

  marginBottom:
    "20px",
};


const cardStyle = {
  background:
    "white",

  padding:
    "20px",

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

  boxSizing:
    "border-box",

  padding:
    "12px",

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


const viewButton = {
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


const passButton = {
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


const failButton = {
  padding:
    "8px 12px",

  border:
    "none",

  borderRadius:
    "7px",

  background:
    "#dc2626",

  color:
    "white",

  cursor:
    "pointer",

  fontWeight:
    "700",
};


const installationButton = {
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


const installationBadge = {
  display:
    "inline-block",

  padding:
    "6px 10px",

  borderRadius:
    "999px",

  background:
    "#dcfce7",

  color:
    "#15803d",

  fontWeight:
    "700",
};


const waitingBadge = {
  color:
    "#9ca3af",
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


