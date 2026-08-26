"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    customer_code: "",
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    async function loadCustomers() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error) {
        setCustomers(data || []);
      }

      setLoading(false);
    }

    loadCustomers();
  }, [router]);

  function resetForm() {
    setForm({
      customer_code: "",
      company_name: "",
      contact_name: "",
      phone: "",
      email: "",
    });

    setEditingId(null);
    setShowForm(false);
  }

  async function handleSaveCustomer() {
    if (!form.customer_code || !form.contact_name) {
      alert("กรุณากรอกรหัสลูกค้าและชื่อผู้ติดต่อ");
      return;
    }

    if (editingId) {
      const { data, error } = await supabase
        .from("customers")
        .update(form)
        .eq("id", editingId)
        .select();

      if (error) {
        alert("แก้ไขไม่สำเร็จ: " + error.message);
        return;
      }

      setCustomers((prev) =>
        prev.map((item) =>
          item.id === editingId ? data[0] : item
        )
      );

      resetForm();
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .insert([form])
      .select();

    if (error) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }

    setCustomers((prev) => [data[0], ...prev]);
    resetForm();
  }

  function handleEditCustomer(customer) {
    setForm({
      customer_code: customer.customer_code || "",
      company_name: customer.company_name || "",
      contact_name: customer.contact_name || "",
      phone: customer.phone || "",
      email: customer.email || "",
    });

    setEditingId(customer.id);
    setShowForm(true);
  }

  async function handleDeleteCustomer(id) {
    const ok = confirm("ต้องการลบลูกค้ารายนี้ใช่หรือไม่?");
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
      return;
    }

    setCustomers((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <main
      style={{
        padding: "32px",
        background: "#f3f4f6",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", margin: 0 }}>ลูกค้า</h1>
            <p style={{ color: "#6b7280" }}>
              จัดการข้อมูลลูกค้าของ SIGN BUSINESS
            </p>
          </div>

          <button
            onClick={() => {
              setEditingId(null);
              setForm({
                customer_code: "",
                company_name: "",
                contact_name: "",
                phone: "",
                email: "",
              });
              setShowForm(true);
            }}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "12px 18px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            + เพิ่มลูกค้า
          </button>
        </div>

        {showForm && (
          <div
            style={{
              background: "white",
              padding: "24px",
              borderRadius: "12px",
              marginBottom: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {editingId ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <input
                type="text"
                placeholder="รหัสลูกค้า"
                value={form.customer_code}
                onChange={(e) =>
                  setForm({ ...form, customer_code: e.target.value })
                }
                style={{
                  padding: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                }}
              />

              <input
                type="text"
                placeholder="บริษัท"
                value={form.company_name}
                onChange={(e) =>
                  setForm({ ...form, company_name: e.target.value })
                }
                style={{
                  padding: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                }}
              />

              <input
                type="text"
                placeholder="ชื่อผู้ติดต่อ"
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
                style={{
                  padding: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                }}
              />

              <input
                type="text"
                placeholder="โทรศัพท์"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                style={{
                  padding: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                }}
              />

              <input
                type="email"
                placeholder="อีเมล"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                style={{
                  padding: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  gridColumn: "span 2",
                }}
              />
            </div>

            <button
              onClick={handleSaveCustomer}
              style={{
                padding: "10px 16px",
                marginRight: "10px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              {editingId ? "บันทึกการแก้ไข" : "บันทึกลูกค้า"}
            </button>

            <button
              onClick={resetForm}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                background: "white",
              }}
            >
              ยกเลิก
            </button>
          </div>
        )}

        <div
          style={{
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  รหัสลูกค้า
                </th>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  บริษัท
                </th>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  ผู้ติดต่อ
                </th>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  โทรศัพท์
                </th>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  อีเมล
                </th>
                <th style={{ padding: "14px", textAlign: "left" }}>
                  จัดการ
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      padding: "30px",
                      textAlign: "center",
                    }}
                  >
                    กำลังโหลด...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      padding: "30px",
                      textAlign: "center",
                    }}
                  >
                    ยังไม่มีข้อมูลลูกค้า
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ padding: "14px" }}>
                      {customer.customer_code}
                    </td>
                    <td style={{ padding: "14px" }}>
                      {customer.company_name || "-"}
                    </td>
                    <td style={{ padding: "14px" }}>
                      {customer.contact_name || "-"}
                    </td>
                    <td style={{ padding: "14px" }}>
                      {customer.phone || "-"}
                    </td>
                    <td style={{ padding: "14px" }}>
                      {customer.email || "-"}
                    </td>

                    <td style={{ padding: "14px" }}>
                      <button
                        onClick={() => handleEditCustomer(customer)}
                        style={{
                          padding: "8px 12px",
                          marginRight: "8px",
                          background: "#2563eb",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        แก้ไข
                      </button>

                      <button
                        onClick={() => handleDeleteCustomer(customer.id)}
                        style={{
                          padding: "8px 12px",
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}