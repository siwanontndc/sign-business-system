"use client";
import { useEffect,useRef,useState } from "react";
import { useParams,useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SurveyDetailPage(){
  const {id}=useParams(); const router=useRouter(); const fileRef=useRef(null);
  const [survey,setSurvey]=useState(null),[media,setMedia]=useState([]),[customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false);
  useEffect(()=>{ if(id) load(); },[id]);
  async function load(){
    const {data:{user}}=await supabase.auth.getUser(); if(!user){ router.replace('/login'); return; }
    const [{data:s,error},{data:m},{data:c}]=await Promise.all([
      supabase.from('site_surveys').select('*').eq('id',id).single(),
      supabase.from('survey_media').select('*').eq('survey_id',id).order('created_at',{ascending:false}),
      supabase.from('customers').select('id,customer_code,company_name,contact_name,phone').order('created_at',{ascending:false})
    ]);
    if(error){ alert(error.message); return; }
    setSurvey(s); setMedia(m||[]); setCustomers(c||[]); setLoading(false);
  }
  function set(k,v){ setSurvey(x=>({...x,[k]:v})); }
  function chooseCustomer(v){ const c=customers.find(x=>x.id===v); setSurvey(x=>({...x,customer_id:v||null,customer_name:c?(c.company_name||c.contact_name||c.customer_code):x.customer_name,contact_name:c?.contact_name||x.contact_name,phone:c?.phone||x.phone})); }
  async function save(){
    setSaving(true);
    const {error}=await supabase.from('site_surveys').update({customer_id:survey.customer_id||null,customer_name:survey.customer_name,contact_name:survey.contact_name||null,phone:survey.phone||null,project_name:survey.project_name||null,location_text:survey.location_text||null,dimensions:survey.dimensions||null,electrical_notes:survey.electrical_notes||null,access_notes:survey.access_notes||null,note:survey.note||null,status:survey.status,updated_at:new Date().toISOString()}).eq('id',id);
    setSaving(false); if(error) alert(error.message); else alert('บันทึกงานสำรวจแล้ว');
  }
  async function upload(e){
    const files=Array.from(e.target.files||[]); e.target.value=''; if(!files.length)return;
    const {data:{user}}=await supabase.auth.getUser(); setUploading(true);
    try{
      for(const f of files){
        if(f.size>15*1024*1024) throw new Error(f.name+' เกิน 15 MB');
        const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`surveys/${id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
        const {error:ue}=await supabase.storage.from('job-media').upload(path,f,{cacheControl:'3600',upsert:false}); if(ue)throw ue;
        const {error:ie}=await supabase.from('survey_media').insert({survey_id:id,file_name:f.name,storage_path:path,mime_type:f.type||null,file_size:f.size,source:'app',captured_at:new Date().toISOString(),uploaded_by:user.id});
        if(ie){ await supabase.storage.from('job-media').remove([path]); throw ie; }
      }
      await load();
    }catch(err){ alert('อัปโหลดไม่สำเร็จ: '+err.message); } finally { setUploading(false); }
  }
  async function remove(item){ if(!confirm('ลบรูปนี้?'))return; await supabase.storage.from('job-media').remove([item.storage_path]); await supabase.from('survey_media').delete().eq('id',item.id); load(); }
  function url(p){ return supabase.storage.from('job-media').getPublicUrl(p).data.publicUrl; }
  async function toQuotation(){ if(!survey.customer_id)return alert('กรุณาเลือกลูกค้าในระบบก่อนสร้างใบเสนอราคา'); await supabase.from('site_surveys').update({status:'ready_to_quote',updated_at:new Date().toISOString()}).eq('id',id); router.push(`/quotations/new?survey=${id}`); }
  const inp={width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #d1d5db',borderRadius:8};
  if(loading||!survey)return <main style={{padding:30}}>กำลังโหลด...</main>;
  return <main style={{minHeight:'100vh',background:'#f3f4f6',padding:24,color:'#111827'}}><div style={{maxWidth:1400,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}><div><div style={{color:'#be185d',fontWeight:900}}>{survey.survey_no}</div><h1 style={{margin:'3px 0'}}>📍 {survey.customer_name}</h1><div style={{color:'#6b7280'}}>{survey.project_name||'งานสำรวจหน้างาน'}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>router.push('/surveys')}>← งานสำรวจ</button><button onClick={toQuotation} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#111827',color:'white',fontWeight:900}}>สร้างใบเสนอราคาจากงานนี้ →</button></div></div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(320px,460px) 1fr',gap:18,alignItems:'start'}}>
      <section style={{background:'white',padding:18,borderRadius:14,border:'1px solid #e5e7eb'}}><h2 style={{marginTop:0}}>ข้อมูลสำรวจ</h2>
        <label>ลูกค้าในระบบ<select style={{...inp,marginTop:5,marginBottom:10}} value={survey.customer_id||''} onChange={e=>chooseCustomer(e.target.value)}><option value=''>-- ยังไม่ผูกลูกค้า --</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code||'-'} — {c.company_name||c.contact_name}</option>)}</select></label>
        {[['customer_name','ชื่อลูกค้า'],['contact_name','ผู้ติดต่อ'],['phone','โทรศัพท์'],['project_name','ชื่องาน'],['location_text','สถานที่'],['dimensions','ขนาด/ระยะวัด'],['electrical_notes','ระบบไฟ'],['access_notes','ทางเข้าติดตั้ง/รถกระเช้า']].map(([k,l])=><label key={k} style={{display:'block',marginBottom:10}}>{l}<input style={{...inp,marginTop:5}} value={survey[k]||''} onChange={e=>set(k,e.target.value)}/></label>)}
        <label>หมายเหตุ<textarea style={{...inp,marginTop:5,minHeight:90}} value={survey.note||''} onChange={e=>set('note',e.target.value)}/></label>
        <label style={{display:'block',marginTop:10}}>สถานะ<select style={{...inp,marginTop:5}} value={survey.status} onChange={e=>set('status',e.target.value)}><option value='surveying'>กำลังสำรวจ</option><option value='ready_to_quote'>พร้อมเสนอราคา</option><option value='quoted'>ออกใบเสนอราคาแล้ว</option><option value='cancelled'>ยกเลิก</option></select></label>
        <button onClick={save} disabled={saving} style={{width:'100%',marginTop:14,padding:12,border:0,borderRadius:9,background:'#be185d',color:'white',fontWeight:900}}>{saving?'กำลังบันทึก...':'💾 บันทึกข้อมูลสำรวจ'}</button>
      </section>
      <section style={{background:'white',padding:18,borderRadius:14,border:'1px solid #e5e7eb'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><div><h2 style={{margin:0}}>รูปสำรวจหน้างาน</h2><div style={{color:'#6b7280',fontSize:13}}>จากมือถือหรือ LINE กลุ่ม</div></div><button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#2563eb',color:'white',fontWeight:900}}>{uploading?'กำลังอัปโหลด...':'＋ เพิ่มรูป'}</button><input ref={fileRef} hidden type='file' accept='image/*' multiple onChange={upload}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:12,marginTop:14}}>{media.length===0&&<div style={{color:'#6b7280',padding:20}}>ยังไม่มีรูปสำรวจ</div>}{media.map(m=><div key={m.id} style={{border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden'}}><img src={url(m.storage_path)} alt={m.file_name} style={{width:'100%',height:160,objectFit:'cover',display:'block'}}/><div style={{padding:9,fontSize:12}}><div style={{fontWeight:800}}>{m.source==='line'?'LINE':'APP'}</div><div style={{color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.file_name}</div><button onClick={()=>remove(m)} style={{marginTop:7,border:0,background:'#fee2e2',color:'#991b1b',padding:'6px 8px',borderRadius:6}}>ลบ</button></div></div>)}</div>
      </section>
    </div>
  </div></main>;
}
