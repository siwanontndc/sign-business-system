"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function NewQuotationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);

  const [customerId, setCustomerId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [note, setNote] = useState("");

  const [items, setItems] = useState([
    {
      description: "",
      size: "",
      quantity: 1,
      unit: "งาน",
      unit_price: 0,
      amount: 0,
    },
  ]);

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select(`
        id,
        customer_code,
        company_name,
        contact_name
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      alert(
        "โหลดข้อมูลลูกค้าไม่สำเร็จ: " +
          error.message
      );

      setLoading(false);
      return;
    }

    setCustomers(data || []);
    setLoading(false);
  }

  function customerLabel(customer) {
    const name =
      customer.company_name ||
      customer.contact_name ||
      "ไม่ระบุชื่อ";

    return `${
      customer.customer_code || ""
    } - ${name}`;
  }

  function updateItem(index, field, value) {
    setItems((oldItems) => {
      const next = [...oldItems];

      next[index] = {
        ...next[index],
        [field]: value,
      };

      const qty =
        Number(next[index].quantity) || 0;

      const price =
        Number(next[index].unit_price) || 0;

      next[index].amount =
        qty * price;

      return next;
    });
  }

  function addItem() {
    setItems((oldItems) => [
      ...oldItems,
      {
        description: "",
        size: "",
        quantity: 1,
        unit: "งาน",
        unit_price: 0,
        amount: 0,
      },
    ]);
  }

  function removeItem(index) {
    if (items.length === 1) {
      return;
    }

    setItems((oldItems) =>
      oldItems.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );
  }

  function money(value) {
    return new Intl.NumberFormat(
      "th-TH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(Number(value || 0));
  }

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.amount || 0),
    0
  );

  async function createQuotation() {
    if (saving) return;

    if (!customerId) {
      alert("กรุณาเลือกลูกค้า");
      return;
    }

    if (!projectName.trim()) {
      alert("กรุณากรอกชื่อโครงการ / งาน");
      return;
    }

    const validItems = items.filter(
      (item) =>
        item.description.trim() &&
        Number(item.quantity) > 0
    );

    if (validItems.length === 0) {
      alert(
        "กรุณากรอกรายการสินค้า / บริการอย่างน้อย 1 รายการ"
      );
      return;
    }

    setSaving(true);

    try {
      const now = new Date();

      const year =
        now.getFullYear();

      const random =
        Math.floor(
          100000 +
            Math.random() * 900000
        );

      const quotationNo =
        `QT-${year}-${random}`;

      /*
       * ใช้โครงสร้าง quotations ที่ระบบเดิมใช้อยู่:
       * customer_id
       * quotation_no
       * project_name
       * grand_total
       * status
       * note
       */

      const {
        data: quotation,
        error: quotationError,
      } = await supabase
        .from("quotations")
        .insert({
          customer_id: customerId,
          quotation_no: quotationNo,
          project_name:
            projectName.trim(),
          grand_total: subtotal,
          status: "draft",
          note:
            note.trim() || null,
        })
        .select()
        .single();

      if (quotationError) {
        throw quotationError;
      }

      /*
       * เพิ่มรายการสินค้า
       */

      const quotationItems =
        validItems.map(
          (item, index) => ({
            quotation_id:
              quotation.id,

            description:
              item.description.trim(),

            size:
              item.size.trim() ||
              null,

            quantity:
              Number(
                item.quantity
              ),

            unit:
              item.unit.trim() ||
              "งาน",

            unit_price:
              Number(
                item.unit_price
              ),

            amount:
              Number(
                item.amount
              ),

            sort_order:
              index + 1,
          })
        );

      const {
        error: itemError,
      } = await supabase
        .from("quotation_items")
        .insert(quotationItems);

      if (itemError) {
        /*
         * ถ้า table quotation_items
         * ใช้ชื่อ column ต่างจากนี้
         * quotation หลักยังสร้างแล้ว
         * จะแสดง error ที่ชัดเจน
         */
        throw itemError;
      }

      alert(
        "สร้างใบเสนอราคาเรียบร้อยแล้ว\n" +
          quotationNo
      );

      router.push(
        `/quotations/${quotation.id}`
      );
    } catch (error) {
      console.error(
        "create quotation:",
        error
      );

      alert(
        "สร้างใบเสนอราคาไม่สำเร็จ: " +
          (error?.message ||
            "เกิดข้อผิดพลาด")
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={loadingStyle}>
            กำลังโหลดข้อมูล...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        {/* HEADER */}

        <div style={headerStyle}>
          <div>
            <h1 style={titleStyle}>
              สร้างใบเสนอราคา
            </h1>

            <p style={subtitleStyle}>
              สร้างใบเสนอราคาใหม่
              จากข้อมูลลูกค้า
            </p>
          </div>

          <div style={buttonRow}>
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/quotations/list"
                )
              }
              style={secondaryButton}
            >
              ← รายการใบเสนอราคา
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/")
              }
              style={secondaryButton}
            >
              Dashboard
            </button>
          </div>
        </div>

        {/* CUSTOMER */}

        <section style={cardStyle}>
          <div style={sectionTitle}>
            ข้อมูลใบเสนอราคา
          </div>

          <div style={formGrid}>
            <div>
              <label style={labelStyle}>
                ลูกค้า *
              </label>

              <select
                value={customerId}
                onChange={(e) =>
                  setCustomerId(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  -- เลือกลูกค้า --
                </option>

                {customers.map(
                  (customer) => (
                    <option
                      key={
                        customer.id
                      }
                      value={
                        customer.id
                      }
                    >
                      {customerLabel(
                        customer
                      )}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                ชื่อโครงการ / งาน *
              </label>

              <input
                value={projectName}
                onChange={(e) =>
                  setProjectName(
                    e.target.value
                  )
                }
                placeholder="เช่น ป้ายหน้าร้าน"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label style={labelStyle}>
                หมายเหตุ
              </label>

              <textarea
                value={note}
                onChange={(e) =>
                  setNote(
                    e.target.value
                  )
                }
                rows={3}
                style={{
                  ...inputStyle,
                  resize:
                    "vertical",
                }}
              />
            </div>
          </div>
        </section>

        {/* ITEMS */}

        <section
          style={{
            ...cardStyle,
            marginTop: "20px",
          }}
        >
          <div style={sectionHeader}>
            <div style={sectionTitle}>
              รายการสินค้า / บริการ
            </div>

            <button
              type="button"
              onClick={addItem}
              style={addButton}
            >
              + เพิ่มรายการ
            </button>
          </div>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    ลำดับ
                  </th>

                  <th style={thStyle}>
                    รายละเอียด
                  </th>

                  <th style={thStyle}>
                    ขนาด
                  </th>

                  <th style={thStyle}>
                    จำนวน
                  </th>

                  <th style={thStyle}>
                    หน่วย
                  </th>

                  <th style={thStyle}>
                    ราคาต่อหน่วย
                  </th>

                  <th style={thRight}>
                    จำนวนเงิน
                  </th>

                  <th style={thCenter}>
                    จัดการ
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map(
                  (item, index) => (
                    <tr
                      key={index}
                      style={{
                        borderTop:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <td style={tdCenter}>
                        {index + 1}
                      </td>

                      <td style={tdStyle}>
                        <input
                          value={
                            item.description
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              "description",
                              e.target
                                .value
                            )
                          }
                          placeholder="รายละเอียด"
                          style={
                            tableInput
                          }
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          value={
                            item.size
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              "size",
                              e.target
                                .value
                            )
                          }
                          placeholder="เช่น 100 x 50 ซม."
                          style={
                            tableInput
                          }
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="1"
                          value={
                            item.quantity
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              "quantity",
                              e.target
                                .value
                            )
                          }
                          style={
                            tableInput
                          }
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          value={
                            item.unit
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              "unit",
                              e.target
                                .value
                            )
                          }
                          style={
                            tableInput
                          }
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.unit_price
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              "unit_price",
                              e.target
                                .value
                            )
                          }
                          style={
                            tableInput
                          }
                        />
                      </td>

                      <td style={tdRight}>
                        ฿
                        {money(
                          item.amount
                        )}
                      </td>

                      <td style={tdCenter}>
                        <button
                          type="button"
                          onClick={() =>
                            removeItem(
                              index
                            )
                          }
                          disabled={
                            items.length ===
                            1
                          }
                          style={
                            deleteButton
                          }
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* TOTAL */}

        <section
          style={{
            ...cardStyle,
            marginTop: "20px",
          }}
        >
          <div style={totalRow}>
            <span>
              ยอดรวม
            </span>

            <strong
              style={{
                fontSize: "28px",
              }}
            >
              ฿{money(subtotal)}
            </strong>
          </div>
        </section>

        {/* SAVE */}

        <div style={saveArea}>
          <button
            type="button"
            onClick={() =>
              router.push(
                "/quotations/list"
              )
            }
            style={secondaryButton}
          >
            ยกเลิก
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={
              createQuotation
            }
            style={saveButton}
          >
            {saving
              ? "กำลังบันทึก..."
              : "บันทึกใบเสนอราคา"}
          </button>
        </div>
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f3f4f6",
  padding: "32px",
  color: "#111827",
};

const containerStyle = {
  maxWidth: "1400px",
  margin: "0 auto",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "20px",
};

const titleStyle = {
  margin: 0,
  fontSize: "32px",
};

const subtitleStyle = {
  color: "#6b7280",
  marginTop: "6px",
};

const buttonRow = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const cardStyle = {
  background: "white",
  borderRadius: "12px",
  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

const sectionHeader = {
  padding: "18px 20px",
  borderBottom:
    "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const sectionTitle = {
  padding: "18px 20px",
  fontSize: "19px",
  fontWeight: "800",
};

const formGrid = {
  padding: "20px",
  display: "grid",
  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",
  gap: "18px",
};

const labelStyle = {
  display: "block",
  marginBottom: "7px",
  color: "#374151",
  fontWeight: "700",
  fontSize: "13px",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
  color: "#111827",
  background: "white",
};

const addButton = {
  marginRight: "20px",
  padding: "9px 13px",
  border: "none",
  borderRadius: "7px",
  background: "#2563eb",
  color: "white",
  fontWeight: "700",
  cursor: "pointer",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "1100px",
};

const thStyle = {
  padding: "13px",
  textAlign: "left",
  fontSize: "13px",
  background: "#f9fafb",
  color: "#374151",
};

const thRight = {
  ...thStyle,
  textAlign: "right",
};

const thCenter = {
  ...thStyle,
  textAlign: "center",
};

const tdStyle = {
  padding: "10px",
};

const tdCenter = {
  padding: "10px",
  textAlign: "center",
};

const tdRight = {
  padding: "10px",
  textAlign: "right",
  fontWeight: "700",
};

const tableInput = {
  width: "100%",
  minWidth: "110px",
  boxSizing: "border-box",
  padding: "9px 10px",
  border:
    "1px solid #d1d5db",
  borderRadius: "7px",
  color: "#111827",
  background: "white",
};

const deleteButton = {
  padding: "7px 10px",
  border: "none",
  borderRadius: "6px",
  background: "#dc2626",
  color: "white",
  fontWeight: "700",
  cursor: "pointer",
};

const totalRow = {
  padding: "22px",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "30px",
};

const saveArea = {
  marginTop: "20px",
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
};

const saveButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  fontSize: "14px",
  fontWeight: "700",
  cursor: "pointer",
};

const secondaryButton = {
  padding: "10px 15px",
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  fontWeight: "600",
  cursor: "pointer",
};

const loadingStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "40px",
  textAlign: "center",
};
