"use client";
import { useEffect,useState } from "react";
import { useParams,useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function SurveyQuotationPage(){
  const {id}=useParams(); const router=useRouter(); const [message,setMessage]=useState('กำลังสร้างใบเสนอราคาจากงานสำรวจ...');
  useEffect(()=>{ if(id) create(); },[id]);
  async function create(){
    try{
      const {data:{user}}=await supabase.auth.getUser(); if(!user){router.replace('/login');return;}
      const {data:s,error}=await supabase.from('site_surveys').select('*').eq('id',id).single(); if(error)throw error;
      if(s.quotation_id){ router.replace(`/quotations/${s.quotation_id}/edit`); return; }
      if(!s.customer_id) throw new Error('กรุณากลับไปผูกงานสำรวจกับลูกค้าในระบบก่อน');
      const now=new Date(); const quotationNo=`QT-${now.getFullYear()}-${Math.floor(100000+Math.random()*900000)}`;
      const surveyNote=[`อ้างอิงงานสำรวจ ${s.survey_no}`,s.location_text&&`สถานที่: ${s.location_text}`,s.dimensions&&`ขนาด/ระยะ: ${s.dimensions}`,s.electrical_notes&&`ระบบไฟ: ${s.electrical_notes}`,s.access_notes&&`การเข้าติดตั้ง: ${s.access_notes}`,s.note].filter(Boolean).join('\n');
      const {data:q,error:qe}=await supabase.from('quotations').insert({customer_id:s.customer_id,quotation_no:quotationNo,project_name:s.project_name||`งานจากการสำรวจ ${s.survey_no}`,quotation_date:now.toISOString().slice(0,10),valid_days:30,subtotal:0,discount:0,vat_percent:0,vat_amount:0,grand_total:0,status:'draft',note:surveyNote}).select().single(); if(qe)throw qe;
      const {error:ie}=await supabase.from('quotation_items').insert({quotation_id:q.id,description:`รายการตามงานสำรวจ ${s.survey_no}`,size:s.dimensions||null,quantity:1,unit:'งาน',unit_price:0,amount:0,sort_order:1}); if(ie){await supabase.from('quotations').delete().eq('id',q.id);throw ie;}
      const {error:se}=await supabase.from('site_surveys').update({quotation_id:q.id,status:'quoted',updated_at:new Date().toISOString()}).eq('id',id); if(se)throw se;
      setMessage(`สร้าง ${quotationNo} แล้ว กำลังเปิดหน้าแก้ไข...`); router.replace(`/quotations/${q.id}/edit`);
    }catch(e){setMessage('สร้างใบเสนอราคาไม่สำเร็จ: '+(e?.message||'เกิดข้อผิดพลาด'));}
  }
  return <main style={{padding:32,fontFamily:'sans-serif'}}><h2>{message}</h2><button onClick={()=>router.push(`/surveys/${id}`)}>กลับงานสำรวจ</button></main>;
}
