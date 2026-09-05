"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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

const inputStyle = { width:"100%", padding:"10px 11px", border:"1px solid #d1d5db", borderRadius:8, background:"white", color:"#111827", boxSizing:"border-box" };
const primaryButton = { padding:"11px 16px", border:0, borderRadius:8, background:"#2563eb", color:"white", fontWeight:700, cursor:"pointer" };
const secondaryButton = { padding:"11px 16px", border:"1px solid #d1d5db", borderRadius:8, background:"white", color:"#111827", fontWeight:700, cursor:"pointer" };

function parseCmSize(text) {
  const raw = String(text || "").trim().toLowerCase().replace(/ซม\.?/g,"").replace(/cm/g,"").replace(/×|\*/g,"x").replace(/\s+/g,"");
  const m = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const width = Number(m[1]), height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}
function parseHeightInch(text) {
  const v = Number(String(text || "").replace(/นิ้ว|"/g,"").trim());
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function money(v){ return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0)); }
function toDateInputValue(v){ return v ? String(v).slice(0,10) : ""; }

export default function EditQuotationPage(){
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [catalog,setCatalog]=useState(FALLBACK_CATALOG);
  const [customers,setCustomers]=useState([]);
  const [quotation,setQuotation]=useState({quotation_no:"",customer_id:"",project_name:"",quotation_date:"",valid_days:30,discount:0,vat_percent:0,note:"",status:"draft"});
  const [items,setItems]=useState([]);

  useEffect(()=>{ if(id) loadPage(); },[id]);

  function products(){ return [...catalog,CUSTOM_PRODUCT]; }
  function getProduct(key){ return products().find(p=>p.product_key===key)||CUSTOM_PRODUCT; }
  function findProductForExisting(row, list){
    const byName = list.find(p=>p.name===row.description);
    if(byName) return byName;
    const unit = String(row.unit||"");
    if(unit==="นิ้ว") return list.find(p=>p.calculation==="height_inch")||CUSTOM_PRODUCT;
    return CUSTOM_PRODUCT;
  }
  function makeItem(product = catalog[0]||FALLBACK_CATALOG[0], row={}){
    const size = row.size || ((row.width||row.height) ? `${row.width||""} x ${row.height||""}` : "");
    return { clientId:`${Date.now()}-${Math.random()}`, product_key:product.product_key, description:row.description||product.name, size, quantity:Number(row.quantity??1), unit:row.unit||product.unit, unit_price:Number(row.unit_price??product.unit_price??0), amount:Number(row.amount??row.line_total??0) };
  }

  async function loadPage(){
    setLoading(true);
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){ router.replace("/login"); return; }
    const [qRes,iRes,cRes,pRes]=await Promise.all([
      supabase.from("quotations").select("*").eq("id",id).single(),
      supabase.from("quotation_items").select("*").eq("quotation_id",id).order("created_at",{ascending:true}),
      supabase.from("customers").select("id,customer_code,company_name,contact_name").order("created_at",{ascending:false}),
      supabase.from("product_catalog").select("product_key,name,calculation,unit,unit_price,tier_min_qty,tier_unit_price,is_active,sort_order").eq("is_active",true).order("sort_order").order("name")
    ]);
    if(qRes.error){ alert("โหลดใบเสนอราคาไม่สำเร็จ: "+qRes.error.message); router.replace("/quotations/list"); return; }
    const active = !pRes.error && pRes.data?.length ? pRes.data : FALLBACK_CATALOG;
    setCatalog(active); setCustomers(cRes.error?[]:(cRes.data||[]));
    const q=qRes.data;
    setQuotation({quotation_no:q.quotation_no||"",customer_id:q.customer_id||"",project_name:q.project_name||"",quotation_date:toDateInputValue(q.quotation_date),valid_days:q.valid_days??30,discount:q.discount??0,vat_percent:q.vat_percent??0,note:q.note||"",status:q.status||"draft"});
    const rows=iRes.error?[]:(iRes.data||[]);
    setItems(rows.length?rows.map(r=>makeItem(findProductForExisting(r,active),r)):[makeItem(active[0])]);
    setLoading(false);
  }

  function effectivePrice(item,p){
    const qty=Number(item.quantity||0);
    if(p.calculation==="sheet_tier" && Number(p.tier_min_qty)>0 && qty>=Number(p.tier_min_qty)) return Number(p.tier_unit_price||p.unit_price||0);
    return Number(item.unit_price||p.unit_price||0);
  }
  function calc(item){
    const p=getProduct(item.product_key), qty=Number(item.quantity||0), price=effectivePrice(item,p);
    if(p.calculation==="sqm"){
      const s=parseCmSize(item.size); if(!s) return {amount:0,price,text:"กรอกขนาด เช่น 200 x 100 ซม."};
      const area=s.width*s.height/10000; return {amount:area*qty*price,price,text:`${area.toFixed(2)} ตร.ม. × ${qty} × ฿${money(price)}`,width:s.width,height:s.height};
    }
    if(p.calculation==="height_inch"){
      const h=parseHeightInch(item.size); if(!h) return {amount:0,price,text:"กรอกความสูง เช่น 20 นิ้ว"};
      return {amount:h*qty*price,price,text:`${h} นิ้ว × ${qty} × ฿${money(price)}`};
    }
    if(p.calculation==="sheet_tier"){
      const min=Number(p.tier_min_qty||0); return {amount:qty*price,price,text:min&&qty>=min?`${qty} แผ่น × ฿${money(price)} (ราคา ${min} แผ่นขึ้นไป)`:`${qty} แผ่น × ฿${money(price)}`};
    }
    return {amount:qty*price,price,text:`${qty} × ฿${money(price)}`};
  }
  function recalc(item){ const r=calc(item); return {...item,unit_price:r.price,amount:Number(r.amount||0)}; }
  function changeProduct(clientId,key){
    const p=getProduct(key);
    setItems(old=>old.map(i=>i.clientId===clientId?recalc({...i,product_key:key,description:key==="custom"?"":p.name,size:"",quantity:1,unit:p.unit,unit_price:Number(p.unit_price||0)}):i));
  }
  function updateItem(clientId,field,value){ setItems(old=>old.map(i=>i.clientId===clientId?recalc({...i,[field]:value}):i)); }
  function addItem(){ setItems(old=>[...old,makeItem(catalog[0]||FALLBACK_CATALOG[0])]); }
  function removeItem(clientId){ if(items.length===1)return alert("ใบเสนอราคาต้องมีอย่างน้อย 1 รายการ"); setItems(old=>old.filter(i=>i.clientId!==clientId)); }

  const subtotal=useMemo(()=>items.reduce((s,i)=>s+Number(calc(i).amount||0),0),[items,catalog]);
  const discount=Number(quotation.discount||0), afterDiscount=Math.max(subtotal-discount,0), vatAmount=afterDiscount*(Number(quotation.vat_percent||0)/100), grandTotal=afterDiscount+vatAmount;

  async function handleSave(){
    if(saving)return;
    if(!quotation.customer_id)return alert("กรุณาเลือกลูกค้า");
    if(!quotation.project_name.trim())return alert("กรุณากรอกชื่อโครงการ / ชื่องาน");
    for(let n=0;n<items.length;n++){
      const i=items[n],p=getProduct(i.product_key);
      if(!i.description.trim()||Number(i.quantity)<=0)return alert(`รายการที่ ${n+1}: กรุณากรอกรายการและจำนวนให้ครบ`);
      if(p.calculation==="sqm"&&!parseCmSize(i.size))return alert(`รายการที่ ${n+1}: กรุณากรอกขนาด เช่น 200 x 100`);
      if(p.calculation==="height_inch"&&!parseHeightInch(i.size))return alert(`รายการที่ ${n+1}: กรุณากรอกความสูง เช่น 20 นิ้ว`);
    }
    setSaving(true);
    try{
      const {error:qErr}=await supabase.from("quotations").update({customer_id:quotation.customer_id,project_name:quotation.project_name.trim(),quotation_date:quotation.quotation_date,valid_days:Number(quotation.valid_days||30),subtotal,discount,vat_percent:Number(quotation.vat_percent||0),vat_amount:vatAmount,grand_total:grandTotal,note:quotation.note||"",updated_at:new Date().toISOString()}).eq("id",id);
      if(qErr)throw qErr;
      const {error:dErr}=await supabase.from("quotation_items").delete().eq("quotation_id",id); if(dErr)throw dErr;
      const rows=items.map((i,index)=>{ const r=calc(i); const s=parseCmSize(i.size); return {quotation_id:id,description:i.description.trim(),size:i.size.trim()||null,width:s?.width||null,height:s?.height||null,quantity:Number(i.quantity||0),unit:i.unit||"งาน",unit_price:Number(r.price||0),amount:Number(r.amount||0),line_total:Number(r.amount||0),sort_order:index+1}; });
      const {error:iErr}=await supabase.from("quotation_items").insert(rows); if(iErr)throw iErr;
      router.push(`/quotations/${id}`);
    }catch(e){ alert("บันทึกการแก้ไขไม่สำเร็จ: "+(e?.message||"เกิดข้อผิดพลาด")); }
    finally{ setSaving(false); }
  }

  if(loading)return <main style={{padding:32}}>กำลังโหลด...</main>;
  const th={padding:10,background:"#f9fafb",fontSize:12,textAlign:"left",whiteSpace:"nowrap"};
  const td={padding:8,borderTop:"1px solid #e5e7eb",verticalAlign:"top"};

  return <main style={{minHeight:"100vh",background:"#f3f4f6",padding:24,color:"#111827"}}><div style={{maxWidth:1500,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:18}}><div><h1 style={{margin:0}}>แก้ไขใบเสนอราคา</h1><p style={{color:"#6b7280"}}>เลือกวัสดุและราคาจากฐานข้อมูลสินค้าโดยตรง</p></div><button style={secondaryButton} onClick={()=>router.push(`/quotations/${id}`)}>← ยกเลิก</button></div>

    <section style={{background:"white",borderRadius:12,padding:18,marginBottom:18}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
      <label>เลขที่ใบเสนอราคา<input style={{...inputStyle,marginTop:6}} value={quotation.quotation_no} readOnly/></label>
      <label>วันที่เสนอราคา<input type="date" style={{...inputStyle,marginTop:6}} value={quotation.quotation_date} onChange={e=>setQuotation({...quotation,quotation_date:e.target.value})}/></label>
      <label>ยืนราคา (วัน)<input type="number" min="1" style={{...inputStyle,marginTop:6}} value={quotation.valid_days} onChange={e=>setQuotation({...quotation,valid_days:e.target.value})}/></label>
      <label>ลูกค้า *<select style={{...inputStyle,marginTop:6}} value={quotation.customer_id} onChange={e=>setQuotation({...quotation,customer_id:e.target.value})}><option value="">-- เลือกลูกค้า --</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code||"-"} - {c.company_name||c.contact_name||"ไม่ระบุชื่อ"}</option>)}</select></label>
      <label style={{gridColumn:"span 2"}}>ชื่อโครงการ / งาน *<input style={{...inputStyle,marginTop:6}} value={quotation.project_name} onChange={e=>setQuotation({...quotation,project_name:e.target.value})}/></label>
    </div></section>

    <section style={{background:"white",borderRadius:12,overflow:"hidden",marginBottom:18}}>
      <div style={{padding:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><strong>รายการวัสดุ / งาน</strong><div style={{fontSize:12,color:"#6b7280",marginTop:4}}>เลือกประเภทงาน ระบบจะใส่หน่วยและราคามาตรฐานให้อัตโนมัติ</div></div><button style={primaryButton} onClick={addItem}>+ เพิ่มรายการ</button></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1280}}><thead><tr><th style={th}>#</th><th style={th}>ประเภทงาน / วัสดุ</th><th style={th}>รายละเอียด</th><th style={th}>ขนาด / ความสูง</th><th style={th}>จำนวน</th><th style={th}>หน่วย</th><th style={th}>ราคา/หน่วย</th><th style={th}>จำนวนเงิน</th><th style={th}>จัดการ</th></tr></thead><tbody>
      {items.map((i,index)=>{const p=getProduct(i.product_key),r=calc(i);return <tr key={i.clientId}><td style={td}>{index+1}</td><td style={td}><select style={inputStyle} value={i.product_key} onChange={e=>changeProduct(i.clientId,e.target.value)}>{products().map(x=><option key={x.product_key} value={x.product_key}>{x.name}</option>)}</select></td><td style={td}><input style={inputStyle} value={i.description} disabled={i.product_key!=="custom"} onChange={e=>updateItem(i.clientId,"description",e.target.value)}/></td><td style={td}><input style={inputStyle} value={i.size} onChange={e=>updateItem(i.clientId,"size",e.target.value)} placeholder={p.calculation==="sqm"?"200 x 100":p.calculation==="height_inch"?"20":"-"}/><small style={{display:"block",marginTop:4,color:"#6b7280"}}>{r.text}</small></td><td style={td}><input type="number" min="1" style={inputStyle} value={i.quantity} onChange={e=>updateItem(i.clientId,"quantity",e.target.value)}/></td><td style={td}>{i.unit}</td><td style={td}><input type="number" min="0" step="0.01" style={inputStyle} value={i.unit_price} disabled={p.calculation==="sheet_tier"} onChange={e=>updateItem(i.clientId,"unit_price",e.target.value)}/>{p.calculation==="sheet_tier"&&<small style={{display:"block",marginTop:4,color:"#2563eb"}}>ราคาอัตโนมัติตามจำนวน</small>}</td><td style={{...td,textAlign:"right",fontWeight:800}}>฿{money(r.amount)}</td><td style={td}><button style={{padding:"8px 10px",border:0,borderRadius:6,background:"#dc2626",color:"white"}} onClick={()=>removeItem(i.clientId)}>ลบ</button></td></tr>})}
      </tbody></table></div>
    </section>

    <section style={{display:"grid",gridTemplateColumns:"1fr minmax(300px,420px)",gap:18}}><div style={{background:"white",borderRadius:12,padding:18}}><h2 style={{marginTop:0,fontSize:18}}>หมายเหตุ / เงื่อนไข</h2><textarea rows={8} style={{...inputStyle,resize:"vertical"}} value={quotation.note} onChange={e=>setQuotation({...quotation,note:e.target.value})}/></div><div style={{background:"white",borderRadius:12,padding:18}}><h2 style={{marginTop:0,fontSize:18}}>สรุปราคา</h2><div style={{display:"grid",gap:10}}><label>ส่วนลด (บาท)<input type="number" min="0" style={inputStyle} value={quotation.discount} onChange={e=>setQuotation({...quotation,discount:e.target.value})}/></label><label>VAT (%)<input type="number" min="0" style={inputStyle} value={quotation.vat_percent} onChange={e=>setQuotation({...quotation,vat_percent:e.target.value})}/></label><div>ยอดก่อนลด <strong style={{float:"right"}}>฿{money(subtotal)}</strong></div><div>VAT <strong style={{float:"right"}}>฿{money(vatAmount)}</strong></div><div style={{fontSize:22,borderTop:"1px solid #e5e7eb",paddingTop:12}}>ยอดสุทธิ <strong style={{float:"right",color:"#1d4ed8"}}>฿{money(grandTotal)}</strong></div></div></div></section>

    <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}><button style={secondaryButton} onClick={()=>router.push(`/quotations/${id}`)}>ยกเลิก</button><button style={{...primaryButton,opacity:saving?.6:1}} disabled={saving} onClick={handleSave}>{saving?"กำลังบันทึก...":"บันทึกการแก้ไข"}</button></div>
  </div></main>;
}
