"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const CALCULATIONS = [
  ["sqm", "ตารางเมตร"],
  ["height_inch", "ความสูง/นิ้ว"],
  ["normal", "จำนวน × ราคา"],
  ["sheet_tier", "ราคาแบบขั้นบันได"],
];

const blankProduct = {
  name: "", calculation: "sqm", unit: "ตร.ม.", unit_price: 0,
  tier_min_qty: "", tier_unit_price: "", is_active: true, sort_order: 999,
};

export default function ProductSettingsPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [draft, setDraft] = useState(blankProduct);
  const [message, setMessage] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    const { data: role } = await supabase.rpc("current_user_role");
    if (role !== "owner") { router.replace("/"); return; }
    const { data, error } = await supabase.from("product_catalog").select("*").order("sort_order").order("name");
    if (error) alert("โหลดสินค้าไม่สำเร็จ: " + error.message);
    setProducts(data || []);
    setLoading(false);
  }

  function patch(id, field, value) {
    setProducts(old => old.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  async function saveProduct(p) {
    setSaving(p.id); setMessage("");
    const payload = {
      name: p.name.trim(), calculation: p.calculation, unit: p.unit.trim(),
      unit_price: Number(p.unit_price || 0),
      tier_min_qty: p.calculation === "sheet_tier" && p.tier_min_qty !== "" ? Number(p.tier_min_qty) : null,
      tier_unit_price: p.calculation === "sheet_tier" && p.tier_unit_price !== "" ? Number(p.tier_unit_price) : null,
      is_active: Boolean(p.is_active), sort_order: Number(p.sort_order || 0), updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("product_catalog").update(payload).eq("id", p.id);
    setSaving("");
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    setMessage("บันทึกราคาสินค้าเรียบร้อยแล้ว"); await load();
  }

  async function addProduct() {
    if (!draft.name.trim()) return alert("กรุณากรอกชื่อสินค้า");
    setSaving("new");
    const key = "custom_" + Date.now();
    const { error } = await supabase.from("product_catalog").insert({
      product_key: key, name: draft.name.trim(), calculation: draft.calculation, unit: draft.unit.trim() || "งาน",
      unit_price: Number(draft.unit_price || 0),
      tier_min_qty: draft.calculation === "sheet_tier" && draft.tier_min_qty !== "" ? Number(draft.tier_min_qty) : null,
      tier_unit_price: draft.calculation === "sheet_tier" && draft.tier_unit_price !== "" ? Number(draft.tier_unit_price) : null,
      is_active: true, sort_order: Number(draft.sort_order || 999),
    });
    setSaving("");
    if (error) return alert("เพิ่มสินค้าไม่สำเร็จ: " + error.message);
    setDraft(blankProduct); setMessage("เพิ่มสินค้าเรียบร้อยแล้ว"); await load();
  }

  const input = { padding:"9px 10px", border:"1px solid #d1d5db", borderRadius:7, width:"100%", boxSizing:"border-box", background:"white", color:"#111827" };
  const th = { padding:10, textAlign:"left", fontSize:12, background:"#f9fafb", whiteSpace:"nowrap" };
  const td = { padding:8, borderTop:"1px solid #e5e7eb", verticalAlign:"top" };

  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1500,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:18}}>
      <div><h1 style={{margin:0}}>สินค้าและราคามาตรฐาน</h1><p style={{color:"#6b7280"}}>เจ้าของระบบสามารถแก้ราคา หน่วย สูตรคำนวณ และเปิด/ปิดสินค้าได้</p></div>
      <div style={{display:"flex",gap:8}}><button onClick={()=>router.push("/settings")} style={{...input,width:"auto",cursor:"pointer"}}>← ตั้งค่าระบบ</button><button onClick={()=>router.push("/")} style={{...input,width:"auto",cursor:"pointer"}}>Dashboard</button></div>
    </div>
    {message && <div style={{padding:12,background:"#dcfce7",color:"#166534",borderRadius:8,marginBottom:12}}>{message}</div>}
    <section style={{background:"white",borderRadius:12,padding:16,marginBottom:18,boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
      <h2 style={{marginTop:0,fontSize:18}}>+ เพิ่มสินค้าใหม่</h2>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
        <label>ชื่อสินค้า<input style={input} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label>สูตร<select style={input} value={draft.calculation} onChange={e=>setDraft({...draft,calculation:e.target.value})}>{CALCULATIONS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
        <label>หน่วย<input style={input} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}/></label>
        <label>ราคาปกติ<input type="number" style={input} value={draft.unit_price} onChange={e=>setDraft({...draft,unit_price:e.target.value})}/></label>
        <label>ขั้นต่ำ Tier<input type="number" style={input} value={draft.tier_min_qty} onChange={e=>setDraft({...draft,tier_min_qty:e.target.value})}/></label>
        <label>ราคา Tier<input type="number" style={input} value={draft.tier_unit_price} onChange={e=>setDraft({...draft,tier_unit_price:e.target.value})}/></label>
        <button onClick={addProduct} disabled={saving==="new"} style={{padding:"10px 16px",border:0,borderRadius:7,background:"#2563eb",color:"white",fontWeight:700,cursor:"pointer"}}>เพิ่ม</button>
      </div>
    </section>
    <section style={{background:"white",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1200}}><thead><tr><th style={th}>สินค้า</th><th style={th}>สูตร</th><th style={th}>หน่วย</th><th style={th}>ราคาปกติ</th><th style={th}>ขั้นต่ำ Tier</th><th style={th}>ราคา Tier</th><th style={th}>ใช้งาน</th><th style={th}>ลำดับ</th><th style={th}>บันทึก</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={9} style={td}>กำลังโหลด...</td></tr>:products.map(p=><tr key={p.id}>
        <td style={td}><input style={input} value={p.name} onChange={e=>patch(p.id,"name",e.target.value)}/></td>
        <td style={td}><select style={input} value={p.calculation} onChange={e=>patch(p.id,"calculation",e.target.value)}>{CALCULATIONS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></td>
        <td style={td}><input style={input} value={p.unit} onChange={e=>patch(p.id,"unit",e.target.value)}/></td>
        <td style={td}><input type="number" style={input} value={p.unit_price} onChange={e=>patch(p.id,"unit_price",e.target.value)}/></td>
        <td style={td}><input type="number" disabled={p.calculation!=="sheet_tier"} style={input} value={p.tier_min_qty??""} onChange={e=>patch(p.id,"tier_min_qty",e.target.value)}/></td>
        <td style={td}><input type="number" disabled={p.calculation!=="sheet_tier"} style={input} value={p.tier_unit_price??""} onChange={e=>patch(p.id,"tier_unit_price",e.target.value)}/></td>
        <td style={td}><input type="checkbox" checked={p.is_active} onChange={e=>patch(p.id,"is_active",e.target.checked)}/></td>
        <td style={td}><input type="number" style={input} value={p.sort_order} onChange={e=>patch(p.id,"sort_order",e.target.value)}/></td>
        <td style={td}><button onClick={()=>saveProduct(p)} disabled={saving===p.id} style={{padding:"9px 12px",border:0,borderRadius:7,background:"#111827",color:"white",cursor:"pointer"}}>{saving===p.id?"...":"บันทึก"}</button></td>
      </tr>)}</tbody></table></div>
    </section>
  </div></main>;
}
