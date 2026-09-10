"use client";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";

const box={background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(15,23,42,.05)"};
const btn={border:0,borderRadius:10,padding:"11px 14px",fontWeight:800,fontSize:15,cursor:"pointer"};

function Row({label,status,detail}){
  const ok=status==="ok",bad=status==="bad";
  const icon=ok?"✅":bad?"❌":"⏳";
  return <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:12,padding:"12px 0",borderBottom:"1px solid #f1f5f9",alignItems:"start"}}>
    <div style={{minWidth:0}}><strong>{label}</strong>{detail&&<div style={{marginTop:4,color:bad?"#b91c1c":"#64748b",fontSize:13,overflowWrap:"anywhere"}}>{detail}</div>}</div>
    <div style={{fontWeight:800,whiteSpace:"nowrap"}}>{icon} {ok?"พร้อม":bad?"มีปัญหา":"กำลังตรวจ"}</div>
  </div>;
}

export default function FinanceSystemCheck(){
  const[checks,setChecks]=useState({supabase:{status:"wait",detail:""},storage:{status:"wait",detail:""},ai:{status:"wait",detail:""}});
  const[loading,setLoading]=useState(false);

  async function run(){
    setLoading(true);
    setChecks({supabase:{status:"wait",detail:""},storage:{status:"wait",detail:""},ai:{status:"wait",detail:""}});

    try{
      const{error}=await supabase.from("line_account_entries").select("id",{head:true,count:"exact"}).limit(1);
      setChecks(p=>({...p,supabase:error?{status:"bad",detail:error.message}:{status:"ok",detail:"เชื่อมต่อฐานข้อมูลได้"}}));
    }catch(e){setChecks(p=>({...p,supabase:{status:"bad",detail:e?.message||"เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}}));}

    try{
      const{error}=await supabase.storage.from("line-account").list("",{limit:1});
      setChecks(p=>({...p,storage:error?{status:"bad",detail:error.message}:{status:"ok",detail:"เข้าถึงพื้นที่เก็บสลิปได้"}}));
    }catch(e){setChecks(p=>({...p,storage:{status:"bad",detail:e?.message||"เข้าถึง Storage ไม่สำเร็จ"}}));}

    try{
      const r=await fetch("/api/finance/slip-ai?live=1",{cache:"no-store"});
      const j=await r.json().catch(()=>null);
      if(r.ok&&j?.ok)setChecks(p=>({...p,ai:{status:"ok",detail:`OpenAI พร้อม • ${j.model||"model ไม่ระบุ"}`}}));
      else setChecks(p=>({...p,ai:{status:"bad",detail:[j?.error,j?.code,j?.detail].filter(Boolean).join(" • ")||`HTTP ${r.status}`}}));
    }catch(e){setChecks(p=>({...p,ai:{status:"bad",detail:e?.message||"เรียก AI ไม่สำเร็จ"}}));}

    setLoading(false);
  }

  useEffect(()=>{run();},[]);
  const all=Object.values(checks).every(x=>x.status==="ok");
  return <main style={{minHeight:"100vh",background:"#f4f6f8",padding:"18px 12px 80px",color:"#111827"}}>
    <div style={{maxWidth:760,margin:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <div><h1 style={{margin:"0 0 5px",fontSize:28}}>🩺 ตรวจระบบการเงิน</h1><div style={{color:"#64748b"}}>เช็กฐานข้อมูล Storage และ AI ก่อนใช้งานจริง</div></div>
        <button disabled={loading} onClick={run} style={{...btn,background:"#111827",color:"white",opacity:loading?0.65:1}}>{loading?"กำลังตรวจ...":"ตรวจใหม่"}</button>
      </div>
      <section style={box}>
        <Row label="Supabase Database" {...checks.supabase}/>
        <Row label="Slip Storage" {...checks.storage}/>
        <Row label="OpenAI Vision / API" {...checks.ai}/>
        <div style={{marginTop:16,padding:14,borderRadius:12,background:all?"#ecfdf5":"#fff7ed",fontWeight:800,color:all?"#047857":"#9a3412"}}>{all?"✅ ระบบหลักพร้อมใช้งาน":"⚠️ ยังมีส่วนที่ต้องแก้ก่อนใช้งาน"}</div>
      </section>
      <div style={{marginTop:12,color:"#64748b",fontSize:13}}>หน้านี้ไม่แสดง API Key และไม่ส่งสลิปจริงไปทดสอบ การตรวจ AI ใช้คำสั่งสั้น ๆ เท่านั้น</div>
    </div>
  </main>;
}
