"use client";
import {useEffect,useMemo,useState} from "react";
import {useSearchParams,useRouter} from "next/navigation";
import {supabase} from "../../../lib/supabase";

function money(v){return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}
function thaiDate(v){return new Date(v).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"});}
const months=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export default function FinanceSlipReportPage(){
  const params=useSearchParams();
  const router=useRouter();
  const direction=params.get("direction")==="expense"?"expense":"income";
  const month=Number(params.get("month")||new Date().getMonth()+1);
  const year=Number(params.get("year")||new Date().getFullYear());
  const [rows,setRows]=useState([]),[urls,setUrls]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState("");

  useEffect(()=>{load()},[direction,month,year]);

  async function load(){
    setLoading(true);setError("");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.push("/login");return;}
    const start=new Date(Date.UTC(year,month-1,1,-7,0,0)).toISOString();
    const end=new Date(Date.UTC(year,month,1,-7,0,0)).toISOString();
    const {data,error}=await supabase.from("finance_transactions")
      .select("id,transaction_date,direction,amount,category,description,project_name,source,evidence_path,reference_no,counterparty,bank_name")
      .eq("status","confirmed")
      .eq("direction",direction)
      .gte("transaction_date",start)
      .lt("transaction_date",end)
      .order("transaction_date",{ascending:true});
    if(error){setError(error.message);setRows([]);setLoading(false);return;}
    const list=data||[];setRows(list);
    const signed={};
    await Promise.all(list.filter(x=>x.evidence_path).map(async x=>{
      const bucket=x.source==="line"?"line-account":"finance-evidence";
      const {data:s,error:e}=await supabase.storage.from(bucket).createSignedUrl(x.evidence_path,1800);
      if(!e&&s?.signedUrl)signed[x.id]=s.signedUrl;
    }));
    setUrls(signed);setLoading(false);
  }

  const total=useMemo(()=>rows.reduce((s,x)=>s+Number(x.amount||0),0),[rows]);
  const byCategory=useMemo(()=>{const m={};rows.forEach(x=>{const k=x.category||"อื่น ๆ";m[k]=(m[k]||0)+Number(x.amount||0)});return Object.entries(m).sort((a,b)=>b[1]-a[1]);},[rows]);
  const title=direction==="income"?"รายงานรายรับ / เงินโอนเข้า":"รายงานรายจ่าย / เงินโอนออก";

  return <main className="report-root">
    <div className="toolbar no-print">
      <button onClick={()=>router.back()}>← กลับ</button>
      <button onClick={()=>window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
    </div>

    <section className="page summary-page">
      <div className="brand">THANEE ADVERTISING</div>
      <h1>{title}</h1>
      <div className="period">{months[month-1]} {year+543}</div>
      <div className="summary-box">
        <div><span>จำนวนรายการ</span><b>{rows.length} รายการ</b></div>
        <div><span>{direction==="income"?"รายรับรวม":"รายจ่ายรวม"}</span><b>฿{money(total)}</b></div>
      </div>

      <h2>สรุปตามหมวด</h2>
      <table>
        <thead><tr><th>หมวด</th><th className="num">จำนวนเงิน</th></tr></thead>
        <tbody>{byCategory.map(([k,v])=><tr key={k}><td>{k}</td><td className="num">฿{money(v)}</td></tr>)}</tbody>
      </table>

      <h2>รายการทั้งหมด</h2>
      <table>
        <thead><tr><th>วันที่</th><th>รายละเอียด</th><th>คู่ค้า</th><th>เลขอ้างอิง</th><th className="num">จำนวน</th></tr></thead>
        <tbody>{rows.map(x=><tr key={x.id}><td>{new Date(x.transaction_date).toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok"})}</td><td>{x.description||x.project_name||"-"}</td><td>{x.counterparty||"-"}</td><td>{x.reference_no||"-"}</td><td className="num">฿{money(x.amount)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan="4"><b>รวม</b></td><td className="num"><b>฿{money(total)}</b></td></tr></tfoot>
      </table>
      {loading&&<p>กำลังโหลดข้อมูล...</p>}
      {error&&<p className="error">{error}</p>}
    </section>

    {rows.map((x,i)=><section className="page slip-page" key={x.id}>
      <div className="slip-head">
        <div>
          <div className="brand small">THANEE ADVERTISING</div>
          <h2>{direction==="income"?"หลักฐานเงินโอนเข้า":"หลักฐานเงินโอนออก"} #{i+1}</h2>
        </div>
        <div className="amount">฿{money(x.amount)}</div>
      </div>
      <div className="meta">
        <div><span>วันที่</span><b>{thaiDate(x.transaction_date)}</b></div>
        <div><span>หมวด</span><b>{x.category||"อื่น ๆ"}</b></div>
        <div><span>รายละเอียด</span><b>{x.description||x.project_name||"-"}</b></div>
        <div><span>คู่ค้า</span><b>{x.counterparty||"-"}</b></div>
        <div><span>ธนาคาร</span><b>{x.bank_name||"-"}</b></div>
        <div><span>เลขอ้างอิง</span><b>{x.reference_no||"-"}</b></div>
      </div>
      <div className="slip-wrap">
        {urls[x.id]?<img src={urls[x.id]} alt="slip"/>:<div className="no-slip">ไม่มีสลิปแนบในรายการนี้</div>}
      </div>
      <div className="footer">รายการ {i+1} / {rows.length} • {months[month-1]} {year+543}</div>
    </section>)}

    <style dangerouslySetInnerHTML={{__html:
      'body{margin:0;background:#eef1f4;color:#111827;font-family:Arial,"Noto Sans Thai",sans-serif}' +
      '.report-root{padding:18px}.toolbar{max-width:1100px;margin:0 auto 12px;display:flex;gap:8px;justify-content:flex-end}' +
      '.toolbar button{padding:10px 14px;border:1px solid #cbd5e1;background:white;border-radius:8px;font-weight:700}' +
      '.page{width:210mm;min-height:297mm;box-sizing:border-box;margin:0 auto 18px;background:white;padding:16mm 14mm;box-shadow:0 3px 16px rgba(0,0,0,.08)}' +
      '.brand{font-weight:900;letter-spacing:.12em;color:#be185d}.brand.small{font-size:12px}' +
      'h1{margin:6px 0 4px;font-size:28px}.period{font-size:18px;color:#475569;margin-bottom:18px}' +
      '.summary-box{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.summary-box>div{border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px}' +
      '.summary-box span,.meta span{font-size:12px;color:#64748b}.summary-box b{font-size:24px}h2{margin:18px 0 8px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top}th{background:#f8fafc;text-align:left}.num{text-align:right}' +
      '.slip-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:12px}.slip-head h2{margin:5px 0 0}.amount{font-size:28px;font-weight:900}' +
      '.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin:16px 0}.meta>div{display:flex;flex-direction:column;gap:3px}' +
      '.slip-wrap{height:190mm;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;overflow:hidden}.slip-wrap img{max-width:100%;max-height:100%;object-fit:contain}.no-slip{color:#94a3b8;font-size:18px}.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:8px}.error{color:#b91c1c}' +
      '@media print{body{background:white}.no-print{display:none!important}.report-root{padding:0}.page{margin:0;box-shadow:none;page-break-after:always;width:210mm;min-height:297mm}.page:last-child{page-break-after:auto}}' +
      '@page{size:A4;margin:0}@media(max-width:850px){.page{width:100%;min-height:auto;padding:18px}.meta{grid-template-columns:1fr}.slip-wrap{height:65vh}.summary-box{grid-template-columns:1fr}.report-root{padding:8px}}'
    }} />
  </main>
}
