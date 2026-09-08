"use client";
import {useEffect,useMemo,useState} from "react";
import {useSearchParams} from "next/navigation";
import {supabase} from "../../lib/supabase";

const INCOME=["รายได้งานป้าย","เงินมัดจำ","โอนจากลูกค้า","เงินสดรับ","อื่น ๆ"];
const EXPENSE=["ค่าวัสดุ","ค่าแรง","ค่าน้ำมัน/เดินทาง","ค่าเครื่องมือ","ค่าใช้จ่ายสำนักงาน","ภาษี/ค่าธรรมเนียม","ค่าเช่า","ค่าโฆษณา/การตลาด","อื่น ๆ"];
function money(v){return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}
function fmtDate(v){return new Date(v).toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok"});}
const card={background:"white",border:"1px solid #e5e7eb",borderRadius:14,padding:14};

export default function CategoriesPage(){
 const params=useSearchParams(),requested=params.get("category")||"";
 const[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[direction,setDirection]=useState("all"),[selected,setSelected]=useState(requested),[query,setQuery]=useState("");
 async function load(){setLoading(true);setError("");const{data,error}=await supabase.from("finance_transactions").select("*").eq("status","confirmed").order("transaction_date",{ascending:false});if(error)setError(error.message);else setRows(data||[]);setLoading(false);}
 useEffect(()=>{load();},[]);
 const groups=useMemo(()=>{const m={};rows.forEach(x=>{const k=x.category||"อื่น ๆ",d=x.direction==="income"?"income":"expense";m[`${d}:${k}`]??={category:k,direction:d,total:0,count:0};m[`${d}:${k}`].total+=Number(x.amount||0);m[`${d}:${k}`].count++;});return Object.values(m).sort((a,b)=>b.total-a.total);},[rows]);
 const allNames=useMemo(()=>Array.from(new Set([...INCOME,...EXPENSE,...groups.map(x=>x.category)])),[groups]);
 const visibleGroups=groups.filter(x=>(direction==="all"||x.direction===direction)&&(!query||x.category.toLowerCase().includes(query.toLowerCase())));
 const detail=rows.filter(x=>(selected?((x.category||"อื่น ๆ")===selected):false)&&(direction==="all"||x.direction===direction));
 const detailIncome=detail.filter(x=>x.direction==="income").reduce((s,x)=>s+Number(x.amount||0),0),detailExpense=detail.filter(x=>x.direction==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
 return <main style={{minHeight:"100vh",background:"#f4f6f8",padding:"16px 10px 80px",color:"#0f172a"}}><div style={{maxWidth:1180,margin:"auto"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><div><h1 style={{margin:"0 0 4px"}}>🏷️ หมวดหมู่การเงิน</h1><div style={{color:"#64748b"}}>แยกรายรับและรายจ่าย พร้อมดูรายการย่อยจริงจากบัญชี</div></div><div style={{display:"flex",gap:8}}><a href="/finance">การเงิน</a><a href="/finance/reports">📊 รายงาน</a></div></div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"16px 0"}}><button onClick={()=>setDirection("all")} style={pill(direction==="all","#334155")}>ทั้งหมด</button><button onClick={()=>setDirection("income")} style={pill(direction==="income","#0b6cff")}>↑ รายรับ</button><button onClick={()=>setDirection("expense")} style={pill(direction==="expense","#e11d48")}>↓ รายจ่าย</button><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาหมวดหมู่" style={{padding:"10px 12px",border:"1px solid #d1d5db",borderRadius:10,minWidth:220}}/></div>
  {error&&<div style={{color:"#b91c1c",background:"#fef2f2",padding:12,borderRadius:10}}>{error}</div>}
  <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.85fr) minmax(320px,1.4fr)",gap:14}}>
   <section style={card}><h2 style={{marginTop:0}}>สรุปหมวดหมู่</h2>{loading?<p>กำลังโหลด...</p>:<div style={{display:"grid",gap:8}}>{visibleGroups.map(x=>{const active=selected===x.category,color=x.direction==="income"?"#0b6cff":"#e11d48";return <button key={`${x.direction}:${x.category}`} onClick={()=>{setSelected(x.category);setDirection(x.direction);}} style={{textAlign:"left",padding:12,borderRadius:10,border:active?`2px solid ${color}`:"1px solid #e5e7eb",background:active?(x.direction==="income"?"#eff6ff":"#fff1f2"):"white",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>{x.category}</b><b style={{color}}>฿{money(x.total)}</b></div><div style={{fontSize:12,color:"#64748b",marginTop:3}}>{x.direction==="income"?"รายรับ":"รายจ่าย"} • {x.count} รายการ</div></button>})}{visibleGroups.length===0&&<p style={{color:"#64748b"}}>ยังไม่มีข้อมูล</p>}</div>}</section>
   <section style={card}>{selected?<><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><div><h2 style={{margin:"0 0 4px"}}>{selected}</h2><div style={{color:"#64748b"}}>{detail.length} รายการ</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{detailIncome>0&&<span style={{padding:"8px 10px",borderRadius:999,background:"#eff6ff",color:"#0b6cff",fontWeight:800}}>รายรับ ฿{money(detailIncome)}</span>}{detailExpense>0&&<span style={{padding:"8px 10px",borderRadius:999,background:"#fff1f2",color:"#e11d48",fontWeight:800}}>รายจ่าย ฿{money(detailExpense)}</span>}</div></div><div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}><thead><tr><th style={th}>วันที่</th><th style={th}>ประเภท</th><th style={th}>จำนวน</th><th style={th}>Job</th><th style={th}>รายละเอียด</th></tr></thead><tbody>{detail.map(x=><tr key={x.id}><td style={td}>{fmtDate(x.transaction_date)}</td><td style={{...td,color:x.direction==="income"?"#0b6cff":"#e11d48",fontWeight:800}}>{x.direction==="income"?"รายรับ":"รายจ่าย"}</td><td style={{...td,fontWeight:900}}>฿{money(x.amount)}</td><td style={td}>{x.project_name||"-"}</td><td style={td}>{x.description||"-"}</td></tr>)}</tbody></table></div></>:<div style={{padding:30,textAlign:"center",color:"#64748b"}}>เลือกหมวดหมู่ด้านซ้ายเพื่อดูรายการย่อย</div>}</section>
  </div>
  <section style={{...card,marginTop:14}}><h2 style={{marginTop:0}}>หมวดหมู่มาตรฐานที่ระบบรองรับ</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>{allNames.map(name=><div key={name} style={{padding:10,border:"1px solid #e5e7eb",borderRadius:9}}>{name}</div>)}</div><p style={{fontSize:12,color:"#64748b",marginBottom:0}}>หมวดหมู่ในหน้านี้อ้างอิงข้อมูลจริงจากรายการบัญชี การเปลี่ยนชื่อหรือลบหมวดหมู่เดิมควรทำผ่านรายการบัญชีเพื่อไม่ให้ประวัติการเงินคลาดเคลื่อน</p></section>
 </div><style jsx>{`@media(max-width:760px){main div[style*="grid-template-columns: minmax(280px"]{grid-template-columns:1fr!important}}`}</style></main>;
}
function pill(active,color){return{padding:"10px 14px",borderRadius:999,border:active?`2px solid ${color}`:"1px solid #d1d5db",background:active?color:"white",color:active?"white":"#0f172a",fontWeight:800,cursor:"pointer"};}
const th={textAlign:"left",padding:9,borderBottom:"1px solid #e5e7eb",fontSize:12,color:"#64748b"};
const td={padding:9,borderBottom:"1px solid #f1f5f9",fontSize:13};
