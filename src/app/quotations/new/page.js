"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const FALLBACK_CATALOG = [
  { product_key:"vinyl", name:"ไวนิล", calculation:"sqm", unit:"ตร.ม.", unit_price:150, sort_order:10 },
  { product_key:"translucent_vinyl", name:"ไวนิลโปร่งแสง", calculation:"sqm", unit:"ตร.ม.", unit_price:450, sort_order:20 },
  { product_key:"vinyl_wholesale", name:"ไวนิลพิมพ์ปกติ (ขายร้านส่ง)", calculation:"sqm", unit:"ตร.ม.", unit_price:100, sort_order:30 },
  { product_key:"uv_vinyl_wholesale", name:"ไวนิลพิมพ์ UV (ขายร้านส่ง)", calculation:"sqm", unit:"ตร.ม.", unit_price:250, sort_order:40 },
  { product_key:"uv_vinyl_retail", name:"ไวนิลพิมพ์ UV (ขายหน้าร้าน)", calculation:"sqm", unit:"ตร.ม.", unit_price:450, sort_order:50 },
  { product_key:"uv_sticker", name:"สติกเกอร์พิมพ์ UV", calculation:"sqm", unit:"ตร.ม.", unit_price:650, sort_order:60 },
  { product_key:"uv_diecut_label", name:"ฉลากสินค้าไดคัทพิมพ์ UV", calculation:"sqm", unit:"ตร.ม.", unit_price:750, sort_order:70 },
  { product_key:"composite_deco_dezign", name:"อลูมิเนียมคอมโพสิต DECO/DEZIGN", calculation:"sqm", unit:"ตร.ม.", unit_price:2500, sort_order:80 },
  { product_key:"composite_altex_pink_rino", name:"อลูมิเนียมคอมโพสิต Altex/Pink Rino", calculation:"sqm", unit:"ตร.ม.", unit_price:3000, sort_order:90 },
  { product_key:"a3_diecut_sticker", name:"สติกเกอร์ไดคัท A3", calculation:"sheet_tier", unit:"แผ่น", unit_price:80, tier_min_qty:10, tier_unit_price:60, sort_order:100 },
  { product_key:"lightbox", name:"ตู้ไฟสี่เหลี่ยม", calculation:"sqm", unit:"ตร.ม.", unit_price:7500, sort_order:110 },
  { product_key:"paswood10", name:"อักษรพาสวู๊ด 10 มม.", calculation:"height_inch", unit:"นิ้ว", unit_price:15, sort_order:120 },
  { product_key:"zinc_frontlight", name:"อักษรซิ้งค์ไฟออกหน้า", calculation:"height_inch", unit:"นิ้ว", unit_price:150, sort_order:130 },
];

const CUSTOM_PRODUCT = { product_key:"custom", name:"กำหนดเอง", calculation:"normal", unit:"งาน", unit_price:0 };

function parseCmSize(text) {
  const raw = String(text || "").trim().toLowerCase().replace(/ซม\.?/g, "").replace(/cm/g, "").replace(/×|\*/g, "x").replace(/\s+/g, "");
  const m = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseHeightInch(text) {
  const v = Number(String(text || "").replace(/นิ้ว|"/g, "").trim());
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function money(value) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value || 0));
}

export default function NewQuotationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name:"", contact_name:"", phone:"", email:"" });
  const [projectName, setProjectName] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([]);

  useEffect(() => { loadPage(); }, []);

  async function loadPage() {
    setLoading(true);
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const [{ data: productData, error: productError }, { data: customerData, error: customerError }] = await Promise.all([
      supabase.from("product_catalog").select("product_key,name,calculation,unit,unit_price,tier_min_qty,tier_unit_price,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("customers").select("id,customer_code,company_name,contact_name,phone,email,created_at").order("created_at", { ascending:false }),
    ]);

    const activeCatalog = !productError && productData?.length ? productData : FALLBACK_CATALOG;
    setCatalog(activeCatalog);
    setCustomers(customerError ? [] : (customerData || []));
    setItems([newItem(activeCatalog[0])]);
    setLoading(false);
  }

  function allProducts() { return [...catalog, CUSTOM_PRODUCT]; }
  function getProduct(key) { return allProducts().find(p => p.product_key === key) || CUSTOM_PRODUCT; }
  function newItem(product = catalog[0] || FALLBACK_CATALOG[0]) {
    return { product_key:product.product_key, description:product.name, size:"", quantity:1, unit:product.unit, unit_price:Number(product.unit_price || 0), amount:0 };
  }

  function effectivePrice(item, product) {
    const qty = Number(item.quantity || 0);
    if (product.calculation === "sheet_tier" && Number(product.tier_min_qty) > 0 && qty >= Number(product.tier_min_qty)) {
      return Number(product.tier_unit_price || product.unit_price || 0);
    }
    return Number(item.unit_price || product.unit_price || 0);
  }

  function calculate(item) {
    const product = getProduct(item.product_key);
    const qty = Number(item.quantity || 0);
    const price = effectivePrice(item, product);

    if (product.calculation === "sqm") {
      const size = parseCmSize(item.size);
      if (size) {
        const area = (size.width * size.height) / 10000;
        return { amount:area * qty * price, price, text:`${area.toFixed(2)} ตร.ม. × ${qty} × ฿${money(price)}` };
      }

      // บางงานยังไม่ทราบกว้าง × สูงจริง แต่ทราบพื้นที่รวมโดยประมาณ
      // ถ้าไม่กรอกขนาด ให้ใช้ช่อง "จำนวน" เป็นจำนวน ตร.ม. โดยตรง
      if (qty > 0) {
        return { amount:qty * price, price, text:`กรอกพื้นที่เอง: ${qty} ตร.ม. × ฿${money(price)}` };
      }

      return { amount:0, price, text:"กรอกขนาด 200 x 100 ซม. หรือกรอกพื้นที่รวมในช่องจำนวน (ตร.ม.)" };
    }
    if (product.calculation === "height_inch") {
      const h = parseHeightInch(item.size);
      if (!h) return { amount:0, price, text:"กรอกความสูง เช่น 20 นิ้ว" };
      return { amount:h * qty * price, price, text:`${h} นิ้ว × ${qty} × ฿${money(price)}` };
    }
    if (product.calculation === "sheet_tier") {
      const minQty = Number(product.tier_min_qty || 0);
      const tiered = minQty > 0 && qty >= minQty;
      return { amount:qty * price, price, text:tiered ? `${qty} แผ่น × ฿${money(price)} (ราคา ${minQty} แผ่นขึ้นไป)` : `${qty} แผ่น × ฿${money(price)}` };
    }
    return { amount:qty * price, price, text:`${qty} × ฿${money(price)}` };
  }

  function recalc(item) {
    const result = calculate(item);
    return { ...item, unit_price:result.price, amount:Number(result.amount || 0) };
  }

  function changeProduct(index, key) {
    const p = getProduct(key);
    setItems(old => old.map((item,i) => i === index ? recalc({ ...item, product_key:key, description:key === "custom" ? "" : p.name, size:"", quantity:1, unit:p.unit, unit_price:Number(p.unit_price || 0) }) : item));
  }

  function updateItem(index, field, value) {
    setItems(old => old.map((item,i) => i === index ? recalc({ ...item, [field]:value }) : item));
  }

  async function createCustomerInline() {
    if (savingCustomer) return;
    const name = newCustomer.name.trim();
    if (!name) return alert("กรุณากรอกชื่อลูกค้า / บริษัท");

    setSavingCustomer(true);
    try {
      const now = new Date();
      const code = `CUS-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
      const contact = newCustomer.contact_name.trim() || name;
      const { data, error } = await supabase.from("customers").insert({
        customer_code: code,
        company_name: name,
        contact_name: contact,
        phone: newCustomer.phone.trim() || null,
        email: newCustomer.email.trim() || null,
      }).select("id,customer_code,company_name,contact_name,phone,email,created_at").single();

      if (error) throw error;

      setCustomers(old => [data, ...old]);
      setCustomerId(data.id);
      setCustomerSearch(`${data.customer_code} - ${data.company_name || data.contact_name}`);
      setNewCustomer({ name:"", contact_name:"", phone:"", email:"" });
      setShowNewCustomer(false);
    } catch (error) {
      alert("เพิ่มลูกค้าไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally {
      setSavingCustomer(false);
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0,20);
    return customers.filter(c => [c.customer_code,c.company_name,c.contact_name,c.phone].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [customers, customerSearch]);

  const subtotal = useMemo(() => items.reduce((sum,item) => sum + Number(item.amount || 0), 0), [items]);

  async function createQuotation() {
    if (saving) return;
    if (!customerId) return alert("กรุณาเลือกลูกค้า");
    if (!projectName.trim()) return alert("กรุณากรอกชื่อโครงการ / งาน");
    const valid = items.filter(i => i.description.trim() && Number(i.quantity) > 0);
    if (!valid.length) return alert("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");

    for (let i=0;i<valid.length;i++) {
      const p = getProduct(valid[i].product_key);
      if (p.calculation === "sqm" && !parseCmSize(valid[i].size) && !(Number(valid[i].quantity) > 0)) return alert(`รายการที่ ${i+1}: กรุณากรอกขนาด เช่น 200 x 100 หรือกรอกพื้นที่รวมเป็น ตร.ม. ในช่องจำนวน`);
      if (p.calculation === "height_inch" && !parseHeightInch(valid[i].size)) return alert(`รายการที่ ${i+1}: กรุณากรอกความสูง เช่น 20 นิ้ว`);
    }

    setSaving(true);
    let quotationId = null;
    try {
      const now = new Date();
      const quotationNo = `QT-${now.getFullYear()}-${Math.floor(100000 + Math.random()*900000)}`;
      const { data: quotation, error: qError } = await supabase.from("quotations").insert({
        customer_id:customerId, quotation_no:quotationNo, project_name:projectName.trim(), quotation_date:now.toISOString().slice(0,10), valid_days:30,
        subtotal, discount:0, vat_percent:0, vat_amount:0, grand_total:subtotal, status:"draft", note:note.trim() || null,
      }).select().single();
      if (qError) throw qError;
      quotationId = quotation.id;

      const rows = valid.map((item,index) => {
        const result = calculate(item);
        return { quotation_id:quotation.id, description:item.description.trim(), size:item.size.trim() || null, quantity:Number(item.quantity), unit:item.unit || "งาน", unit_price:Number(result.price || 0), amount:Number(result.amount || 0), sort_order:index+1 };
      });
      const { error:itemError } = await supabase.from("quotation_items").insert(rows);
      if (itemError) throw itemError;
      alert(`สร้างใบเสนอราคาเรียบร้อยแล้ว\n${quotationNo}`);
      router.push(`/quotations/${quotation.id}`);
    } catch (error) {
      if (quotationId) await supabase.from("quotations").delete().eq("id", quotationId);
      alert("สร้างใบเสนอราคาไม่สำเร็จ: " + (error?.message || "เกิดข้อผิดพลาด"));
    } finally { setSaving(false); }
  }

  const input = { width:"100%", boxSizing:"border-box", padding:"9px 10px", border:"1px solid #d1d5db", borderRadius:7, background:"white", color:"#111827" };
  const th = { padding:10, background:"#f9fafb", textAlign:"left", fontSize:12, whiteSpace:"nowrap" };
  const td = { padding:8, borderTop:"1px solid #e5e7eb", verticalAlign:"top" };
  const btn = { border:0, borderRadius:8, padding:"10px 14px", fontWeight:700, cursor:"pointer" };

  if (loading) return <main style={{padding:32}}>กำลังโหลดข้อมูล...</main>;

  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1500,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <div><h1 style={{margin:0}}>สร้างใบเสนอราคา</h1><p style={{margin:"6px 0 0",color:"#6b7280"}}>ราคาดึงจากเมนูตั้งค่าสินค้าโดยอัตโนมัติ</p></div>
      <div style={{display:"flex",gap:8}}><button style={{...btn,background:"white",border:"1px solid #d1d5db"}} onClick={()=>router.push("/quotations/list")}>← รายการใบเสนอราคา</button><button style={{...btn,background:"#111827",color:"white"}} onClick={()=>router.push("/settings/products")}>ตั้งค่าสินค้า/ราคา</button></div>
    </div>

    <section style={{background:"white",borderRadius:12,padding:18,marginBottom:18}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
        <div>
          <label>ลูกค้า *</label>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"start"}}>
            <input style={input} value={customerSearch} onChange={e=>{setCustomerSearch(e.target.value);setCustomerId("");}} placeholder="ค้นหารหัส / ชื่อลูกค้า"/>
            <button type="button" style={{...btn,background:"#16a34a",color:"white",whiteSpace:"nowrap"}} onClick={()=>{setShowNewCustomer(v=>!v);setNewCustomer(n=>({...n,name:n.name||customerSearch.trim()}));}}>+ ลูกค้าใหม่</button>
          </div>
          <select style={{...input,marginTop:6}} value={customerId} onChange={e=>{setCustomerId(e.target.value);const c=customers.find(x=>x.id===e.target.value);if(c)setCustomerSearch(`${c.customer_code || ""} - ${c.company_name || c.contact_name || ""}`)}}>
            <option value="">-- เลือกลูกค้า --</option>
            {filteredCustomers.map(c=><option key={c.id} value={c.id}>{c.customer_code || "-"} - {c.company_name || c.contact_name || "ไม่ระบุชื่อ"}</option>)}
          </select>
          {showNewCustomer&&<div style={{marginTop:10,padding:12,border:"1px solid #bbf7d0",borderRadius:10,background:"#f0fdf4"}}>
            <strong style={{display:"block",marginBottom:8}}>เพิ่มลูกค้าใหม่ตรงนี้ได้เลย</strong>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
              <input style={{...input,gridColumn:"1 / -1"}} value={newCustomer.name} onChange={e=>setNewCustomer(n=>({...n,name:e.target.value}))} placeholder="ชื่อลูกค้า / บริษัท *"/>
              <input style={input} value={newCustomer.contact_name} onChange={e=>setNewCustomer(n=>({...n,contact_name:e.target.value}))} placeholder="ชื่อผู้ติดต่อ (ไม่กรอกจะใช้ชื่อลูกค้า)"/>
              <input style={input} value={newCustomer.phone} onChange={e=>setNewCustomer(n=>({...n,phone:e.target.value}))} placeholder="เบอร์โทร"/>
              <input style={{...input,gridColumn:"1 / -1"}} type="email" value={newCustomer.email} onChange={e=>setNewCustomer(n=>({...n,email:e.target.value}))} placeholder="อีเมล (ถ้ามี)"/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
              <button type="button" disabled={savingCustomer} style={{...btn,background:"#16a34a",color:"white",opacity:savingCustomer?.6:1}} onClick={createCustomerInline}>{savingCustomer?"กำลังเพิ่ม...":"บันทึกและเลือกลูกค้านี้"}</button>
              <button type="button" style={{...btn,background:"white",border:"1px solid #d1d5db"}} onClick={()=>setShowNewCustomer(false)}>ยกเลิก</button>
            </div>
            <small style={{display:"block",color:"#166534",marginTop:8}}>ระบบสร้างรหัสลูกค้าให้อัตโนมัติ ไม่ต้องออกจากหน้าใบเสนอราคา</small>
          </div>}
        </div>
        <label>ชื่อโครงการ / งาน *<input style={input} value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="เช่น ป้ายหน้าร้าน"/></label>
        <label style={{gridColumn:"1 / -1"}}>หมายเหตุ<textarea rows={3} style={{...input,resize:"vertical"}} value={note} onChange={e=>setNote(e.target.value)}/></label>
      </div>
    </section>

    <section style={{background:"white",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><strong>รายการสินค้า / บริการ</strong><button style={{...btn,background:"#2563eb",color:"white"}} onClick={()=>setItems(old=>[...old,newItem()])}>+ เพิ่มรายการ</button></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1250}}><thead><tr><th style={th}>#</th><th style={th}>ประเภทงาน</th><th style={th}>รายละเอียด</th><th style={th}>ขนาด/ความสูง (ถ้าทราบ)</th><th style={th}>จำนวน / พื้นที่รวม</th><th style={th}>หน่วย</th><th style={th}>ราคา/หน่วย</th><th style={th}>จำนวนเงิน</th><th style={th}></th></tr></thead><tbody>
      {items.map((item,index)=>{const p=getProduct(item.product_key);const calc=calculate(item);return <tr key={index}><td style={td}>{index+1}</td><td style={td}><select style={input} value={item.product_key} onChange={e=>changeProduct(index,e.target.value)}>{allProducts().map(x=><option key={x.product_key} value={x.product_key}>{x.name}</option>)}</select></td><td style={td}><input style={input} disabled={item.product_key!=="custom"} value={item.description} onChange={e=>updateItem(index,"description",e.target.value)}/></td><td style={td}><input style={input} value={item.size} onChange={e=>updateItem(index,"size",e.target.value)} placeholder={p.calculation==="sqm"?"200 x 100 หรือเว้นว่าง":p.calculation==="height_inch"?"20":"-"}/><small style={{display:"block",color:"#6b7280",marginTop:4}}>{calc.text}</small></td><td style={td}><input type="number" min="0" step={p.calculation==="sqm"?"0.01":"1"} style={input} value={item.quantity} onChange={e=>updateItem(index,"quantity",e.target.value)}/>{p.calculation==="sqm"&&!parseCmSize(item.size)&&<small style={{display:"block",color:"#2563eb",marginTop:4}}>ไม่ทราบขนาด: ใส่พื้นที่รวมเป็น ตร.ม. ได้เลย</small>}</td><td style={td}>{item.unit}</td><td style={td}><input type="number" min="0" step="0.01" style={input} value={item.unit_price} disabled={p.calculation==="sheet_tier"} onChange={e=>updateItem(index,"unit_price",e.target.value)}/>{p.calculation==="sheet_tier" && <small style={{display:"block",color:"#2563eb",marginTop:4}}>อัตโนมัติตามจำนวน</small>}</td><td style={{...td,textAlign:"right",fontWeight:800}}>฿{money(item.amount)}</td><td style={td}><button disabled={items.length===1} style={{...btn,background:"#dc2626",color:"white",opacity:items.length===1?.4:1}} onClick={()=>setItems(old=>old.filter((_,i)=>i!==index))}>ลบ</button></td></tr>})}
      </tbody></table></div>
    </section>

    <section style={{background:"white",borderRadius:12,padding:18,marginTop:18,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><span>ยอดรวม</span><strong style={{fontSize:30,color:"#1d4ed8"}}>฿{money(subtotal)}</strong></section>
    <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}><button style={{...btn,background:"white",border:"1px solid #d1d5db"}} onClick={()=>router.push("/quotations/list")}>ยกเลิก</button><button disabled={saving} style={{...btn,background:"#2563eb",color:"white",opacity:saving?.6:1}} onClick={createQuotation}>{saving?"กำลังบันทึก...":"บันทึกใบเสนอราคา"}</button></div>
  </div></main>;
}
