"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

/* =========================================================
   MENU BY ROLE
========================================================= */

const menuByRole = {
  owner: [
    "Dashboard",
    "ลูกค้า",
    "ใบเสนอราคา",
    "ใบแจ้งหนี้",
    "ใบเสร็จรับเงิน",
    "งานผลิต",
    "QC ตรวจสอบงาน",
    "งานติดตั้ง",
    "ส่งมอบ / ปิดงาน",
    "การเงิน",
    "รายงาน",
    "ตั้งค่า",
    "ออกจากระบบ",
  ],

  staff: [
    "Dashboard",
    "ลูกค้า",
    "ใบเสนอราคา",
    "งานผลิต",
    "QC ตรวจสอบงาน",
    "งานติดตั้ง",
    "ส่งมอบ / ปิดงาน",
    "ออกจากระบบ",
  ],

  finance: [
    "Dashboard",
    "ใบแจ้งหนี้",
    "ใบเสร็จรับเงิน",
    "การเงิน",
    "รายงาน",
    "ออกจากระบบ",
  ],

  production: [
    "Dashboard",
    "งานผลิต",
    "QC ตรวจสอบงาน",
    "งานติดตั้ง",
    "ส่งมอบ / ปิดงาน",
    "ออกจากระบบ",
  ],
};

/* =========================================================
   MENU ROUTES
========================================================= */

const menuRoutes = {
  Dashboard: "/",
  ลูกค้า: "/customers",
  ใบเสนอราคา: "/quotations/list",
  ใบแจ้งหนี้: "/invoices/list",
  ใบเสร็จรับเงิน: "/receipts/list",
  งานผลิต: "/production",
  "QC ตรวจสอบงาน": "/qc",
  งานติดตั้ง: "/installation",
  "ส่งมอบ / ปิดงาน": "/delivery",
  การเงิน: "/finance",
  รายงาน: "/reports",
  ตั้งค่า: "/settings",
};

/* =========================================================
   VALID ROLES
========================================================= */

const validRoles = [
  "owner",
  "staff",
  "finance",
  "production",
];

/* =========================================================
   HOME PAGE
========================================================= */

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  const [role, setRole] = useState(null);
  const [email, setEmail] = useState("");
  const [roleError, setRoleError] = useState("");

  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);

  const [productionJobs, setProductionJobs] = useState([]);
  const [qcJobs, setQcJobs] = useState([]);
  const [installationJobs, setInstallationJobs] = useState([]);
  const [deliveryJobs, setDeliveryJobs] = useState([]);

  const menu =
    role && menuByRole[role]
      ? menuByRole[role]
      : [];

  const isOwner = role === "owner";
  const isFinance = role === "finance";

  const canSeeFinance =
    isOwner || isFinance;

  /* =======================================================
     INITIALIZE
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        setRoleLoading(true);
        setLoading(true);
        setRoleError("");

        /* -----------------------------------------------
           1. GET CURRENT USER
        ----------------------------------------------- */

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.error(
            "GET USER ERROR:",
            userError
          );
        }

        if (!user) {
          window.location.replace("/login");
          return;
        }

        if (!mounted) return;

        setEmail(user.email || "");

        /* -----------------------------------------------
           2. GET ROLE BY RPC
        ----------------------------------------------- */

        let currentRole = null;

        const {
          data: rpcRole,
          error: rpcError,
        } = await supabase.rpc(
          "current_user_role"
        );

        if (!rpcError && rpcRole) {
          const normalizedRole = String(
            rpcRole
          )
            .trim()
            .toLowerCase();

          if (
            validRoles.includes(
              normalizedRole
            )
          ) {
            currentRole =
              normalizedRole;
          }
        }

        if (rpcError) {
          console.warn(
            "RPC ROLE ERROR:",
            rpcError
          );
        }

        /* -----------------------------------------------
           3. FALLBACK DIRECT PROFILE QUERY
        ----------------------------------------------- */

        if (!currentRole) {
          const {
            data: profile,
            error: profileError,
          } = await supabase
            .from("profiles")
            .select(
              "id,email,role"
            )
            .eq("id", user.id)
            .maybeSingle();

          if (profileError) {
            console.error(
              "PROFILE ERROR:",
              profileError
            );
          }

          if (profile?.role) {
            const normalizedRole =
              String(profile.role)
                .trim()
                .toLowerCase();

            if (
              validRoles.includes(
                normalizedRole
              )
            ) {
              currentRole =
                normalizedRole;
            }
          }
        }

        /* -----------------------------------------------
           4. FALLBACK PROFILE BY EMAIL
        ----------------------------------------------- */

        if (
          !currentRole &&
          user.email
        ) {
          const {
            data: profileByEmail,
            error:
              profileByEmailError,
          } = await supabase
            .from("profiles")
            .select(
              "id,email,role"
            )
            .ilike(
              "email",
              user.email
            )
            .maybeSingle();

          if (
            profileByEmailError
          ) {
            console.error(
              "PROFILE EMAIL ERROR:",
              profileByEmailError
            );
          }

          if (
            profileByEmail?.role
          ) {
            const normalizedRole =
              String(
                profileByEmail.role
              )
                .trim()
                .toLowerCase();

            if (
              validRoles.includes(
                normalizedRole
              )
            ) {
              currentRole =
                normalizedRole;
            }
          }
        }

        /* -----------------------------------------------
           5. ROLE MUST EXIST
        ----------------------------------------------- */

        if (!currentRole) {
          console.error(
            "ไม่พบสิทธิ์ของผู้ใช้:",
            user.email,
            user.id
          );

          if (mounted) {
            setRoleError(
              "ไม่พบสิทธิ์ของบัญชีนี้ในระบบ กรุณาตรวจสอบตาราง profiles"
            );

            setRoleLoading(false);
            setLoading(false);
          }

          return;
        }

        console.log(
          "LOGIN USER:",
          user.email
        );

        console.log(
          "LOGIN USER ID:",
          user.id
        );

        console.log(
          "USER ROLE:",
          currentRole
        );

        if (!mounted) return;

        setRole(currentRole);
        setRoleLoading(false);

        /* -----------------------------------------------
           6. LOAD DASHBOARD
        ----------------------------------------------- */

        await loadDashboard(
          currentRole,
          mounted
        );
      } catch (error) {
        console.error(
          "INITIALIZE ERROR:",
          error
        );

        if (mounted) {
          setRoleError(
            "เกิดข้อผิดพลาดขณะตรวจสอบสิทธิ์ผู้ใช้งาน"
          );

          setRoleLoading(false);
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  /* =======================================================
     LOAD DASHBOARD
  ======================================================= */

  async function loadDashboard(
    currentRole
  ) {
    try {
      setLoading(true);

      const customerPromise =
        supabase
          .from("customers")
          .select(
            "id, created_at"
          );

      const quotationPromise =
        supabase
          .from("quotations")
          .select(
            `
            id,
            quotation_no,
            project_name,
            grand_total,
            status,
            created_at
          `
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

      const productionPromise =
        supabase
          .from("production_jobs")
          .select("id, quotation_id, status, created_at");

      const qcPromise =
        supabase
          .from("qc_jobs")
          .select("id, production_job_id, status, created_at");

      const installationPromise =
        supabase
          .from("installation_jobs")
          .select("id, qc_job_id, quotation_id, status, created_at");

      const deliveryPromise =
        supabase
          .from("delivery_jobs")
          .select("id, installation_job_id, status, created_at");

      let invoicePromise =
        Promise.resolve({
          data: [],
          error: null,
        });

      let receiptPromise =
        Promise.resolve({
          data: [],
          error: null,
        });

      if (
        currentRole === "owner" ||
        currentRole === "finance"
      ) {
        invoicePromise =
          supabase
            .from("invoices")
            .select(
              `
              id,
              invoice_no,
              project_name,
              grand_total,
              status,
              created_at
            `
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            );

        receiptPromise =
          supabase
            .from("receipts")
            .select(
              `
              id,
              receipt_no,
              project_name,
              grand_total,
              status,
              created_at
            `
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            );
      }

      const [
        customerResult,
        quotationResult,
        invoiceResult,
        receiptResult,
        productionResult,
        qcResult,
        installationResult,
        deliveryResult,
      ] = await Promise.all([
        customerPromise,
        quotationPromise,
        invoicePromise,
        receiptPromise,
        productionPromise,
        qcPromise,
        installationPromise,
        deliveryPromise,
      ]);

      if (
        customerResult.error
      ) {
        console.error(
          "CUSTOMERS:",
          customerResult.error
        );
      }

      if (
        quotationResult.error
      ) {
        console.error(
          "QUOTATIONS:",
          quotationResult.error
        );
      }

      if (
        invoiceResult.error
      ) {
        console.error(
          "INVOICES:",
          invoiceResult.error
        );
      }

      if (
        receiptResult.error
      ) {
        console.error(
          "RECEIPTS:",
          receiptResult.error
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

      setProductionJobs(
        productionResult?.data || []
      );

      setQcJobs(
        qcResult?.data || []
      );

      setInstallationJobs(
        installationResult?.data || []
      );

      setDeliveryJobs(
        deliveryResult?.data || []
      );
    } catch (error) {
      console.error(
        "LOAD DASHBOARD ERROR:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    try {
      await supabase.auth.signOut();

      window.location.replace(
        "/login"
      );
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      window.location.replace(
        "/login"
      );
    }
  }

  /* =======================================================
     MENU
  ======================================================= */

  function handleMenu(item) {
    if (
      item === "ออกจากระบบ"
    ) {
      handleLogout();
      return;
    }

    if (
      !menu.includes(item)
    ) {
      alert(
        "บัญชีนี้ไม่มีสิทธิ์เข้าเมนูนี้"
      );

      return;
    }

    const route =
      menuRoutes[item];

    if (route) {
      router.push(route);
    }
  }

  /* =======================================================
     MONEY
  ======================================================= */

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

  /* =======================================================
     ROLE LABEL
  ======================================================= */

  function roleLabel(value) {
    switch (value) {
      case "owner":
        return "เจ้าของระบบ";

      case "finance":
        return "การเงิน";

      case "production":
        return "ฝ่ายผลิต";

      case "staff":
        return "พนักงาน";

      default:
        return "ไม่ทราบสิทธิ์";
    }
  }

  /* =======================================================
     SUMMARY
  ======================================================= */

  const totalSales = useMemo(() => {
    return invoices
      .filter((item) => item.status === "paid")
      .reduce(
        (sum, item) =>
          sum + Number(item.grand_total || 0),
        0
      );
  }, [invoices]);

  const accountsReceivable =
    useMemo(() => {
      return invoices
        .filter(
          (item) =>
            item.status ===
            "pending"
        )
        .reduce(
          (sum, item) =>
            sum +
            Number(
              item.grand_total ||
                0
            ),
          0
        );
    }, [invoices]);

  const paidInvoices =
    useMemo(() => {
      return invoices.filter(
        (item) =>
          item.status ===
          "paid"
      ).length;
    }, [invoices]);

  const activeJobs =
    useMemo(() => {
      const productionCount =
        productionJobs.filter(
          (item) =>
            [
              "ready",
              "producing",
              "in_progress",
              "completed",
            ].includes(item.status)
        ).length;

      const qcCount =
        qcJobs.filter(
          (item) =>
            [
              "pending",
              "waiting",
            ].includes(item.status)
        ).length;

      const installationCount =
        installationJobs.filter(
          (item) =>
            [
              "waiting",
              "pending",
              "scheduled",
              "installing",
            ].includes(item.status)
        ).length;

      const deliveryCount =
        deliveryJobs.filter(
          (item) =>
            [
              "waiting",
              "delivered",
            ].includes(item.status)
        ).length;

      return (
        productionCount +
        qcCount +
        installationCount +
        deliveryCount
      );
    }, [
      productionJobs,
      qcJobs,
      installationJobs,
      deliveryJobs,
    ]);

  /* =======================================================
     RECENT ITEMS
  ======================================================= */

  const recentItems =
    useMemo(() => {
      const quotationRows =
        quotations
          .slice(0, 4)
          .map((item) => ({
            type:
              "ใบเสนอราคา",

            no:
              item.quotation_no,

            project:
              item.project_name,

            total:
              item.grand_total,

            status:
              item.status,

            href:
              `/quotations/${item.id}`,

            created_at:
              item.created_at,
          }));

      const invoiceRows =
        canSeeFinance
          ? invoices
              .slice(0, 4)
              .map(
                (item) => ({
                  type:
                    "ใบแจ้งหนี้",

                  no:
                    item.invoice_no,

                  project:
                    item.project_name,

                  total:
                    item.grand_total,

                  status:
                    item.status,

                  href:
                    `/invoices/${item.id}`,

                  created_at:
                    item.created_at,
                })
              )
          : [];

      const receiptRows =
        canSeeFinance
          ? receipts
              .slice(0, 4)
              .map(
                (item) => ({
                  type:
                    "ใบเสร็จ",

                  no:
                    item.receipt_no,

                  project:
                    item.project_name,

                  total:
                    item.grand_total,

                  status:
                    item.status,

                  href:
                    `/receipts/${item.id}`,

                  created_at:
                    item.created_at,
                })
              )
          : [];

      return [
        ...quotationRows,
        ...invoiceRows,
        ...receiptRows,
      ]
        .sort(
          (a, b) =>
            new Date(
              b.created_at
            ) -
            new Date(
              a.created_at
            )
        )
        .slice(0, 6);
    }, [
      quotations,
      invoices,
      receipts,
      canSeeFinance,
    ]);

  /* =======================================================
     ROLE LOADING
  ======================================================= */

  if (roleLoading) {
    return (
      <div
        style={{
          minHeight:
            "100vh",

          display: "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          background:
            "#f3f4f6",

          color:
            "#111827",

          fontSize:
            "18px",
        }}
      >
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  /* =======================================================
     ROLE ERROR
  ======================================================= */

  if (roleError) {
    return (
      <div
        style={{
          minHeight:
            "100vh",

          display: "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          background:
            "#f3f4f6",

          padding:
            "30px",
        }}
      >
        <div
          style={{
            background:
              "white",

            padding:
              "30px",

            borderRadius:
              "14px",

            width:
              "100%",

            maxWidth:
              "520px",

            boxShadow:
              "0 4px 18px rgba(0,0,0,0.08)",
          }}
        >
          <h2
            style={{
              marginTop: 0,

              color:
                "#dc2626",
            }}
          >
            ตรวจสอบสิทธิ์ไม่สำเร็จ
          </h2>

          <p>
            {roleError}
          </p>

          <p
            style={{
              color:
                "#6b7280",

              fontSize:
                "13px",
            }}
          >
            บัญชี:{" "}
            {email || "-"}
          </p>

          <button
            type="button"
            onClick={
              handleLogout
            }
            style={{
              width:
                "100%",

              marginTop:
                "15px",

              border:
                "none",

              borderRadius:
                "8px",

              padding:
                "12px",

              background:
                "#dc2626",

              color:
                "white",

              cursor:
                "pointer",

              fontWeight:
                "700",
            }}
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  /* =======================================================
     DASHBOARD UI
  ======================================================= */

  return (
    <main
      style={{
        minHeight: "100vh",

        background:
          "#f3f4f6",

        display:
          "grid",

        gridTemplateColumns:
          "240px 1fr",

        color:
          "#111827",
      }}
    >
      {/* ===================================================
          SIDEBAR
      ==================================================== */}

      <aside
        style={{
          background:
            "#111827",

          color:
            "white",

          minHeight:
            "100vh",
            height: "100vh",
overflowY: "auto",
position: "sticky",
top: 0,

          padding:
            "24px 16px",
        }}
      >
        <div
          style={{
            fontSize:
              "20px",

            fontWeight:
              "800",

            marginBottom:
              "6px",
          }}
        >
          SIGN BUSINESS
        </div>

        <div
          style={{
            color:
              "#93c5fd",

            fontSize:
              "13px",
          }}
        >
          Management System
        </div>

        <div
          style={{
            marginTop:
              "8px",

            marginBottom:
              "26px",

            color:
              "#9ca3af",

            fontSize:
              "12px",

            lineHeight:
              "1.6",
          }}
        >
          <div>
            {email}
          </div>

          <div>
            สิทธิ์:{" "}

            <strong
              style={{
                color:
                  "#ffffff",
              }}
            >
              {roleLabel(
                role
              )}
            </strong>
          </div>
        </div>

        <div
          style={{
            display:
              "grid",

            gap:
              "8px",
          }}
        >
          {menu.map(
            (item) => (
              <button
                key={item}
                type="button"
                onClick={() =>
                  handleMenu(
                    item
                  )
                }
                style={{
                  width:
                    "100%",

                  textAlign:
                    "left",

                  border:
                    "none",

                  background:
                    item ===
                    "Dashboard"
                      ? "#1f2937"
                      : item ===
                        "ออกจากระบบ"
                      ? "#991b1b"
                      : "transparent",

                  color:
                    "white",

                  padding:
                    "11px 12px",

                  borderRadius:
                    "8px",

                  cursor:
                    "pointer",

                  fontSize:
                    "14px",

                  fontWeight:
                    item ===
                    "ออกจากระบบ"
                      ? "700"
                      : "500",

                  marginTop:
                    item ===
                    "ออกจากระบบ"
                      ? "10px"
                      : "0",
                }}
              >
                {item}
              </button>
            )
          )}
        </div>
      </aside>

      {/* ===================================================
          CONTENT
      ==================================================== */}

      <section
        style={{
          padding:
            "32px",
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

          <div
            style={{
              marginBottom:
                "24px",
            }}
          >
            <h1
              style={{
                margin:
                  0,

                fontSize:
                  "32px",
              }}
            >
              Dashboard
            </h1>

            <p
              style={{
                color:
                  "#6b7280",

                marginTop:
                  "6px",
              }}
            >
              ภาพรวมระบบ THANEE ADVERTISING
            </p>
          </div>

          {/* =================================================
              SUMMARY
          ================================================== */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",

              gap:
                "16px",

              marginBottom:
                "20px",
            }}
          >
            {canSeeFinance ? (
              <>
                <Card
                  title="ยอดขายรับชำระแล้ว"
                  value={
                    loading
                      ? "..."
                      : `฿${money(
                          totalSales
                        )}`
                  }
                  sub={`${receipts.length} ใบเสร็จ`}
                  color="#15803d"
                />

                <Card
                  title="ลูกหนี้คงค้าง"
                  value={
                    loading
                      ? "..."
                      : `฿${money(
                          accountsReceivable
                        )}`
                  }
                  sub="Invoice รอชำระ"
                  color="#dc2626"
                />
              </>
            ) : (
              <Card
                title="ใบเสนอราคา"
                value={
                  loading
                    ? "..."
                    : `${quotations.length} ใบ`
                }
                sub="เอกสารในระบบ"
                color="#2563eb"
              />
            )}

            <Card
              title="งานที่กำลังดำเนินการ"
              value={
                loading
                  ? "..."
                  : `${activeJobs} งาน`
              }
              sub="Production + QC + ติดตั้ง + ส่งมอบ"
              color="#2563eb"
            />

            <Card
              title="ลูกค้าทั้งหมด"
              value={
                loading
                  ? "..."
                  : `${customers.length} ราย`
              }
              sub={
                canSeeFinance
                  ? `${paidInvoices} Invoice ชำระแล้ว`
                  : `สิทธิ์ ${roleLabel(
                      role
                    )}`
              }
              color="#7c3aed"
            />
          </div>

          {/* =================================================
              DOCUMENT QUICK LINKS
          ================================================== */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",

              gap:
                "16px",

              marginBottom:
                "20px",
            }}
          >
            {menu.includes(
              "ใบเสนอราคา"
            ) && (
              <QuickCard
                title="ใบเสนอราคา"
                value={`${quotations.length} ใบ`}
                button="ดูใบเสนอราคา"
                onClick={() =>
                  router.push(
                    "/quotations/list"
                  )
                }
              />
            )}

            {menu.includes(
              "ใบแจ้งหนี้"
            ) && (
              <QuickCard
                title="ใบแจ้งหนี้"
                value={`${invoices.length} ใบ`}
                button="ดูใบแจ้งหนี้"
                onClick={() =>
                  router.push(
                    "/invoices/list"
                  )
                }
              />
            )}

            {menu.includes(
              "ใบเสร็จรับเงิน"
            ) && (
              <QuickCard
                title="ใบเสร็จรับเงิน"
                value={`${receipts.length} ใบ`}
                button="ดูใบเสร็จ"
                onClick={() =>
                  router.push(
                    "/receipts/list"
                  )
                }
              />
            )}
          </div>

          {/* =================================================
              WORKFLOW
          ================================================== */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",

              gap:
                "12px",

              marginBottom:
                "20px",
            }}
          >
            {menu.includes(
              "งานผลิต"
            ) && (
              <WorkflowCard
                title="งานผลิต"
                button="เปิดงานผลิต"
                onClick={() =>
                  router.push(
                    "/production"
                  )
                }
              />
            )}

            {menu.includes(
              "QC ตรวจสอบงาน"
            ) && (
              <WorkflowCard
                title="QC"
                button="ตรวจสอบ QC"
                onClick={() =>
                  router.push(
                    "/qc"
                  )
                }
              />
            )}

            {menu.includes(
              "งานติดตั้ง"
            ) && (
              <WorkflowCard
                title="งานติดตั้ง"
                button="เปิดงานติดตั้ง"
                onClick={() =>
                  router.push(
                    "/installation"
                  )
                }
              />
            )}

            {menu.includes(
              "ส่งมอบ / ปิดงาน"
            ) && (
              <WorkflowCard
                title="ส่งมอบ / ปิดงาน"
                button="เปิดส่งมอบ"
                onClick={() =>
                  router.push(
                    "/delivery"
                  )
                }
              />
            )}

            {menu.includes(
              "การเงิน"
            ) && (
              <WorkflowCard
                title="การเงิน"
                button="เปิดการเงิน"
                onClick={() =>
                  router.push(
                    "/finance"
                  )
                }
              />
            )}
          </div>

          {/* =================================================
              RECENT
          ================================================== */}

          <div
            style={{
              background:
                "white",

              borderRadius:
                "12px",

              overflow:
                "hidden",

              boxShadow:
                "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                padding:
                  "18px 20px",

                borderBottom:
                  "1px solid #e5e7eb",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",
              }}
            >
              <h2
                style={{
                  margin:
                    0,

                  fontSize:
                    "18px",
                }}
              >
                รายการล่าสุด
              </h2>

              <span
                style={{
                  fontSize:
                    "12px",

                  color:
                    "#6b7280",
                }}
              >
                {roleLabel(
                  role
                )}
              </span>
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
                    "850px",
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
                      ประเภท
                    </th>

                    <th style={th}>
                      เลขที่
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
                      ยอดเงิน
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
                        colSpan={5}
                        style={empty}
                      >
                        กำลังโหลด...
                      </td>
                    </tr>
                  ) : recentItems.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={empty}
                      >
                        ยังไม่มีข้อมูล
                      </td>
                    </tr>
                  ) : (
                    recentItems.map(
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
                          <td
                            style={td}
                          >
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

                          <td
                            style={td}
                          >
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
                            {canSeeFinance
                              ? `฿${money(
                                  item.total
                                )}`
                              : "-"}
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
          </div>
        </div>
      </section>
    </main>
  );
}

/* =========================================================
   CARD
========================================================= */

function Card({
  title,
  value,
  sub,
  color,
}) {
  return (
    <div
      style={{
        background:
          "white",

        padding:
          "20px",

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

          color,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop:
            "6px",

          color:
            "#9ca3af",

          fontSize:
            "12px",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

/* =========================================================
   QUICK CARD
========================================================= */

function QuickCard({
  title,
  value,
  button,
  onClick,
}) {
  return (
    <div
      style={{
        background:
          "white",

        padding:
          "20px",

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
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop:
            "8px",

          fontSize:
            "24px",

          fontWeight:
            "700",
        }}
      >
        {value}
      </div>

      <button
        type="button"
        onClick={onClick}
        style={{
          marginTop:
            "14px",

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
            "600",
        }}
      >
        {button}
      </button>
    </div>
  );
}

/* =========================================================
   WORKFLOW CARD
========================================================= */

function WorkflowCard({
  title,
  button,
  onClick,
}) {
  return (
    <div
      style={{
        background:
          "white",

        padding:
          "16px",

        borderRadius:
          "12px",

        boxShadow:
          "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontWeight:
            "700",

          fontSize:
            "16px",
        }}
      >
        {title}
      </div>

      <button
        type="button"
        onClick={onClick}
        style={{
          marginTop:
            "12px",

          width:
            "100%",

          padding:
            "9px 10px",

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
            "600",
        }}
      >
        {button}
      </button>
    </div>
  );
}

/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({
  value,
}) {
  let label =
    value || "-";

  let background =
    "#f3f4f6";

  let color =
    "#374151";

  if (
    value === "paid"
  ) {
    label =
      "ชำระแล้ว";

    background =
      "#dcfce7";

    color =
      "#15803d";
  }

  if (
    value ===
    "pending"
  ) {
    label =
      "รอชำระ";

    background =
      "#fef3c7";

    color =
      "#b45309";
  }

  if (
    value ===
    "received"
  ) {
    label =
      "รับชำระแล้ว";

    background =
      "#dcfce7";

    color =
      "#15803d";
  }

  if (
    value ===
    "approved"
  ) {
    label =
      "อนุมัติ";

    background =
      "#dcfce7";

    color =
      "#15803d";
  }

  if (
    value === "sent"
  ) {
    label =
      "ส่งแล้ว";

    background =
      "#dbeafe";

    color =
      "#1d4ed8";
  }

  if (
    value === "draft"
  ) {
    label =
      "แบบร่าง";
  }

  if (
    value ===
    "rejected"
  ) {
    label =
      "ปฏิเสธ";

    background =
      "#fee2e2";

    color =
      "#b91c1c";
  }

  if (
    value ===
    "cancelled"
  ) {
    label =
      "ยกเลิก";

    background =
      "#fee2e2";

    color =
      "#b91c1c";
  }

  return (
    <span
      style={{
        display:
          "inline-block",

        padding:
          "5px 9px",

        borderRadius:
          "999px",

        background,

        color,

        fontWeight:
          "700",

        fontSize:
          "12px",
      }}
    >
      {label}
    </span>
  );
}

/* =========================================================
   TABLE STYLE
========================================================= */

const th = {
  padding:
    "13px 14px",

  textAlign:
    "left",

  fontSize:
    "13px",

  color:
    "#374151",
};

const td = {
  padding:
    "13px 14px",

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