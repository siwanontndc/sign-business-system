"use client";
import { useEffect,useRef,useState } from "react";
import { useParams,useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const SIMILARITY_DISTANCE = 8;

function hammingDistance(a,b){
  if(!a||!b||a.length!==b.length)return 999;
  let n=0;
  for(let i=0;i<a.length;i++){
    const x=parseInt(a[i],16)^parseInt(b[i],16);
    n += x.toString(2).split("1").length-1;
  }
  return n;
}

async function sha256Hex(blob){
  const buf=await blob.arrayBuffer();
  const hash=await crypto.subtle.digest("SHA-256",buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function perceptualHash(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement("canvas");
  canvas.width=9; canvas.height=8;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0,9,8);
  bitmap.close?.();
  const data=ctx.getImageData(0,0,9,8).data;
  let bits="";
  for(let y=0;y<8;y++){
    for(let x=0;x<8;x++){
      const i=(y*9+x)*4, j=(y*9+x+1)*4;
      const g1=data[i]*.299+data[i+1]*.587+data[i+2]*.114;
      const g2=data[j]*.299+data[j+1]*.587+data[j+2]*.114;
      bits += g1>g2?"1":"0";
    }
  }
  let hex="";
  for(let i=0;i<64;i+=4) hex += parseInt(bits.slice(i,i+4),2).toString(16);
  return hex;
}

export default function SurveyDetailPage(){
  const {id}=useParams(); const router=useRouter(); const fileRef=useRef(null);
  const [survey,setSurvey]=useState(null),[media,setMedia]=useState([]),[customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[analyzing,setAnalyzing]=useState(false);
  useEffect(()=>{ if(id) load(); },[id]);

  async function load(){
    const {data:{user}}=await supabase.auth.getUser(); if(!user){ router.replace('/login'); return; }
    const [{data:s,error},{data:m},{data:c}]=await Promise.all([
      supabase.from('site_surveys').select('*').eq('id',id).single(),
      supabase.from('survey_media').select('*').eq('survey_id',id).order('created_at',{ascending:true}),
      supabase.from('customers').select('id,customer_code,company_name,contact_name,phone').order('created_at',{ascending:false})
    ]);
    if(error){ alert(error.message); return; }
    setSurvey(s); setMedia((m||[]).slice().reverse()); setCustomers(c||[]); setLoading(false);
    if((m||[]).some(x=>!x.perceptual_hash&&x.mime_type?.startsWith('image/'))) analyzeExisting(m||[]);
  }

  async function analyzeExisting(rows){
    if(analyzing)return; setAnalyzing(true);
    try{
      const chronological=[...rows].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      const processed=[];
      for(const item of chronological){
        if(!item.mime_type?.startsWith('image/')){processed.push(item);continue;}
        let ph=item.perceptual_hash;
        try{
          if(!ph){
            const r=await fetch(url(item.storage_path));
            if(r.ok) ph=await perceptualHash(await r.blob());
          }
        }catch{}
        let best=null,bestDist=999;
        if(ph){
          for(const prev of processed){
            if(!prev.perceptual_hash)continue;
            const d=hammingDistance(ph,prev.perceptual_hash);
            if(d<bestDist){bestDist=d;best=prev;}
          }
        }
        const similar=best&&bestDist<=SIMILARITY_DISTANCE;
        const version=similar?Number(best.media_version||1)+1:1;
        const patch={perceptual_hash:ph||null,similar_to_id:similar?best.id:null,similarity_score:similar?Math.round(((64-bestDist)/64)*100):null,media_version:version};
        if(ph && (item.perceptual_hash!==ph||item.similar_to_id!==patch.similar_to_id||Number(item.media_version||1)!==version)){
          await supabase.from('survey_media').update(patch).eq('id',item.id);
        }
        processed.push({...item,...patch});
      }
      setMedia(processed.slice().reverse());
    }finally{setAnalyzing(false);}
  }

  function set(k,v){ setSurvey(x=>({...x,[k]:v})); }
  function chooseCustomer(v){ const c=customers.find(x=>x.id===v); setSurvey(x=>({...x,customer_id:v||null,customer_name:c?(c.company_name||c.contact_name||c.customer_code):x.customer_name,contact_name:c?.contact_name||x.contact_name,phone:c?.phone||x.phone})); }
  function localDateTime(v){ if(!v)return''; const d=new Date(v),z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
  async function persistSurvey(nextStatus=survey.status){
    return supabase.from('site_surveys').update({customer_id:survey.customer_id||null,customer_name:survey.customer_name,contact_name:survey.contact_name||null,phone:survey.phone||null,scheduled_at:survey.scheduled_at?new Date(survey.scheduled_at).toISOString():null,project_name:survey.project_name||null,location_text:survey.location_text||null,dimensions:survey.dimensions||null,electrical_notes:survey.electrical_notes||null,access_notes:survey.access_notes||null,note:survey.note||null,status:nextStatus,updated_at:new Date().toISOString()}).eq('id',id);
  }
  async function save(){ setSaving(true); const {error}=await persistSurvey(); setSaving(false); if(error) alert(error.message); else alert('บันทึกงานสำรวจแล้ว'); }

  async function upload(e){
    const files=Array.from(e.target.files||[]); e.target.value=''; if(!files.length)return;
    const {data:{user}}=await supabase.auth.getUser(); setUploading(true);
    let skipped=0,similarCount=0,saved=0;
    try{
      for(const f of files){
        if(f.size>15*1024*1024) throw new Error(f.name+' เกิน 15 MB');
        const contentHash=await sha256Hex(f);
        const {data:dup}=await supabase.from('survey_media').select('id,file_name').eq('survey_id',id).eq('content_hash',contentHash).maybeSingle();
        if(dup){skipped++;continue;}
        const ph=f.type.startsWith('image/')?await perceptualHash(f):null;
        let best=null,bestDist=999;
        if(ph){
          for(const old of media){
            if(!old.perceptual_hash)continue;
            const d=hammingDistance(ph,old.perceptual_hash);
            if(d<bestDist){bestDist=d;best=old;}
          }
        }
        const similar=best&&bestDist<=SIMILARITY_DISTANCE;
        const version=similar?Number(best.media_version||1)+1:1;
        if(similar)similarCount++;
        const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`surveys/${id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
        const {error:ue}=await supabase.storage.from('job-media').upload(path,f,{cacheControl:'3600',upsert:false}); if(ue)throw ue;
        const {error:ie}=await supabase.from('survey_media').insert({survey_id:id,file_name:f.name,storage_path:path,mime_type:f.type||null,file_size:f.size,source:'app',captured_at:new Date().toISOString(),uploaded_by:user.id,content_hash:contentHash,perceptual_hash:ph,similar_to_id:similar?best.id:null,similarity_score:similar?Math.round(((64-bestDist)/64)*100):null,media_version:version,note:similar?`ภาพคล้ายกับ ${best.file_name} — เก็บเป็นเวอร์ชันแก้ไข V${version}`:null});
        if(ie){ await supabase.storage.from('job-media').remove([path]); throw ie; }
        saved++;
      }
      await load();
      const msg=[saved?`บันทึก ${saved} รูป`:null,skipped?`ข้ามรูปซ้ำจริง ${skipped} รูป`:null,similarCount?`พบภาพคล้าย/งานแก้ไข ${similarCount} รูป`:null].filter(Boolean).join('\n');
      if(msg)alert(msg);
    }catch(err){ alert('อัปโหลดไม่สำเร็จ: '+err.message); } finally { setUploading(false); }
  }

  async function remove(item){ if(!confirm('ลบรูปนี้?'))return; await supabase.storage.from('job-media').remove([item.storage_path]); await supabase.from('survey_media').delete().eq('id',item.id); load(); }
  function url(p){ return supabase.storage.from('job-media').getPublicUrl(p).data.publicUrl; }
  async function toQuotation(){ if(!survey.customer_id)return alert('กรุณาเลือกลูกค้าในระบบก่อนสร้างใบเสนอราคา'); setSaving(true); const {error}=await persistSurvey('ready_to_quote'); setSaving(false); if(error) return alert('บันทึกงานสำรวจไม่สำเร็จ: '+error.message); router.push(`/surveys/${id}/quotation`); }
  async function cancelSurvey(){
    if(!confirm('ยกเลิกงานสำรวจนี้?\nข้อมูลและรูปจะยังเก็บไว้ และสามารถเปิดกลับภายหลังได้'))return;
    setSaving(true);
    const {error}=await supabase.from('site_surveys').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id);
    await supabase.from('survey_line_contexts').delete().eq('survey_id',id);
    setSaving(false);
    if(error)return alert('ยกเลิกไม่สำเร็จ: '+error.message);
    router.push('/surveys');
  }
  async function restoreSurvey(){
    setSaving(true); const {error}=await supabase.from('site_surveys').update({status:'surveying',updated_at:new Date().toISOString()}).eq('id',id); setSaving(false);
    if(error)return alert(error.message); setSurvey(x=>({...x,status:'surveying'}));
  }

  const inp={width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #d1d5db',borderRadius:8};
  if(loading||!survey)return <main style={{padding:30}}>กำลังโหลด...</main>;
  return <main style={{minHeight:'100vh',background:'#f3f4f6',padding:24,color:'#111827'}}><div style={{maxWidth:1400,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}><div><div style={{color:'#be185d',fontWeight:900}}>{survey.survey_no}</div><h1 style={{margin:'3px 0'}}>📍 {survey.customer_name}</h1><div style={{color:'#6b7280'}}>{survey.project_name||'งานสำรวจหน้างาน'} {survey.status==='cancelled'&&<b style={{color:'#b91c1c'}}>• ยกเลิกแล้ว</b>}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>router.push('/surveys')}>← งานสำรวจ</button>{survey.status==='cancelled'?<button onClick={restoreSurvey} disabled={saving} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#166534',color:'white',fontWeight:900}}>↩ เปิดงานนี้อีกครั้ง</button>:<><button onClick={cancelSurvey} disabled={saving} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#fee2e2',color:'#991b1b',fontWeight:900}}>ยกเลิกงานสำรวจ</button><button onClick={toQuotation} disabled={saving} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#111827',color:'white',fontWeight:900}}>{survey.quotation_id?'เปิดใบเสนอราคาที่เชื่อมแล้ว →':'สร้างใบเสนอราคาจากงานนี้ →'}</button></>}</div></div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(320px,460px) 1fr',gap:18,alignItems:'start'}}>
      <section style={{background:'white',padding:18,borderRadius:14,border:'1px solid #e5e7eb'}}><h2 style={{marginTop:0}}>ข้อมูลสำรวจ</h2>
        <label>ลูกค้าในระบบ<select style={{...inp,marginTop:5,marginBottom:10}} value={survey.customer_id||''} onChange={e=>chooseCustomer(e.target.value)}><option value=''>-- ยังไม่ผูกลูกค้า --</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code||'-'} — {c.company_name||c.contact_name}</option>)}</select></label>
        {[['customer_name','ชื่อลูกค้า'],['contact_name','ผู้ติดต่อ'],['phone','โทรศัพท์'],['project_name','ชื่องาน'],['location_text','สถานที่'],['dimensions','ขนาด/ระยะวัด'],['electrical_notes','ระบบไฟ'],['access_notes','ทางเข้าติดตั้ง/รถกระเช้า']].map(([k,l])=><label key={k} style={{display:'block',marginBottom:10}}>{l}<input style={{...inp,marginTop:5}} value={survey[k]||''} onChange={e=>set(k,e.target.value)}/></label>)}
        <label style={{display:'block',marginBottom:10}}>วันที่นัดสำรวจ<input type='datetime-local' style={{...inp,marginTop:5}} value={localDateTime(survey.scheduled_at)} onChange={e=>set('scheduled_at',e.target.value)}/></label>
        <label>หมายเหตุ<textarea style={{...inp,marginTop:5,minHeight:90}} value={survey.note||''} onChange={e=>set('note',e.target.value)}/></label>
        <label style={{display:'block',marginTop:10}}>สถานะ<select style={{...inp,marginTop:5}} value={survey.status} onChange={e=>set('status',e.target.value)}><option value='surveying'>กำลังสำรวจ</option><option value='ready_to_quote'>พร้อมเสนอราคา</option><option value='quoted'>ออกใบเสนอราคาแล้ว</option><option value='cancelled'>ยกเลิก</option></select></label>
        <button onClick={save} disabled={saving} style={{width:'100%',marginTop:14,padding:12,border:0,borderRadius:9,background:'#be185d',color:'white',fontWeight:900}}>{saving?'กำลังบันทึก...':'💾 บันทึกข้อมูลสำรวจ'}</button>
      </section>
      <section style={{background:'white',padding:18,borderRadius:14,border:'1px solid #e5e7eb'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><div><h2 style={{margin:0}}>รูปสำรวจหน้างาน</h2><div style={{color:'#6b7280',fontSize:13}}>{analyzing?'กำลังตรวจภาพคล้าย...':'ตรวจรูปซ้ำจริงและภาพคล้าย/งานแก้ไขอัตโนมัติ'}</div></div><button onClick={()=>fileRef.current?.click()} disabled={uploading||survey.status==='cancelled'} style={{padding:'10px 14px',border:0,borderRadius:8,background:'#2563eb',color:'white',fontWeight:900,opacity:survey.status==='cancelled'?.45:1}}>{uploading?'กำลังอัปโหลด...':'＋ เพิ่มรูป'}</button><input ref={fileRef} hidden type='file' accept='image/*' multiple onChange={upload}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:12,marginTop:14}}>{media.length===0&&<div style={{color:'#6b7280',padding:20}}>ยังไม่มีรูปสำรวจ</div>}{media.map(m=><div key={m.id} style={{border:m.similar_to_id?'2px solid #f59e0b':'1px solid #e5e7eb',borderRadius:10,overflow:'hidden',background:m.similar_to_id?'#fffbeb':'white'}}><div style={{position:'relative'}}><img src={url(m.storage_path)} alt={m.file_name} style={{width:'100%',height:160,objectFit:'cover',display:'block'}}/>{Number(m.media_version||1)>1&&<span style={{position:'absolute',top:8,right:8,background:'#111827',color:'white',borderRadius:999,padding:'4px 8px',fontSize:12,fontWeight:900}}>V{m.media_version}</span>}</div><div style={{padding:9,fontSize:12}}><div style={{fontWeight:800}}>{m.source==='line'?'LINE':'APP'}</div>{m.similar_to_id&&<div style={{color:'#92400e',fontWeight:900,margin:'4px 0'}}>⚠ ภาพคล้าย / อาจเป็นงานแก้ไข {m.similarity_score?`${m.similarity_score}%`:''}</div>}<div style={{color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.file_name}</div><button onClick={()=>remove(m)} style={{marginTop:7,border:0,background:'#fee2e2',color:'#991b1b',padding:'6px 8px',borderRadius:6}}>ลบ</button></div></div>)}</div>
      </section>
    </div>
  </div></main>;
}
