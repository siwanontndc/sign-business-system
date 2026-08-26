"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleLogin(e) {
        e.preventDefault();

        setLoading(true);
        setError("");

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
            setLoading(false);
            return;
        }

        router.push("/");
        router.refresh();
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f3f4f6",
                padding: "20px",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "420px",
                    background: "white",
                    padding: "40px",
                    borderRadius: "16px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontSize: "30px",
                        color: "#111827",
                    }}
                >
                    SIGN BUSINESS
                </h1>

                <p
                    style={{
                        color: "#6b7280",
                        marginTop: "8px",
                        marginBottom: "30px",
                    }}
                >
                    Management System
                </p>

                <form onSubmit={handleLogin}>
                    <label
                        style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: "600",
                        }}
                    >
                        อีเมล
                    </label>

                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="กรอกอีเมล"
                        style={{
                            width: "100%",
                            padding: "12px",
                            marginBottom: "20px",
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "16px",
                            boxSizing: "border-box",
                        }}
                    />

                    <label
                        style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: "600",
                        }}
                    >
                        รหัสผ่าน
                    </label>

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="กรอกรหัสผ่าน"
                        style={{
                            width: "100%",
                            padding: "12px",
                            marginBottom: "20px",
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "16px",
                            boxSizing: "border-box",
                        }}
                    />

                    {error && (
                        <p
                            style={{
                                color: "#dc2626",
                                marginBottom: "15px",
                            }}
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: "100%",
                            padding: "13px",
                            border: "none",
                            borderRadius: "8px",
                            background: "#2563eb",
                            color: "white",
                            fontSize: "16px",
                            fontWeight: "600",
                            cursor: "pointer",
                        }}
                    >
                        {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                    </button>
                </form>
            </div>
        </main>
    );
}