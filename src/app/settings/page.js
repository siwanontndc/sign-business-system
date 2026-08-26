"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const ROLES = [
  {
    value: "owner",
    label: "เจ้าของระบบ",
  },
  {
    value: "staff",
    label: "พนักงาน",
  },
  {
    value: "finance",
    label: "การเงิน",
  },
  {
    value: "production",
    label: "ฝ่ายผลิต",
  },
];

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const [profiles, setProfiles] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    try {
      setLoading(true);
      setMessage("");
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.replace("/login");
        return;
      }

      setCurrentUserId(user.id);

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          `
            id,
            email,
            full_name,
            role,
            created_at,
            updated_at
          `
        )
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      setProfiles(data || []);
    } catch (error) {
      console.error(
        "LOAD PROFILES ERROR:",
        error
      );

      setErrorMessage(
        error?.message ||
          "โหลดข้อมูลผู้ใช้งานไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(profile, newRole) {
    /*
      ป้องกัน Owner เปลี่ยน Role ตัวเองโดยไม่ได้ตั้งใจ
      เพราะอาจล็อกตัวเองออกจาก Settings
    */
    if (profile.id === currentUserId) {
      alert(
        "ไม่อนุญาตให้เปลี่ยนสิทธิ์บัญชีที่กำลังใช้งานอยู่"
      );
      return;
    }

    const roleInfo = ROLES.find(
      (item) => item.value === newRole
    );

    const confirmed = window.confirm(
      `เปลี่ยนสิทธิ์\n\n${profile.email}\n\nเป็น "${roleInfo?.label || newRole}" ใช่หรือไม่?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setSavingId(profile.id);
      setMessage("");
      setErrorMessage("");

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .update({
          role: newRole,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)
        .select(
          `
            id,
            email,
            full_name,
            role,
            created_at,
            updated_at
          `
        )
        .single();

      if (error) {
        throw error;
      }

      setProfiles((oldProfiles) =>
        oldProfiles.map((item) =>
          item.id === profile.id
            ? data
            : item
        )
      );

      setMessage(
        `เปลี่ยนสิทธิ์ ${profile.email} เป็น ${roleInfo?.label || newRole} เรียบร้อยแล้ว`
      );
    } catch (error) {
      console.error(
        "UPDATE ROLE ERROR:",
        error
      );

      setErrorMessage(
        error?.message ||
          "เปลี่ยนสิทธิ์ไม่สำเร็จ"
      );
    } finally {
      setSavingId(null);
    }
  }

  function roleLabel(value) {
    return (
      ROLES.find(
        (item) => item.value === value
      )?.label || value
    );
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    return new Intl.DateTimeFormat(
      "th-TH",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(value));
  }

  const summary = useMemo(() => {
    return {
      total: profiles.length,

      owner: profiles.filter(
        (item) =>
          item.role === "owner"
      ).length,

      staff: profiles.filter(
        (item) =>
          item.role === "staff"
      ).length,

      finance: profiles.filter(
        (item) =>
          item.role === "finance"
      ).length,

      production: profiles.filter(
        (item) =>
          item.role === "production"
      ).length,
    };
  }, [profiles]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        color: "#111827",
        padding: "32px",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "32px",
              }}
            >
              ตั้งค่าระบบ
            </h1>

            <p
              style={{
                marginTop: "6px",
                marginBottom: 0,
                color: "#6b7280",
              }}
            >
              จัดการผู้ใช้งานและสิทธิ์การเข้าถึงระบบ
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "11px 16px",
              background: "white",
              color: "#111827",
              cursor: "pointer",
              fontWeight: "700",
            }}
          >
            ← Dashboard
          </button>
        </div>

        {/* SUMMARY */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <SummaryCard
            title="ผู้ใช้ทั้งหมด"
            value={`${summary.total} คน`}
          />

          <SummaryCard
            title="เจ้าของระบบ"
            value={`${summary.owner} คน`}
          />

          <SummaryCard
            title="พนักงาน"
            value={`${summary.staff} คน`}
          />

          <SummaryCard
            title="การเงิน"
            value={`${summary.finance} คน`}
          />

          <SummaryCard
            title="ฝ่ายผลิต"
            value={`${summary.production} คน`}
          />
        </div>

        {/* MESSAGE */}

        {message && (
          <div
            style={{
              background: "#dcfce7",
              color: "#166534",
              border: "1px solid #86efac",
              borderRadius: "8px",
              padding: "12px 15px",
              marginBottom: "16px",
            }}
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              padding: "12px 15px",
              marginBottom: "16px",
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* TABLE */}

        <div
          style={{
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderBottom:
                "1px solid #e5e7eb",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "19px",
              }}
            >
              ผู้ใช้งานระบบ
            </h2>

            <button
              type="button"
              onClick={loadProfiles}
              disabled={loading}
              style={{
                border:
                  "1px solid #d1d5db",
                borderRadius: "7px",
                background: "white",
                padding: "8px 12px",
                cursor: loading
                  ? "not-allowed"
                  : "pointer",
                fontWeight: "600",
              }}
            >
              รีเฟรช
            </button>
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
                minWidth: "900px",
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
                    ผู้ใช้งาน
                  </th>

                  <th style={th}>
                    ชื่อ
                  </th>

                  <th style={th}>
                    สิทธิ์ปัจจุบัน
                  </th>

                  <th style={th}>
                    วันที่สร้าง
                  </th>

                  <th style={th}>
                    จัดการสิทธิ์
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
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : profiles.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={empty}
                    >
                      ยังไม่มีผู้ใช้งาน
                    </td>
                  </tr>
                ) : (
                  profiles.map(
                    (profile) => {
                      const isMe =
                        profile.id ===
                        currentUserId;

                      return (
                        <tr
                          key={
                            profile.id
                          }
                          style={{
                            borderTop:
                              "1px solid #e5e7eb",
                          }}
                        >
                          <td style={td}>
                            <div
                              style={{
                                fontWeight:
                                  "700",
                              }}
                            >
                              {profile.email ||
                                "-"}
                            </div>

                            {isMe && (
                              <span
                                style={{
                                  display:
                                    "inline-block",
                                  marginTop:
                                    "5px",
                                  fontSize:
                                    "11px",
                                  fontWeight:
                                    "700",
                                  padding:
                                    "3px 7px",
                                  borderRadius:
                                    "999px",
                                  background:
                                    "#dbeafe",
                                  color:
                                    "#1d4ed8",
                                }}
                              >
                                บัญชีของฉัน
                              </span>
                            )}
                          </td>

                          <td style={td}>
                            {profile.full_name ||
                              "-"}
                          </td>

                          <td style={td}>
                            <RoleBadge
                              role={
                                profile.role
                              }
                            />
                          </td>

                          <td style={td}>
                            {formatDate(
                              profile.created_at
                            )}
                          </td>

                          <td style={td}>
                            <select
                              value={
                                profile.role
                              }
                              disabled={
                                isMe ||
                                savingId ===
                                  profile.id
                              }
                              onChange={(
                                event
                              ) =>
                                changeRole(
                                  profile,
                                  event
                                    .target
                                    .value
                                )
                              }
                              style={{
                                width:
                                  "180px",
                                border:
                                  "1px solid #d1d5db",
                                borderRadius:
                                  "7px",
                                padding:
                                  "9px 10px",
                                background:
                                  isMe
                                    ? "#f3f4f6"
                                    : "white",
                                cursor:
                                  isMe
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              {ROLES.map(
                                (
                                  option
                                ) => (
                                  <option
                                    key={
                                      option.value
                                    }
                                    value={
                                      option.value
                                    }
                                  >
                                    {
                                      option.label
                                    }
                                  </option>
                                )
                              )}
                            </select>

                            {savingId ===
                              profile.id && (
                              <span
                                style={{
                                  marginLeft:
                                    "10px",
                                  color:
                                    "#6b7280",
                                  fontSize:
                                    "12px",
                                }}
                              >
                                กำลังบันทึก...
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: "16px",
            color: "#6b7280",
            fontSize: "13px",
            lineHeight: "1.7",
          }}
        >
          Owner สามารถเปลี่ยนสิทธิ์ผู้ใช้อื่นได้
          แต่ระบบจะไม่อนุญาตให้เปลี่ยนสิทธิ์บัญชี
          Owner ที่กำลังใช้งานอยู่ เพื่อป้องกันการล็อกตัวเองออกจากระบบ
        </div>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "18px",
        boxShadow:
          "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
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
          marginTop: "7px",
          fontSize: "24px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const config = {
    owner: {
      label: "เจ้าของระบบ",
      background: "#ede9fe",
      color: "#6d28d9",
    },

    staff: {
      label: "พนักงาน",
      background: "#dbeafe",
      color: "#1d4ed8",
    },

    finance: {
      label: "การเงิน",
      background: "#dcfce7",
      color: "#15803d",
    },

    production: {
      label: "ฝ่ายผลิต",
      background: "#fef3c7",
      color: "#b45309",
    },
  };

  const item =
    config[role] || {
      label: role || "-",
      background: "#f3f4f6",
      color: "#374151",
    };

  return (
    <span
      style={{
        display:
          "inline-block",
        padding:
          "5px 9px",
        borderRadius:
          "999px",
        background:
          item.background,
        color:
          item.color,
        fontWeight:
          "700",
        fontSize:
          "12px",
      }}
    >
      {item.label}
    </span>
  );
}

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
  verticalAlign: "middle",
};

const empty = {
  padding: "45px",
  textAlign: "center",
  color: "#6b7280",
};