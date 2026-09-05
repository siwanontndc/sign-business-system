"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const PRODUCT_CATALOG = [
  { key: "vinyl", name: "ไวนิล", calculation: "sqm", unit: "ตร.ม.", unitPrice: 150 },
  { key: "uv_sticker", name: "สติกเกอร์พิมพ์ UV", calculation: "sqm", unit: "ตร.ม.", unitPrice: 650 },
  { key: "lightbox", name: "ตู้ไฟสี่เหลี่ยม", calculation: "sqm", unit: "ตร.ม.", unitPrice: 7500 },
  { key: "paswood10", name: "อักษรพาสวู๊ด 10 มม.", calculation: "height_inch", unit: "นิ้ว", unitPrice: 15 },
  { key: "zinc_frontlight", name: "อักษรซิ้งค์ไฟออกหน้า", calculation: "height_inch", unit: "นิ้ว", unitPrice: 150 },

  { key: "translucent_vinyl", name: "ไวนิลโปร่งแสง", calculation: "sqm", unit: "ตร.ม.", unitPrice: 450 },
  { key: "composite_deco_dezign", name: "อลูมิเนียมคอมโพสิต DECO/DEZIGN", calculation: "sqm", unit: "ตร.ม.", unitPrice: 2500 },
  { key: "composite_altex_pinkrino", name: "อลูมิเนียมคอมโพสิต Altex/Pink Rino", calculation: "sqm", unit: "ตร.ม.", unitPrice: 3000 },
  { key: "diecut_a3", name: "สติกเกอร์ไดคัท A3", calculation: "sheet_tier", unit: "แผ่น", unitPrice: 80 },
  { key: "vinyl_normal_wholesale", name: "ไวนิลพิมพ์ปกติ - ขายร้านส่ง", calculation: "sqm", unit: "ตร.ม.", unitPrice: 100 },
  { key: "vinyl_uv_wholesale", name: "ไวนิลพิมพ์ UV - ขายร้านส่ง", calculation: "sqm", unit: "ตร.ม.", unitPrice: 250 },
  { key: "vinyl_uv_retail", name: "ไวนิลพิมพ์ UV - ขายหน้าร้าน", calculation: "sqm", unit: "ตร.ม.", unitPrice: 450 },
  { key: "uv_diecut_label", name: "ฉลากสินค้าไดคัทพิมพ์ UV", calculation: "sqm", unit: "ตร.ม.", unitPrice: 750 },

  { key: "custom", name: "กำหนดเอง", calculation: "normal", unit: "งาน", unitPrice: 0 },
];

function getProduct(key) {
  return PRODUCT_CATALOG.find((p) => p.key === key) || PRODUCT_CATALOG[PRODUCT_CATALOG.length - 1];
}

function createNewItem() {
  const p = PRODUCT_CATALOG[0];
  return {
    product_key: p.key,
    description: p.name,
    size: "",
    quantity: 1,
    unit: p.unit,
    unit_price: p.unitPrice,
    amount: 0,
  };
}

function parseCmSize(text) {
  const raw = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/ซม\.?/g, "")
    .replace(/cm/g, "")
    .replace(/×/g, "x")
    .replace(/\*/g, "x")
    .replace(/\s+/g, "");

  const match = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function parseHeightInch(text) {
  const raw = String(text || "").trim().replace(/นิ้ว/g, "").replace(/"/g, "").trim();
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function calculateItem(item) {
  const product = getProduct(item.product_key);
  const qty = Number(item.quantity) || 0;

  if (product.calculation === "sheet_tier") {
    const effectivePrice = qty >= 10 ? 60 : 80;
    return {
      amount: qty * effectivePrice,
      effectivePrice,
      calculationText: qty >= 10
        ? `${qty} แผ่น × ฿60.00 (ราคา 10 แผ่นขึ้นไป)`
        : `${qty} แผ่น × ฿80.00 (1–9 แผ่น)`,
    };
  }

  const price = Number(item.unit_price) || 0;

  if (product.calculation === "sqm") {
    const size = parseCmSize(item.size);
    if (!size) return { amount: 0, calculationText: "กรอกขนาด เช่น 200 x 100 ซม." };
    const area = (size.width * size.height) / 10000;
    return {
      amount: area * qty * price,
      area,
      effectivePrice: price,
      calculationText: `${area.toFixed(2)} ตร.ม. × ${qty} × ฿${money(price)}`,
    };
  }

  if (product.calculation === "height_inch") {
    const height = parseHeightInch(item.size);
    if (!height) return { amount: 0, calculationText: "กรอกความสูง เช่น 20 นิ้ว" };
    return {
      amount: height * qty * price,
      height,
      effectivePrice: price,
      calculationText: `${height} นิ้ว × ${qty} ตัว × ฿${money(price)}`,
    };
  }

  return {
    amount: qty * price,
    effectivePrice: price,
    calculationText: `${qty} × ฿${money(price)}`,
  };
}

function recalculateItem(item) {
  const result = calculateItem(item);
  return {
    ...item,
    unit_price: getProduct(item.product_key).calculation === "sheet_tier"
      ? result.effectivePrice
      : item.unit_price,
    amount: Number(result.amount || 0),
  };
}

export default function NewQuotationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ company_name: "", contact_name: "", phone: "", email: "" });
  const [projectName, setProjectName] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([createNewItem()]);

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    await loadCustomers();
    setLoading(false);
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_code, company_name, contact_name, phone, email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      alert("โหลดข้อมูลลูกค้าไม่สำเร็จ: " + error.message);
      return [];
    }
    const list = data || [];
    setCustomers(list);
    return list;
  }

  function customerDisplayName(customer) {
    return customer?.company_name || customer?.contact_name || "ไม่ระบุชื่อ";
  }

  function customerLabel(customer) {
    return `${customer?.customer_code || "-"} - ${customerDisplayName(customer)}`;
  }

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return customers.slice(0, 10);
    return customers.filter((customer) =>
      [customer.customer_code, customer.company_name, customer.contact_name, customer.phone, customer.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [customers, customerSearch]);

  function selectCustomer(customer) {
    setCustomerId(customer.id);
    setCustomerSearch(customerLabel(customer));
    setShowCustomerResults(false);
  }

  function generateNextCustomerCode(list) {
    let maxNumber = 0;
    for (const customer of list) {
      const match = String(customer.customer_code || "").trim().toUpperCase().match(/^C(\d+)$/);
      if (match) maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
    }
    return `C${String(maxNumber + 1).padStart(3, "0")}`;
  }

  async function saveNewCustomer() {
    if (savingCustomer) return;
    const companyName = newCustomer.company_name.trim();
    const contactName = newCustomer.contact_name.trim();
    if (!companyName && !contactName) {
      alert("กรุณากรอกชื่อบริษัทหรือลูกค้า");
      return;
    }

    setSavingCustomer(true);
    try {
      const latestCustomers = await loadCustomers();
      const customerCode = generateNextCustomerCode(latestCustomers);
      const { data, error } = await supabase
        .from("customers")
        .insert({
          customer_code: customerCode,
          company_name: companyName || null,
          contact_name: contactName || companyName || null,
          phone: newCustomer.phone.trim() || null,
          email: newCustomer.email.trim() || null,
        })
        .select("id, customer_code, company_name, contact_name, phone, email, created_at")
        .single();
      if (error) throw error;
      setCustomers((prev) => [data, ...prev.filter((item) => item.id !== data.id)]);
      selectCustomer(data);
      setShowCustomerModal(false);
      alert(`เพิ่มลูกค้า ${customerCode} เรียบร้อยแล้ว`);
    } catch (error) {
      alert("เพิ่มลูกค้าไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setSavingCustomer(false);
    }
  }

  function changeProduct(index, key) {
    const product = getProduct(key);
    setItems((oldItems) => {
      const next = [...oldItems];
      next[index] = recalculateItem({
        ...next[index],
        product_key: key,
        description: key === "custom" ? "" : product.name,
        size: "",
        quantity: 1,
        unit: product.unit,
        unit_price: product.unitPrice,
      });
      return next;
    });
  }

  function updateItem(index, field, value) {
    setItems((oldItems) => {
      const next = [...oldItems];
      next[index] = recalculateItem({ ...next[index], [field]: value });
      return next;
    });
  }

  function addItem() {
    setItems((oldItems) => [...oldItems, createNewItem()]);
  }

  function removeItem(index) {
    if (items.length === 1) return;
    setItems((oldItems) => oldItems.filter((_, itemIndex) => itemIndex !== index));
  }

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [items]
  );

  async function createQuotation() {
    if (saving) return;
    if (!customerId) return alert("กรุณาเลือกลูกค้า");
    if (!projectName.trim()) return alert("กรุณากรอกชื่อโครงการ / งาน");

    const validItems = items.filter((item) => item.description.trim() && Number(item.quantity) > 0);
    if (!validItems.length) return alert("กรุณากรอกรายการสินค้า / บริการอย่างน้อย 1 รายการ");

    for (let index = 0; index < validItems.length; index++) {
      const item = validItems[index];
      const product = getProduct(item.product_key);
      if (product.calculation === "sqm" && !parseCmSize(item.size)) {
        return alert(`รายการที่ ${index + 1}: กรุณากรอกขนาด เช่น 200 x 100`);
      }
      if (product.calculation === "height_inch" && !parseHeightInch(item.size)) {
        return alert(`รายการที่ ${index + 1}: กรุณากรอกความสูง เช่น 20 นิ้ว`);
      }
    }

    setSaving(true);
    let quotationId = null;
    try {
      const now = new Date();
      const quotationNo = `QT-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: quotation, error: quotationError } = await supabase
        .from("quotations")
        .insert({
          customer_id: customerId,
          quotation_no: quotationNo,
          project_name: projectName.trim(),
          quotation_date: now.toISOString().slice(0, 10),
          valid_days: 30,
          subtotal,
          discount: 0,
          vat_percent: 0,
          vat_amount: 0,
          grand_total: subtotal,
          status: "draft",
          note: note.trim() || null,
        })
        .select()
        .single();
      if (quotationError) throw quotationError;
      quotationId = quotation.id;

      const quotationItems = validItems.map((item, index) => {
        const calculated = calculateItem(item);
        return {
          quotation_id: quotation.id,
          description: item.description.trim(),
          size: item.size.trim() || null,
          quantity: Number(item.quantity),
          unit: item.unit.trim() || "งาน",
          unit_price: Number(calculated.effectivePrice ?? item.unit_price ?? 0),
          amount: Number(calculated.amount || 0),
          sort_order: index + 1,
        };
      });

      const { error: itemError } = await supabase.from("quotation_items").insert(quotationItems);
      if (itemError) throw itemError;

      alert("สร้างใบเสนอราคาเรียบร้อยแล้ว\n" + quotationNo);
      router.push(`/quotations/${quotation.id}`);
    } catch (error) {
      if (quotationId) await supabase.from("quotations").delete().eq("id", quotationId);
      alert("สร้างใบเสนอราคาไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main style={styles.page}><div style={styles.container}><div style={styles.card}>กำลังโหลดข้อมูล...</div></div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0 }}>สร้างใบเสนอราคา</h1>
            <div style={styles.muted}>ระบบคำนวณราคางานป้ายอัตโนมัติ</div>
          </div>
          <div style={styles.row}>
            <button style={styles.secondary} onClick={() => router.push("/quotations/list")}>← รายการใบเสนอราคา</button>
            <button style={styles.secondary} onClick={() => router.push("/")}>Dashboard</button>
          </div>
        </div>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>ข้อมูลใบเสนอราคา</h2>
          <div style={styles.grid2}>
            <div style={{ position: "relative" }}>
              <div style={styles.labelRow}>
                <label style={styles.label}>ลูกค้า *</label>
                <button style={styles.linkButton} onClick={() => {
                  setNewCustomer({ company_name: "", contact_name: "", phone: "", email: "" });
                  setShowCustomerModal(true);
                }}>+ เพิ่มลูกค้าใหม่</button>
              </div>
              <input
                style={styles.input}
                value={customerSearch}
                placeholder="ค้นหารหัสลูกค้า / บริษัท / ผู้ติดต่อ / โทรศัพท์"
                onFocus={() => setShowCustomerResults(true)}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerId("");
                  setShowCustomerResults(true);
                }}
              />
              {showCustomerResults && !selectedCustomer && (
                <div style={styles.dropdown}>
                  {filteredCustomers.length ? filteredCustomers.map((customer) => (
                    <button key={customer.id} style={styles.customerOption} onClick={() => selectCustomer(customer)}>
                      <strong>{customer.customer_code}</strong> {customerDisplayName(customer)} {customer.phone ? ` · ${customer.phone}` : ""}
                    </button>
                  )) : <div style={{ padding: 14 }}>ไม่พบลูกค้า</div>}
                </div>
              )}
              {selectedCustomer && <div style={styles.selectedCustomer}>{customerLabel(selectedCustomer)}</div>}
            </div>

            <div>
              <label style={styles.label}>ชื่อโครงการ / งาน *</label>
              <input style={styles.input} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="เช่น ป้ายหน้าร้าน" />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>หมายเหตุ</label>
              <textarea style={{ ...styles.input, minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </section>

        <section style={{ ...styles.card, marginTop: 18 }}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>รายการสินค้า / บริการ</h2>
              <div style={styles.muted}>ระบบเลือกหน่วยและราคามาตรฐานให้อัตโนมัติ</div>
            </div>
            <button style={styles.primary} onClick={addItem}>+ เพิ่มรายการ</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>ประเภทงาน</th><th>รายละเอียด</th><th>ขนาด / ความสูง</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const product = getProduct(item.product_key);
                  const calculation = calculateItem(item);
                  const tiered = product.calculation === "sheet_tier";
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>
                        <select style={styles.tableInput} value={item.product_key} onChange={(e) => changeProduct(index, e.target.value)}>
                          {PRODUCT_CATALOG.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input style={styles.tableInput} value={item.description} disabled={item.product_key !== "custom"} onChange={(e) => updateItem(index, "description", e.target.value)} />
                      </td>
                      <td>
                        {product.calculation === "sheet_tier" ? (
                          <span style={styles.muted}>A3</span>
                        ) : (
                          <input
                            style={styles.tableInput}
                            value={item.size}
                            onChange={(e) => updateItem(index, "size", e.target.value)}
                            placeholder={product.calculation === "sqm" ? "200 x 100" : product.calculation === "height_inch" ? "20" : "-"}
                          />
                        )}
                        <div style={styles.help}>{calculation.calculationText}</div>
                      </td>
                      <td><input type="number" min="1" style={styles.numberInput} value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} /></td>
                      <td>{item.unit}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={{ ...styles.numberInput, background: tiered ? "#f3f4f6" : "white" }}
                          value={tiered ? calculation.effectivePrice : item.unit_price}
                          readOnly={tiered}
                          onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>฿{money(item.amount)}</td>
                      <td><button style={styles.danger} disabled={items.length === 1} onClick={() => removeItem(index)}>ลบ</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ ...styles.card, marginTop: 18 }}>
          <h2 style={styles.sectionTitle}>ราคามาตรฐานที่เพิ่มใหม่</h2>
          <div style={styles.priceList}>
            <span>ไวนิลโปร่งแสง ฿450/ตร.ม.</span>
            <span>คอมโพสิต DECO/DEZIGN ฿2,500/ตร.ม.</span>
            <span>คอมโพสิต Altex/Pink Rino ฿3,000/ตร.ม.</span>
            <span>สติกเกอร์ไดคัท A3 ฿80/แผ่น · 10+ แผ่น ฿60/แผ่น</span>
            <span>ไวนิลพิมพ์ปกติขายส่ง ฿100/ตร.ม.</span>
            <span>ไวนิลพิมพ์ UV ขายส่ง ฿250/ตร.ม.</span>
            <span>ไวนิลพิมพ์ UV หน้าร้าน ฿450/ตร.ม.</span>
            <span>ฉลากสินค้าไดคัทพิมพ์ UV ฿750/ตร.ม.</span>
          </div>
        </section>

        <section style={{ ...styles.card, marginTop: 18, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 24 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>ยอดรวม</span>
          <strong style={{ fontSize: 30, color: "#1d4ed8" }}>฿{money(subtotal)}</strong>
        </section>

        <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={styles.secondary} onClick={() => router.push("/quotations/list")}>ยกเลิก</button>
          <button style={styles.primary} disabled={saving} onClick={createQuotation}>{saving ? "กำลังบันทึก..." : "บันทึกใบเสนอราคา"}</button>
        </div>
      </div>

      {showCustomerModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.sectionHeader}>
              <h2 style={{ margin: 0 }}>เพิ่มลูกค้าใหม่</h2>
              <button style={styles.secondary} onClick={() => setShowCustomerModal(false)}>×</button>
            </div>
            <div style={styles.grid2}>
              <div><label style={styles.label}>บริษัท / ลูกค้า</label><input style={styles.input} value={newCustomer.company_name} onChange={(e) => setNewCustomer((p) => ({ ...p, company_name: e.target.value }))} /></div>
              <div><label style={styles.label}>ผู้ติดต่อ</label><input style={styles.input} value={newCustomer.contact_name} onChange={(e) => setNewCustomer((p) => ({ ...p, contact_name: e.target.value }))} /></div>
              <div><label style={styles.label}>โทรศัพท์</label><input style={styles.input} value={newCustomer.phone} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={styles.label}>อีเมล</label><input style={styles.input} value={newCustomer.email} onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div style={{ ...styles.row, justifyContent: "flex-end", padding: "0 20px 20px" }}>
              <button style={styles.secondary} onClick={() => setShowCustomerModal(false)}>ยกเลิก</button>
              <button style={styles.primary} disabled={savingCustomer} onClick={saveNewCustomer}>{savingCustomer ? "กำลังเพิ่ม..." : "เพิ่มลูกค้า"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f3f4f6", padding: 24, color: "#111827" },
  container: { maxWidth: 1500, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 },
  row: { display: "flex", gap: 10, flexWrap: "wrap" },
  card: { background: "white", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,.05)" },
  sectionTitle: { margin: "0 0 16px", fontSize: 20 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 },
  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111827", background: "white" },
  primary: { border: 0, borderRadius: 8, padding: "10px 15px", background: "#2563eb", color: "white", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 15px", background: "white", color: "#111827", fontWeight: 600, cursor: "pointer" },
  linkButton: { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, cursor: "pointer" },
  muted: { color: "#6b7280", fontSize: 13, marginTop: 5 },
  help: { color: "#6b7280", fontSize: 11, marginTop: 5, minWidth: 170 },
  dropdown: { position: "absolute", left: 0, right: 0, top: 72, zIndex: 30, background: "white", border: "1px solid #d1d5db", borderRadius: 8, maxHeight: 280, overflowY: "auto", boxShadow: "0 12px 30px rgba(0,0,0,.12)" },
  customerOption: { display: "block", width: "100%", textAlign: "left", padding: 12, border: 0, borderBottom: "1px solid #f3f4f6", background: "white", cursor: "pointer" },
  selectedCustomer: { marginTop: 7, padding: "8px 10px", borderRadius: 7, background: "#eff6ff", color: "#1e3a8a", fontSize: 12 },
  table: { width: "100%", minWidth: 1380, borderCollapse: "collapse" },
  tableInput: { width: "100%", minWidth: 130, boxSizing: "border-box", padding: "8px 9px", border: "1px solid #d1d5db", borderRadius: 7, background: "white", color: "#111827" },
  numberInput: { width: 110, boxSizing: "border-box", padding: "8px 9px", border: "1px solid #d1d5db", borderRadius: 7, color: "#111827" },
  danger: { border: 0, borderRadius: 6, padding: "7px 10px", background: "#dc2626", color: "white", fontWeight: 700, cursor: "pointer" },
  priceList: { display: "flex", flexWrap: "wrap", gap: "10px 18px", color: "#374151", fontSize: 13 },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { width: "min(700px,100%)", maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 14, padding: 20, boxShadow: "0 25px 70px rgba(0,0,0,.25)" },
};
