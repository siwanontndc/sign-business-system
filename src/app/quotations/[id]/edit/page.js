"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  boxSizing: "border-box",
};

const primaryButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  fontWeight: "600",
  cursor: "pointer",
};

const secondaryButton = {
  padding: "11px 18px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#374151",
  fontWeight: "600",
  cursor: "pointer",
};

function createItem(data = {}) {
  return {
    clientId: `${Date.now()}-${Math.random()}`,
    description: data.description || "",
    width: data.width ?? "",
    height: data.height ?? "",
    quantity: data.quantity ?? 1,
    unit: data.unit || "ตร.ม.",
    unit_price: data.unit_price ?? 0,
  };
}

function calculateArea(item) {
  const widthCm = Number(item.width || 0);
  const heightCm = Number(item.height || 0);

  if (widthCm <= 0 || heightCm <= 0) {
    return 0;
  }

  return (widthCm / 100) * (heightCm / 100);
}

function calculateLineTotal(item) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unit_price || 0);

  if (item.unit === "ตร.ม.") {
    const area = calculateArea(item);
    return area * quantity * unitPrice;
  }

  return quantity * unitPrice;
}

function toDateInputValue(value) {
  if (!value) return "";

  return String(value).slice(0, 10);
}

export default function EditQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [quotation, setQuotation] = useState({
    quotation_no: "",
    customer_id: "",
    project_name: "",
    quotation_date: "",
    valid_days: 30,
    discount: 0,
    vat_percent: 7,
    note: "",
    status: "draft",
  });

  const [items, setItems] = useState([createItem()]);

  useEffect(() => {
    async function loadPage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const [quotationResult, itemsResult, customersResult] =
        await Promise.all([
          supabase.from("quotations").select("*").eq("id", id).single(),
          supabase
            .from("quotation_items")
            .select("*")
            .eq("quotation_id", id)
            .order("created_at", { ascending: true }),
          supabase
            .from("customers")
            .select("id, customer_code, company_name, contact_name")
            .order("created_at", { ascending: false }),
        ]);

      if (quotationResult.error) {
        console.error(quotationResult.error);
        alert("โหลดใบเสนอราคาไม่สำเร็จ: " + quotationResult.error.message);
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (itemsResult.error) {
        console.error(itemsResult.error);
        alert("โหลดรายการงานไม่สำเร็จ: " + itemsResult.error.message);
        setLoading(false);
        return;
      }

      if (customersResult.error) {
        console.error(customersResult.error);
        alert("โหลดข้อมูลลูกค้าไม่สำเร็จ: " + customersResult.error.message);
      } else {
        setCustomers(customersResult.data || []);
      }

      const quotationData = quotationResult.data;

      setQuotation({
        quotation_no: quotationData.quotation_no || "",
        customer_id: quotationData.customer_id || "",
        project_name: quotationData.project_name || "",
        quotation_date: toDateInputValue(quotationData.quotation_date),
        valid_days: quotationData.valid_days ?? 30,
        discount: quotationData.discount ?? 0,
        vat_percent: quotationData.vat_percent ?? 7,
        note: quotationData.note || "",
        status: quotationData.status || "draft",
      });

      const loadedItems = itemsResult.data || [];

      setItems(
        loadedItems.length > 0
          ? loadedItems.map((item) => createItem(item))
          : [createItem()]
      );

      setLoading(false);
    }

    if (id) {
      loadPage();
    }
  }, [id, router]);

  function addItem() {
    setItems((prev) => [...prev, createItem()]);
  }

  function updateItem(clientId, field, value) {
    setItems((prev) =>
      prev.map((item) =>
        item.clientId === clientId
          ? {
              ...item,
              [field]:
                field === "quantity" || field === "unit_price"
                  ? Number(value)
                  : value,
            }
          : item
      )
    );
  }

  function removeItem(clientId) {
    if (items.length === 1) {
      alert("ใบเสนอราคาต้องมีอย่างน้อย 1 รายการ");
      return;
    }

    setItems((prev) => prev.filter((item) => item.clientId !== clientId));
  }

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  }, [items]);

  const discount = Number(quotation.discount || 0);
  const afterDiscount = Math.max(subtotal - discount, 0);
  const vatAmount =
    afterDiscount * (Number(quotation.vat_percent || 0) / 100);
  const grandTotal = afterDiscount + vatAmount;

  function formatMoney(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatArea(value) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  async function handleSave() {
    if (saving) return;

    if (!quotation.customer_id) {
      alert("กรุณาเลือกลูกค้า");
      return;
    }

    if (!quotation.project_name.trim()) {
      alert("กรุณากรอกชื่อโครงการ / ชื่องาน");
      return;
    }

    const invalidItem = items.some(
      (item) => !item.description.trim() || Number(item.quantity) <= 0
    );

    if (invalidItem) {
      alert("กรุณากรอกรายการงานและจำนวนให้ครบ");
      return;
    }

    setSaving(true);

    try {
      const { error: quotationError } = await supabase
        .from("quotations")
        .update({
          customer_id: quotation.customer_id,
          project_name: quotation.project_name,
          quotation_date: quotation.quotation_date,
          valid_days: Number(quotation.valid_days || 30),
          subtotal,
          discount,
          vat_percent: Number(quotation.vat_percent || 0),
          vat_amount: vatAmount,
          grand_total: grandTotal,
          note: quotation.note || "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (quotationError) {
        throw quotationError;
      }

      const { error: deleteError } = await supabase
        .from("quotation_items")
        .delete()
        .eq("quotation_id", id);

      if (deleteError) {
        throw deleteError;
      }

      const itemRows = items.map((item) => ({
        quotation_id: id,
        description: item.description,
        width: item.width || null,
        height: item.height || null,
        quantity: Number(item.quantity || 0),
        unit: item.unit,
        unit_price: Number(item.unit_price || 0),
        line_total: calculateLineTotal(item),
      }));

      const { error: itemsError } = await supabase
        .from("quotation_items")
        .insert(itemRows);

      if (itemsError) {
        throw itemsError;
      }

      router.push(`/quotations/${id}`);
    } catch (error) {
      console.error(error);
      alert(
        "บันทึกการแก้ไขไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด")
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
        }}
      >
        กำลังโหลด...
      </main>
    );
  }

  if (notFound) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p>ไม่พบใบเสนอราคา</p>
          <button
            type="button"
            onClick={() => router.push("/quotations/list")}
            style={{ ...secondaryButton, marginTop: "12px" }}
          >
            ← กลับรายการ
          </button>
        </div>
      </main>
    );
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "32px" }}>แก้ไขใบเสนอราคา</h1>
            <p style={{ marginTop: "6px", color: "#6b7280" }}>
              แก้ไขข้อมูลใบเสนอราคา {quotation.quotation_no}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/quotations/${id}`)}
            style={secondaryButton}
          >
            ← ยกเลิก
          </button>
        </div>

        <section
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>ข้อมูลใบเสนอราคา</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <label>เลขที่ใบเสนอราคา</label>
              <input
                value={quotation.quotation_no}
                readOnly
                style={{
                  ...inputStyle,
                  marginTop: "6px",
                  background: "#f9fafb",
                }}
              />
            </div>

            <div>
              <label>วันที่เสนอราคา</label>
              <input
                type="date"
                value={quotation.quotation_date}
                onChange={(e) =>
                  setQuotation({
                    ...quotation,
                    quotation_date: e.target.value,
                  })
                }
                style={{
                  ...inputStyle,
                  marginTop: "6px",
                }}
              />
            </div>

            <div>
              <label>ยืนราคา</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "6px",
                }}
              >
                <input
                  type="number"
                  min="1"
                  value={quotation.valid_days}
                  onChange={(e) =>
                    setQuotation({
                      ...quotation,
                      valid_days: Number(e.target.value),
                    })
                  }
                  style={inputStyle}
                />
                <span>วัน</span>
              </div>
            </div>

            <div>
              <label>ลูกค้า *</label>
              <select
                value={quotation.customer_id}
                onChange={(e) =>
                  setQuotation({
                    ...quotation,
                    customer_id: e.target.value,
                  })
                }
                style={{
                  ...inputStyle,
                  marginTop: "6px",
                }}
              >
                <option value="">-- เลือกลูกค้า --</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_code} -{" "}
                    {customer.company_name || customer.contact_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label>ชื่อโครงการ / ชื่องาน *</label>
              <input
                value={quotation.project_name}
                onChange={(e) =>
                  setQuotation({
                    ...quotation,
                    project_name: e.target.value,
                  })
                }
                placeholder="เช่น ป้ายหน้าร้าน ABC"
                style={{
                  ...inputStyle,
                  marginTop: "6px",
                }}
              />
            </div>
          </div>
        </section>

        <section
          style={{
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>รายการงาน</h2>
              <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
                กรอกขนาดเป็นเซนติเมตร ระบบจะคำนวณพื้นที่ให้อัตโนมัติ
              </p>
            </div>

            <button type="button" onClick={addItem} style={primaryButton}>
              + เพิ่มรายการ
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "1250px",
              }}
            >
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ padding: "12px" }}>#</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>
                    รายละเอียด
                  </th>
                  <th style={{ padding: "12px" }}>กว้าง (ซม.)</th>
                  <th style={{ padding: "12px" }}>สูง (ซม.)</th>
                  <th style={{ padding: "12px" }}>พื้นที่</th>
                  <th style={{ padding: "12px" }}>จำนวน</th>
                  <th style={{ padding: "12px" }}>หน่วย</th>
                  <th style={{ padding: "12px" }}>ราคาต่อหน่วย</th>
                  <th style={{ padding: "12px" }}>รวม</th>
                  <th style={{ padding: "12px" }}>จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => {
                  const area = calculateArea(item);
                  const lineTotal = calculateLineTotal(item);

                  return (
                    <tr
                      key={item.clientId}
                      style={{ borderTop: "1px solid #e5e7eb" }}
                    >
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {index + 1}
                      </td>

                      <td style={{ padding: "12px" }}>
                        <input
                          value={item.description}
                          onChange={(e) =>
                            updateItem(
                              item.clientId,
                              "description",
                              e.target.value
                            )
                          }
                          placeholder="เช่น ป้ายตัวอักษรสแตนเลส"
                          style={inputStyle}
                        />
                      </td>

                      <td style={{ padding: "12px" }}>
                        <input
                          type="number"
                          min="0"
                          value={item.width}
                          onChange={(e) =>
                            updateItem(item.clientId, "width", e.target.value)
                          }
                          placeholder="100"
                          style={inputStyle}
                        />
                      </td>

                      <td style={{ padding: "12px" }}>
                        <input
                          type="number"
                          min="0"
                          value={item.height}
                          onChange={(e) =>
                            updateItem(item.clientId, "height", e.target.value)
                          }
                          placeholder="200"
                          style={inputStyle}
                        />
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatArea(area)} ตร.ม.
                      </td>

                      <td style={{ padding: "12px" }}>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              item.clientId,
                              "quantity",
                              e.target.value
                            )
                          }
                          style={inputStyle}
                        />
                      </td>

                      <td style={{ padding: "12px" }}>
                        <select
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(item.clientId, "unit", e.target.value)
                          }
                          style={inputStyle}
                        >
                          <option>ตร.ม.</option>
                          <option>งาน</option>
                          <option>ชิ้น</option>
                          <option>ชุด</option>
                          <option>ตัว</option>
                          <option>เมตร</option>
                        </select>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <input
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) =>
                            updateItem(
                              item.clientId,
                              "unit_price",
                              e.target.value
                            )
                          }
                          style={inputStyle}
                        />
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          textAlign: "right",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ฿{formatMoney(lineTotal)}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeItem(item.clientId)}
                          style={{
                            padding: "8px 10px",
                            border: "none",
                            borderRadius: "6px",
                            background: "#dc2626",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 420px",
            gap: "20px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>หมายเหตุ / เงื่อนไข</h2>
            <textarea
              rows="8"
              value={quotation.note}
              onChange={(e) =>
                setQuotation({
                  ...quotation,
                  note: e.target.value,
                })
              }
              placeholder="เช่น มัดจำ 50% ก่อนเริ่มผลิต ระยะเวลาผลิต 15 วัน"
              style={{
                ...inputStyle,
                resize: "vertical",
              }}
            />
          </div>

          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>สรุปราคา</h2>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}
            >
              <span>subtotal</span>
              <strong>฿{formatMoney(subtotal)}</strong>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px",
                gap: "12px",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <span>discount</span>
              <input
                type="number"
                min="0"
                value={quotation.discount}
                onChange={(e) =>
                  setQuotation({
                    ...quotation,
                    discount: Number(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px",
                gap: "12px",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <span>vat_percent</span>
              <input
                type="number"
                min="0"
                value={quotation.vat_percent}
                onChange={(e) =>
                  setQuotation({
                    ...quotation,
                    vat_percent: Number(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}
            >
              <span>vat_amount</span>
              <strong>฿{formatMoney(vatAmount)}</strong>
            </div>

            <hr
              style={{
                border: 0,
                borderTop: "1px solid #e5e7eb",
                margin: "18px 0",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "22px",
              }}
            >
              <strong>grand_total</strong>
              <strong style={{ color: "#2563eb" }}>
                ฿{formatMoney(grandTotal)}
              </strong>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={() => router.push(`/quotations/${id}`)}
                style={secondaryButton}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...primaryButton,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
