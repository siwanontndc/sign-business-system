"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

const menuByRole = {
  owner: ["Dashboard","ลูกค้า","ใบเสนอราคา","ใบแจ้งหนี้","ใบเสร็จรับเงิน","งานผลิต","QC ตรวจสอบงาน","งานติดตั้ง","ส่งมอบ / ปิดงาน","การเงิน","รายงาน","จัดการพนักงาน","ตั้งค่า","ออกจากระบบ"],
  staff: ["Dashboard","ลูกค้า","ใบเสนอราคา","งานผลิต","QC ตรวจสอบงาน","งานติดตั้ง","ส่งมอบ / ปิดงาน","ออกจากระบบ"],
  finance: ["Dashboard","ใบแจ้งหนี้","ใบเสร็จรับเงิน","การเงิน","รายงาน","ออกจากระบบ"],
  production: ["Dashboard","งานผลิต","QC ตรวจสอบงาน","งานติดตั้ง","ส่งมอบ / ปิดงาน","ออกจากระบบ"],
};

const menuRoutes = {
  Dashboard: "/", ลูกค้า: "/customers", ใบเสนอราคา: "/quotations/list", ใบแจ้งหนี้: "/invoices/list", ใบเสร็จรับเงิน: "/receipts/list", งานผลิต: "/production", "QC ตรวจสอบงาน": "/qc", งานติดตั้ง: "/installation", "ส่งมอบ / ปิดงาน": "/delivery", การเงิน: "/finance", รายงาน: "/reports", "จัดการพนักงาน": "/employees", ตั้งค่า: "/settings",
};

const validRoles = ["owner","staff","finance","production"];

export default function HomePage() {
  const router = useRouter();
  const [loading,setLoading] = useState(true);
  const [roleLoading,setRoleLoading] = useState(true);
  const [role,setRole] = useState(null);
  const [email,setEmail] = useState("");
  const [roleError,setRoleError] = useState("");
  const [customers,setCustomers] = useState([]);
  const [quotations,setQuotations] = useState([]);
  const [invoices,setInvoices] = useState([]);
  const [receipts,setReceipts] = useState([]);
  const [productionJobs,setProductionJobs] = useState([]);
  const [qcJobs,setQcJobs] = useState([]);
  const [installationJobs,setInstallationJobs] = useState([]);
  const [deliveryJobs,setDeliveryJobs] = useState([]);

  const menu = role && menuByRole[role] ? menuByRole[role] : [];
  const canSeeFinance = role === "owner" || role === "finance";

  useEffect(()=>{
    let mounted = true;
    async function initialize(){
      try{
        setRoleLoading(true); setLoading(true); setRoleError("");
        const {data:{user},error:userError}=await supabase.auth.getUser();
        if(userError) console.error("GET USER ERROR:",userError);
        if(!user){ window.location.replace("/login"); return; }
        if(!mounted) return;
        setEmail(user.email||"");
        let currentRole=null;
        const {data:rpcRole,error:rpcError}=await supabase.rpc("current_user_role");
        if(!rpcError&&rpcRole){ const normalized=String(rpcRole).trim().toLowerCase(); if(validRoles.includes(normalized)) currentRole=normalized; }
        if(!currentRole){
          const {data:profile}=await supabase.from("profiles").select("id,email,role").eq("id",user.id).maybeSingle();
          if(profile?.role){ const normalized=String(profile.role).trim().toLowerCase(); if(validRoles.includes(normalized)) currentRole=normalized; }
        }
        if(!currentRole&&user.email){
          const {data:profile}=await supabase.from("profiles").select("id,email,role").ilike("email",user.email).maybeSingle();
          if(profile?.role){ const normalized=String(profile.role).trim().toLowerCase(); if(validRoles.includes(normalized)) currentRole=normalized; }
        }
        if(!currentRole){ if(mounted){ setRoleError("ไม่พบสิทธิ์ของบัญชีนี้ในระบบ กรุณาตรวจสอบตาราง profiles"); setRoleLoading(false); setLoading(false); } return; }
        if(!mounted) return;
        setRole(currentRole); setRoleLoading(false); await loadDashboard(currentRole);
      }catch(error){ console.error(error); if(mounted){ setRoleError("เกิดข้อผิดพลาดขณะตรวจสอบสิทธิ์ผู้ใช้งาน"); setRoleLoading(false); setLoading(false); } }
    }
    initialize(); return()=>{mounted=false;};
  },[]);

  async function loadDashboard(currentRole){
    try{
      setLoading(true);
      const customerPromise=supabase.from("customers").select("id, created_at");
      const quotationPromise=supabase.from("quotations").select("id,quotation_no,project_name,grand_total,status,created_at").order("created_at",{ascending:false});
      const productionPromise=supabase.from("production_jobs").select("id, quotation_id, status, created_at");
      const qcPromise=supabase.from("qc_jobs").select("id, production_job_id, status, created_at");
      const installationPromise=supabase.from("installation_jobs").select("id, qc_job_id, quotation_id, status, created_at");
      const deliveryPromise=supabase.from("delivery_jobs").select("id, installation_job_id, status, created_at");
      let invoicePromise=Promise.resolve({data:[],error:null}); let receiptPromise=Promise.resolve({data:[],error:null});
      if(currentRole==="owner"||currentRole==="finance"){
        invoicePromise=supabase.from("invoices").select("id,invoice_no,project_name,grand_total,status,created_at").order("created_at",{ascending:false});
        receiptPromise=supabase.from("receipts").select("id,receipt_no,project_name,grand_total,status,created_at").order("created_at",{ascending:false});
      }
      const [customerResult,quotationResult,invoiceResult,receiptResult,productionResult,qcResult,installationResult,deliveryResult]=await Promise.all([customerPromise,quotationPromise,invoicePromise,receiptPromise,productionPromise,qcPromise,installationPromise,deliveryPromise]);
      setCustomers(customerResult.data||[]); setQuotations(quotationResult.data||[]); setInvoices(invoiceResult.data||[]); setReceipts(receiptResult.data||[]); setProductionJobs(productionResult.data||[]); setQcJobs(qcResult.data||[]); setInstallationJobs(installationResult.data||[]); setDeliveryJobs(deliveryResult.data||[]);
    }finally{setLoading(false);}
  }

  async function handleLogout(){ await supabase.auth.signOut(); window.location.replace("/login"); }
  function handleMenu(item){ if(item==="ออกจากระบบ"){handleLogout();return;} const route=menuRoutes[item]; if(route) router.push(route); }
  function money(v){return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));}
  function roleLabel(v){return v==="owner"?"เจ้าของระบบ":v==="finance"?"การเงิน":v==="production"?"ฝ่ายผลิต":v==="staff"?"พนักงาน":"ไม่ทราบสิทธิ์";}

  const totalSales=useMemo(()=>invoices.filter(x=>x.status==="paid").reduce((s,x)=>s+Number(x.grand_total||0),0),[invoices]);
  const accountsReceivable=useMemo(()=>invoices.filter(x=>x.status==="pending").reduce((s,x)=>s+Number(x.grand_total||0),0),[invoices]);
  const paidInvoices=useMemo(()=>invoices.filter(x=>x.status==="paid").length,[invoices]);
  const activeJobs=useMemo(()=>productionJobs.filter(x=>["ready","producing","in_progress","completed"].includes(x.status)).length+qcJobs.filter(x=>["pending","waiting"].includes(x.status)).length+installationJobs.filter(x=>["waiting","pending","scheduled","installing"].includes(x.status)).length+deliveryJobs.filter(x=>["waiting","delivered"].includes(x.status)).length,[productionJobs,qcJobs,installationJobs,deliveryJobs]);

  const recentItems=useMemo(()=>{
    const q=quotations.slice(0,4).map(x=>({type:"ใบเสนอราคา",no:x.quotation_no,project:x.project_name,total:x.grand_total,status:x.status,href:`/quotations/${x.id}`,created_at:x.created_at}));
    const i=canSeeFinance?invoices.slice(0,4).map(x=>({type:"ใบแจ้งหนี้",no:x.invoice_no,project:x.project_name,total:x.grand_total,status:x.status,href:`/invoices/${x.id}`,created_at:x.created_at})):[];
    const r=canSeeFinance?receipts.slice(0,4).map(x=>({type:"ใบเสร็จ",no:x.receipt_no,project:x.project_name,total:x.grand_total,status:x.status,href:`/receipts/${x.id}`,created_at:x.created_at})):[];
    return [...q,...i,...r].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
  },[quotations,invoices,receipts,canSeeFinance]);

  if(roleLoading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f3f4f6",fontSize:18}}>กำลังตรวจสอบสิทธิ์...</div>;
  if(roleError) return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:30}}><div style={{background:"white",padding:30,borderRadius:14,maxWidth:520,width:"100%"}}><h2>ตรวจสอบสิทธิ์ไม่สำเร็จ</h2><p>{roleError}</p><button onClick={handleLogout}>ออกจากระบบ</button></div></div>;

  return <main className="dashboard-shell" style={{minHeight:"100vh",background:"#f3f4f6",display:"grid",gridTemplateColumns:"240px minmax(0,1fr)",color:"#111827"}}>
    <aside className="dashboard-sidebar" style={{background:"#111827",color:"white",minHeight:"100vh",height:"100vh",overflowY:"auto",position:"sticky",top:0,padding:"24px 16px"}}>
      <div style={{fontSize:20,fontWeight:800,marginBottom:6}}>SIGN BUSINESS</div><div style={{color:"#93c5fd",fontSize:13}}>Management System</div>
      <div style={{marginTop:8,marginBottom:26,color:"#9ca3af",fontSize:12,lineHeight:1.6}}><div>{email}</div><div>สิทธิ์: <strong style={{color:"#fff"}}>{roleLabel(role)}</strong></div></div>
      <div style={{display:"grid",gap:8}}>{menu.map(item=><button key={item} onClick={()=>handleMenu(item)} style={{width:"100%",textAlign:"left",border:"none",background:item==="Dashboard"?"#1f2937":item==="ออกจากระบบ"?"#991b1b":"transparent",color:"white",padding:"11px 12px",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:item==="ออกจากระบบ"?700:500,marginTop:item==="ออกจากระบบ"?10:0}}>{item}</button>)}</div>
    </aside>

    <section className="dashboard-content" style={{padding:32,minWidth:0}}><div style={{maxWidth:1400,margin:"0 auto"}}>
      <div style={{marginBottom:24}}><h1 style={{margin:0,fontSize:32}}>Dashboard</h1><p style={{color:"#6b7280",marginTop:6}}>ภาพรวมระบบ THANEE ADVERTISING</p></div>
      <div className="dashboard-summary-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:20}}>
        {canSeeFinance?<><Card title="ยอดขายรับชำระแล้ว" value={loading?"...":`฿${money(totalSales)}`} sub={`${receipts.length} ใบเสร็จ`} color="#15803d"/><Card title="ลูกหนี้คงค้าง" value={loading?"...":`฿${money(accountsReceivable)}`} sub="Invoice รอชำระ" color="#dc2626"/></>:<Card title="ใบเสนอราคา" value={loading?"...":`${quotations.length} ใบ`} sub="เอกสารในระบบ" color="#2563eb"/>}
        <Card title="งานที่กำลังดำเนินการ" value={loading?"...":`${activeJobs} งาน`} sub="Production + QC + ติดตั้ง + ส่งมอบ" color="#2563eb"/>
        <Card title="ลูกค้าทั้งหมด" value={loading?"...":`${customers.length} ราย`} sub={canSeeFinance?`${paidInvoices} Invoice ชำระแล้ว`:`สิทธิ์ ${roleLabel(role)}`} color="#7c3aed"/>
      </div>
      <div className="dashboard-quick-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:20}}>
        {menu.includes("ใบเสนอราคา")&&<QuickCard title="ใบเสนอราคา" value={`${quotations.length} ใบ`} button="ดูใบเสนอราคา" onClick={()=>router.push("/quotations/list")}/>} {menu.includes("ใบแจ้งหนี้")&&<QuickCard title="ใบแจ้งหนี้" value={`${invoices.length} ใบ`} button="ดูใบแจ้งหนี้" onClick={()=>router.push("/invoices/list")}/>} {menu.includes("ใบเสร็จรับเงิน")&&<QuickCard title="ใบเสร็จรับเงิน" value={`${receipts.length} ใบ`} button="ดูใบเสร็จ" onClick={()=>router.push("/receipts/list")}/>} 
      </div>
      <div className="dashboard-workflow-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
        {menu.includes("งานผลิต")&&<WorkflowCard title="งานผลิต" button="เปิดงานผลิต" onClick={()=>router.push("/production")}/>} {menu.includes("QC ตรวจสอบงาน")&&<WorkflowCard title="QC" button="ตรวจสอบงาน" onClick={()=>router.push("/qc")}/>} {menu.includes("งานติดตั้ง")&&<WorkflowCard title="งานติดตั้ง" button="เปิดงานติดตั้ง" onClick={()=>router.push("/installation")}/>} {menu.includes("ส่งมอบ / ปิดงาน")&&<WorkflowCard title="ส่งมอบ" button="ส่งมอบ / ปิดงาน" onClick={()=>router.push("/delivery")}/>} 
      </div>
      <div style={{background:"white",borderRadius:14,padding:20,border:"1px solid #e5e7eb"}}><h2 style={{marginTop:0,fontSize:20}}>รายการล่าสุด</h2>{recentItems.length===0?<p>ยังไม่มีข้อมูล</p>:recentItems.map((x,i)=><div key={`${x.type}-${x.no}-${i}`} onClick={()=>router.push(x.href)} style={{display:"grid",gridTemplateColumns:"120px minmax(0,1fr) 130px",gap:12,padding:"12px 0",borderTop:i?"1px solid #eee":"none",cursor:"pointer"}}><strong>{x.type}</strong><span>{x.no} · {x.project||"-"}</span><span style={{textAlign:"right"}}>฿{money(x.total)}</span></div>)}</div>
    </div></section>
  </main>;
}

function Card({title,value,sub,color}){return <div style={{background:"white",borderRadius:14,padding:20,border:"1px solid #e5e7eb",minWidth:0}}><div style={{fontSize:14,color:"#6b7280",marginBottom:10}}>{title}</div><div style={{fontSize:28,fontWeight:800,color,overflowWrap:"anywhere"}}>{value}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:7}}>{sub}</div></div>}
function QuickCard({title,value,button,onClick}){return <div style={{background:"white",borderRadius:14,padding:20,border:"1px solid #e5e7eb"}}><div style={{fontWeight:700}}>{title}</div><div style={{fontSize:24,fontWeight:800,margin:"8px 0 14px"}}>{value}</div><button onClick={onClick} style={{width:"100%",border:0,borderRadius:9,padding:10,background:"#e5e7eb",cursor:"pointer"}}>{button}</button></div>}
function WorkflowCard({title,button,onClick}){return <div style={{background:"white",borderRadius:14,padding:18,border:"1px solid #e5e7eb"}}><div style={{fontWeight:800,marginBottom:12}}>{title}</div><button onClick={onClick} style={{width:"100%",border:0,borderRadius:9,padding:10,background:"#111827",color:"white",cursor:"pointer"}}>{button}</button></div>}
