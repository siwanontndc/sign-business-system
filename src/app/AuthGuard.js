"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

/*
  สิทธิ์เข้าแต่ละหน้า

  owner      = เข้าได้ทั้งหมด
  staff      = งานทั่วไป
  finance    = การเงิน
  production = ฝ่ายผลิต
*/

const ACCESS_RULES = [
  {
    path: "/customers",
    roles: ["owner", "staff"],
  },

  {
    path: "/quotations",
    roles: ["owner", "staff"],
  },

  {
    path: "/invoices",
    roles: ["owner", "finance"],
  },

  {
    path: "/receipts",
    roles: ["owner", "finance"],
  },

  {
    path: "/finance",
    roles: ["owner", "finance"],
  },

  {
    path: "/reports",
    roles: ["owner", "finance"],
  },

  {
    path: "/settings",
    roles: ["owner"],
  },

  {
    path: "/production",
    roles: [
      "owner",
      "staff",
      "production",
    ],
  },

  {
    path: "/qc",
    roles: [
      "owner",
      "staff",
      "production",
    ],
  },

  {
    path: "/installation",
    roles: [
      "owner",
      "staff",
      "production",
    ],
  },

  {
    path: "/delivery",
    roles: [
      "owner",
      "staff",
      "production",
    ],
  },
];

const VALID_ROLES = [
  "owner",
  "staff",
  "finance",
  "production",
];

export default function AuthGuard({
  children,
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] =
    useState(true);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        /*
          หน้า Login ไม่ต้องตรวจสิทธิ์
        */

        if (
          pathname === "/login" ||
          pathname.startsWith(
            "/login/"
          )
        ) {
          if (active) {
            setChecking(false);
          }

          return;
        }

        if (active) {
          setChecking(true);
          setMessage("");
        }

        /*
          1. ตรวจว่า Login หรือยัง
        */

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          window.location.replace(
            "/login"
          );

          return;
        }

        /*
          2. อ่าน role
          ใช้ RPC ที่เราสร้างไว้
        */

        let currentRole = null;

        const {
          data: rpcRole,
          error: rpcError,
        } = await supabase.rpc(
          "current_user_role"
        );

        if (
          !rpcError &&
          rpcRole
        ) {
          const normalized =
            String(rpcRole)
              .trim()
              .toLowerCase();

          if (
            VALID_ROLES.includes(
              normalized
            )
          ) {
            currentRole =
              normalized;
          }
        }

        /*
          3. ถ้า RPC ไม่ได้
          อ่าน profiles ด้วย user.id
        */

        if (!currentRole) {
          const {
            data: profile,
            error: profileError,
          } = await supabase
            .from("profiles")
            .select("role")
            .eq(
              "id",
              user.id
            )
            .maybeSingle();

          if (
            profileError
          ) {
            console.error(
              "PROFILE ROLE ERROR:",
              profileError
            );
          }

          if (
            profile?.role
          ) {
            const normalized =
              String(
                profile.role
              )
                .trim()
                .toLowerCase();

            if (
              VALID_ROLES.includes(
                normalized
              )
            ) {
              currentRole =
                normalized;
            }
          }
        }

        /*
          4. ถ้ายังหา role ไม่เจอ
          ไม่อนุญาต
        */

        if (!currentRole) {
          if (active) {
            setMessage(
              "ไม่พบสิทธิ์ของบัญชีนี้"
            );

            setChecking(false);
          }

          return;
        }

        /*
          5. Owner เข้าได้ทุกหน้า
        */

        if (
          currentRole === "owner"
        ) {
          if (active) {
            setChecking(false);
          }

          return;
        }

        /*
          6. Dashboard /
          ทุก role เข้าได้
        */

        if (pathname === "/") {
          if (active) {
            setChecking(false);
          }

          return;
        }

        /*
          7. หา Rule ตาม URL

          startsWith ทำให้:
          /invoices
          /invoices/list
          /invoices/xxxx

          ใช้ Rule เดียวกันทั้งหมด
        */

        const matchedRule =
          ACCESS_RULES.find(
            (rule) =>
              pathname ===
                rule.path ||
              pathname.startsWith(
                `${rule.path}/`
              )
          );

        /*
          ถ้าเป็น route ที่ไม่ได้กำหนด
          ปลอดภัยไว้ก่อน:
          เฉพาะ owner

          แต่ owner ผ่านไปแล้วด้านบน
        */

        if (!matchedRule) {
          console.warn(
            "ไม่มี Access Rule สำหรับ:",
            pathname
          );

          window.location.replace(
            "/"
          );

          return;
        }

        /*
          8. ตรวจ Role
        */

        const allowed =
          matchedRule.roles.includes(
            currentRole
          );

        if (!allowed) {
          console.warn(
            `ACCESS DENIED: ${currentRole} -> ${pathname}`
          );

          window.location.replace(
            "/"
          );

          return;
        }

        /*
          ผ่าน
        */

        if (active) {
          setChecking(false);
        }
      } catch (error) {
        console.error(
          "AUTH GUARD ERROR:",
          error
        );

        if (active) {
          setMessage(
            "ตรวจสอบสิทธิ์ไม่สำเร็จ"
          );

          setChecking(false);
        }
      }
    }

    checkAccess();

    return () => {
      active = false;
    };
  }, [pathname]);

  /*
    Login แสดงได้ทันที
  */

  if (
    pathname === "/login" ||
    pathname.startsWith("/login/")
  ) {
    return children;
  }

  /*
    Loading
  */

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
          color: "#111827",
          fontSize: "18px",
        }}
      >
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  /*
    Error
  */

  if (message) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
          padding: "30px",
        }}
      >
        <div
          style={{
            background: "white",
            padding: "30px",
            borderRadius: "12px",
            maxWidth: "500px",
            width: "100%",
            boxShadow:
              "0 4px 18px rgba(0,0,0,0.08)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              color: "#dc2626",
            }}
          >
            ไม่สามารถเข้าใช้งานได้
          </h2>

          <p>{message}</p>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();

              window.location.replace(
                "/login"
              );
            }}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              borderRadius: "8px",
              background: "#dc2626",
              color: "white",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  return children;
}