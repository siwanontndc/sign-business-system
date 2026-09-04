"use client";

import { usePathname, useRouter } from "next/navigation";

export default function HomeButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/login") return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/")}
      aria-label="กลับหน้าหลัก"
      title="กลับหน้าหลัก"
      style={{
        position: "fixed",
        left: 18,
        bottom: 18,
        zIndex: 10000,
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 14,
        background: "#111827",
        color: "white",
        padding: "11px 15px",
        fontSize: 14,
        fontWeight: 800,
        boxShadow: "0 8px 24px rgba(17,24,39,.22)",
        cursor: "pointer",
      }}
    >
      🏠 หน้าหลัก
    </button>
  );
}
