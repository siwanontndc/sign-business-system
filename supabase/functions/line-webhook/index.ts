import { createClient } from 'npm:@supabase/supabase-js@2';

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const enc=new TextEncoder();
const env=(n:string)=>(Deno.env.get(n)||'').trim();
const WORK_GROUP_ID='Cf630d4a5d3e49dd721ff3d149f53e88b';
const FINANCE_GROUP_ID='C38847122b9046058c55f79261b6695fc';
const BATCH_MINUTES=5;
const WORK_CONTEXT_HOURS=12;

async function validSignature(body:string,signature:string,secret:string){
  try{
    const key=await crypto.subtle.importKey('raw',enc.encode(secret.trim()),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const raw=atob(signature.trim());
    const sig=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)sig[i]=raw.charCodeAt(i);
    return await crypto.subtle.verify('HMAC',key,sig,enc.encode(body));
  }catch{return false;}
}

async function sha256Hex(buffer:ArrayBuffer){
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
}

async function replyText(replyToken:string|undefined,text:string){
  const token=env('LINE_CHANNEL_ACCESS_TOKEN');
  if(!token||!replyToken)return;
  await fetch('https://api.line.me/v2/bot/message/reply',{
    method:'POST',
    headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({replyToken,messages:[{type:'text',text}]})
  });
}

function makeSurveyNo(){
  const d=new Date();
  const yy=String(d.getFullYear()).slice(-2);
  const mm=String(d.getMonth()+1).padStart(2,'0');
  const suffix=String(Date.now()).slice(-6);
  return `SUR-${yy}${mm}-${suffix}`;
}

function bangkokLabel(value:Date){
  return new Intl.DateTimeFormat('th-TH',{
    timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(value);
}

async function chooseOrCreateSurvey(db:any,event:any){
  const groupId=String(event.source?.groupId||'');
  const now=new Date();
  const ctx=await db.from('survey_line_contexts').select('survey_id,expires_at,updated_at').eq('group_id',groupId).maybeSingle();

  if(!ctx.error&&ctx.data&&new Date(ctx.data.expires_at).getTime()>now.getTime()){
    const existing=await db.from('site_surveys').select('id,survey_no,customer_name,project_name,created_at').eq('id',ctx.data.survey_id).maybeSingle();
    if(!existing.error&&existing.data){
      await db.from('survey_line_contexts').update({
        expires_at:new Date(Date.now()+WORK_CONTEXT_HOURS*60*60*1000).toISOString(),
        updated_at:new Date().toISOString()
      }).eq('group_id',groupId);
      return {survey:existing.data,created:false};
    }
  }

  if(ctx.data)await db.from('survey_line_contexts').delete().eq('group_id',groupId);

  const surveyNo=makeSurveyNo();
  const ins=await db.from('site_surveys').insert({
    survey_no:surveyNo,
    customer_name:'รอจัดเข้าลูกค้า (LINE)',
    project_name:`ชุดรูป LINE ${bangkokLabel(now)}`,
    status:'surveying',
    note:`สร้างอัตโนมัติจาก LINE กลุ่มงาน; ระบบจะจัดข้อความและรูปที่เกี่ยวข้องให้อยู่ในงานเดียวกัน`
  }).select('id,survey_no,customer_name,project_name,created_at').single();
  if(ins.error)throw ins.error;

  const context=await db.from('survey_line_contexts').upsert({
    group_id:groupId,
    survey_id:ins.data.id,
    set_by_line_user_id:event.source?.userId?String(event.source.userId):null,
    expires_at:new Date(Date.now()+WORK_CONTEXT_HOURS*60*60*1000).toISOString(),
    updated_at:new Date().toISOString()
  },{onConflict:'group_id'});
  if(context.error)throw context.error;

  return {survey:ins.data,created:true};
}

async function saveSurveyImage(db:any,event:any,survey:any){
  const token=env('LINE_CHANNEL_ACCESS_TOKEN');
  const m=event?.message;
  if(!token||!m?.id||m.type!=='image')throw new Error('missing image/token');

  const duplicateMessage=await db.from('survey_media').select('id').eq('line_message_id',String(m.id)).maybeSingle();
  if(!duplicateMessage.error&&duplicateMessage.data){
    return {saved:false,reason:'duplicate-message'};
  }

  const r=await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(String(m.id))}/content`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok)throw new Error(`LINE content ${r.status}`);
  const bytes=await r.arrayBuffer();
  if(bytes.byteLength>15728640)throw new Error('image too large');

  const mime=(r.headers.get('content-type')||'image/jpeg').split(';')[0].trim();
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error(`unsupported ${mime}`);

  const contentHash=await sha256Hex(bytes);
  const duplicateHash=await db.from('survey_media')
    .select('id,file_name,created_at')
    .eq('survey_id',survey.id)
    .eq('content_hash',contentHash)
    .maybeSingle();

  if(!duplicateHash.error&&duplicateHash.data){
    return {saved:false,reason:'duplicate-hash'};
  }

  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  const safeId=String(m.id).replace(/[^a-zA-Z0-9_-]/g,'_');
  const path=`surveys/${survey.id}/${Date.now()}-${safeId}.${ext}`;

  const up=await db.storage.from('job-media').upload(path,bytes,{contentType:mime,upsert:false});
  if(up.error)throw up.error;

  const ins=await db.from('survey_media').insert({
    survey_id:survey.id,
    file_name:`LINE-${safeId}.${ext}`,
    storage_path:path,
    mime_type:mime,
    file_size:bytes.byteLength,
    content_hash:contentHash,
    source:'line',
    line_message_id:String(m.id),
    line_group_id:event.source?.groupId?String(event.source.groupId):null,
    line_user_id:event.source?.userId?String(event.source.userId):null,
    captured_at:event.timestamp?new Date(Number(event.timestamp)).toISOString():new Date().toISOString(),
    note:'รับจาก LINE กลุ่มงานอัตโนมัติ'
  });

  if(ins.error){
    await db.storage.from('job-media').remove([path]);
    if(String(ins.error.code||'')==='23505')return {saved:false,reason:'duplicate-hash'};
    throw ins.error;
  }

  return {saved:true,reason:'saved'};
}

async function handleWorkGroupImage(db:any,event:any){
  const picked=await chooseOrCreateSurvey(db,event);
  const result=await saveSurveyImage(db,event,picked.survey);

  if(result.reason==='duplicate-message'||result.reason==='duplicate-hash'){
    await replyText(event.replyToken,`ℹ️ รูปนี้มีอยู่แล้วใน ${picked.survey.survey_no}\nจึงไม่บันทึกซ้ำ`);
    return true;
  }

  if(picked.created){
    await replyText(event.replyToken,`✅ เริ่มงานใหม่แล้ว\n${picked.survey.survey_no}\nระบบจะรวบรวมข้อความ รูป และงานแก้ไขที่เกี่ยวข้องไว้ในงานเดียวกัน`);
  }
  return true;
}

function parseText(text:string){
  const t=text.replace(/\s+/g,' ').trim();
  const direction=/รายรับ|โอนเข้า|รับเงิน|ยอดเข้า/i.test(t)?'income':/รายจ่าย|โอนออก|จ่าย|ซื้อ|ชำระ|ค่าน้ำมัน|ค่าแรง|ค่าวัสดุ|ค่าสี|ค่าไฟ/i.test(t)?'expense':null;
  const near=t.match(/(?:รายรับ|รายจ่าย|โอนเข้า|โอนออก|รับเงิน|ยอดเข้า|จ่าย|ซื้อ|ค่าวัสดุ|ค่าแรง|ค่าน้ำมัน)[^\d]{0,30}([\d,]+(?:\.\d{1,2})?)/i);
  const any=t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)/i);
  const raw=(near?.[1]||any?.[1]||'').replaceAll(',','');
  const amount=raw&&Number.isFinite(Number(raw))?Number(raw):null;
  let category:string|null=null;
  if(direction==='income')category=/มัดจำ/i.test(t)?'เงินมัดจำ':'รายได้งานป้าย';
  if(direction==='expense')category=/น้ำมัน|เดินทาง/i.test(t)?'ค่าน้ำมัน/เดินทาง':/ค่าแรง/i.test(t)?'ค่าแรง':/วัสดุ|สี|ไฟ/i.test(t)?'ค่าวัสดุ':/เครื่องมือ/i.test(t)?'ค่าเครื่องมือ':/ภาษี|ค่าธรรมเนียม/i.test(t)?'ภาษี/ค่าธรรมเนียม':'อื่น ๆ';
  return{direction,amount,category};
}

async function saveMedia(db:any,event:any,rowId:string){
  const token=env('LINE_CHANNEL_ACCESS_TOKEN');const m=event?.message;
  if(!token||!m?.id||!['image','file'].includes(m.type))return true;
  try{
    const r=await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(String(m.id))}/content`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)return false;
    const bytes=await r.arrayBuffer();if(bytes.byteLength>15728640)return false;
    const mime=(r.headers.get('content-type')||'application/octet-stream').split(';')[0].trim();
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(mime))return false;
    const ext=mime==='application/pdf'?'pdf':mime.split('/')[1];
    const eventId=String(event.webhookEventId||m.id).replace(/[^a-zA-Z0-9_-]/g,'_');
    const path=`${eventId}/${String(m.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;
    const up=await db.storage.from('line-account').upload(path,bytes,{contentType:mime,upsert:false});
    if(up.error&&!String(up.error.message).toLowerCase().includes('already exists'))return false;
    const meta=await db.from('line_account_entries').update({storage_path:path,mime_type:mime}).eq('id',rowId);
    return !meta.error;
  }catch{return false;}
}


function aiTextOf(p:any){
  if(typeof p?.output_text==='string'&&p.output_text)return p.output_text;
  return (p?.output||[]).flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||'').join('');
}

function hasWorkObject(text:string){
  return /ป้าย|แบบ(?:งาน)?|โลโก้|ขนาด|สี|วัสดุ|คอมโพสิต|ไวนิล|สติ๊กเกอร์|สติกเกอร์|ไฟ|LED|โครง|เหล็ก|ติดตั้ง|ผลิต|หน้างาน|ลูกค้า|ร้าน|โครงการ|สเป็ก|spec|เมตร|ตร\.ม|ซม\.|เซนติเมตร|ราคา|จำนวน|ด้านหน้า|ด้านหลัง|ซ้าย|ขวา|roll\s*up|โรลอัพ|facade|ฟาซาด/i.test(text||'');
}

function isRevisionText(text:string){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  const hasAction=/แก้ไข|แก้แบบ|ปรับแก้|ปรับแบบ|เปลี่ยน|เพิ่ม|ลด|ย้าย|ขยับ|แบบใหม่|เวอร์ชัน|revision|rev\.?/i.test(t);
  return hasAction && hasWorkObject(t);
}

function isNonWorkChat(text:string){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  if(!t)return true;
  if(/^(โอเค|ok|ครับ|ค่ะ|คะ|ขอบคุณ|รับทราบ|ได้ครับ|ได้ค่ะ|อืม|อ่อ|555+|ฮ่า+|ปิดเลย|ไปแล้ว|ไปมาแล้ว|ไม่ได้เปิดไว้)$/i.test(t))return true;
  if(/รายงาน.*ไม่มี|งานเยอะเกิน|ไม่ทำ|ไม่เอา|พักก่อน|เดี๋ยวค่อย|คุยเล่น|ทดสอบระบบ|ไปเดินหรือยัง|ห้องทำงาน/i.test(t))return true;
  return false;
}

function isLikelyWorkText(text:string){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  if(isNonWorkChat(t))return false;
  if(isRevisionText(t))return true;
  if(/^#?(งาน|job|สำรวจ|survey|สรุปงาน|ปิดงาน)(?:\s|$)/i.test(t))return true;
  return hasWorkObject(t);
}

async function recentWorkJobs(db:any){
  const since=new Date(Date.now()-120*24*60*60*1000).toISOString();
  const {data,error}=await db.from('site_surveys')
    .select('id,survey_no,customer_name,project_name,note,status,updated_at,created_at')
    .gte('created_at',since)
    .order('updated_at',{ascending:false})
    .limit(25);
  if(error)return[];
  return data||[];
}

async function activeWorkContext(db:any,groupId:string){
  if(!groupId)return null;
  const {data,error}=await db.from('survey_line_contexts')
    .select('survey_id,expires_at')
    .eq('group_id',groupId)
    .maybeSingle();
  if(error||!data||new Date(data.expires_at).getTime()<=Date.now())return null;
  return data;
}

async function setWorkContext(db:any,event:any,surveyId:string){
  const groupId=String(event.source?.groupId||'');
  if(!groupId)return;
  await db.from('job_line_contexts').delete().eq('group_id',groupId);
  const {error}=await db.from('survey_line_contexts').upsert({
    group_id:groupId,
    survey_id:surveyId,
    set_by_line_user_id:event.source?.userId?String(event.source.userId):null,
    expires_at:new Date(Date.now()+WORK_CONTEXT_HOURS*60*60*1000).toISOString(),
    updated_at:new Date().toISOString()
  },{onConflict:'group_id'});
  if(error)throw error;
}

async function saveWorkUpdate(db:any,event:any,surveyId:string,type:string,text:string,summary:string,confidence:number){
  const m=event?.message;
  const row={
    group_id:String(event.source?.groupId||''),
    line_message_id:m?.id?String(m.id):null,
    line_user_id:event.source?.userId?String(event.source.userId):null,
    survey_id:surveyId,
    update_type:type,
    raw_text:text||null,
    summary:summary||text||null,
    ai_confidence:Math.max(0,Math.min(1,Number(confidence)||0))
  };
  const {error}=await db.from('line_work_updates').upsert(row,{onConflict:'line_message_id',ignoreDuplicates:true});
  if(error)console.error('save work update failed',error.message);
}

async function handleWorkGroupText(db:any,event:any){
  const text=String(event?.message?.text||'').trim();
  const groupId=String(event.source?.groupId||'');
  const messageId=event?.message?.id?String(event.message.id):'';
  if(!text||!groupId)return false;

  if(messageId){
    const {data:seen}=await db.from('line_work_updates').select('id').eq('line_message_id',messageId).maybeSingle();
    if(seen)return true;
  }

  const current=await activeWorkContext(db,groupId);
  const jobs=await recentWorkJobs(db);
  const currentJob=current?jobs.find((j:any)=>j.id===current.survey_id):null;

  // Ignore ordinary conversation. Only actual work instructions/details should enter the job system.
  if(!isLikelyWorkText(text)){
    return false;
  }

  // Strong revision wording defaults to the current job so "แก้..." stays in the same work thread.
  if(currentJob&&isRevisionText(text)){
    const summary=text.replace(/\s+/g,' ').trim().slice(0,500);
    await setWorkContext(db,event,currentJob.id);
    await saveWorkUpdate(db,event,currentJob.id,'revision',text,summary,0.98);
    const existingNote=String(currentJob.note||'').trim();
    const line=`[${bangkokLabel(new Date())}] แก้ไข: ${summary}`;
    await db.from('site_surveys').update({
      note:(existingNote?existingNote+'\n':'')+line,
      updated_at:new Date().toISOString()
    }).eq('id',currentJob.id);
    const {count}=await db.from('line_work_updates').select('id',{count:'exact',head:true}).eq('survey_id',currentJob.id).eq('update_type','revision');
    await replyText(event.replyToken,`✏️ รวมเป็นงานเดิมแล้ว\n${currentJob.survey_no} — ${currentJob.customer_name||'-'}\n${currentJob.project_name||'ไม่ระบุชื่องาน'}\nแก้ไขครั้งที่ ${count||1}`);
    return true;
  }

  const aiKey=env('OPENAI_API_KEY');
  let decision:any=null;
  if(aiKey){
    const compactJobs=jobs.map((j:any)=>({
      id:j.id,
      survey_no:j.survey_no,
      customer_name:j.customer_name,
      project_name:j.project_name,
      status:j.status,
      note:String(j.note||'').slice(-500)
    }));
    const schema={type:'object',additionalProperties:false,properties:{
      match_id:{type:['string','null']},
      new_job:{type:'boolean'},
      is_revision:{type:'boolean'},
      customer_name:{type:['string','null']},
      project_name:{type:['string','null']},
      summary:{type:'string'},
      confidence:{type:'number'}
    },required:['match_id','new_job','is_revision','customer_name','project_name','summary','confidence']};
    const prompt=`คุณเป็น AI จัดกลุ่มงานของบริษัททำป้ายจากข้อความ LINE
เป้าหมาย: รวมข้อความที่พูดถึงลูกค้า/โครงการเดียวกันให้อยู่ "งานเดียว" และถ้าเป็นการแก้แบบ ปรับแบบ เปลี่ยนสเป็ก เพิ่ม/ลด/ย้าย ให้ถือเป็น revision ของงานเดิม ไม่สร้างงานใหม่
สร้างงานใหม่เฉพาะเมื่อข้อความชัดเจนว่าเป็นคนละลูกค้า คนละสถานที่ หรือคนละโครงการ
ข้อความคุยทั่วไป เช่น ไปไหนหรือยัง ห้องทำงาน เปิด/ปิดหรือยัง ค่ะ ครับ ไม่ทำ ไม่เอา ไม่ใช่คำสั่งงาน และห้ามจัดเป็น revision
revision ต้องมีคำสั่งแก้/ปรับ/เปลี่ยน/เพิ่ม/ลด/ย้าย/ขยับ และกล่าวถึงองค์ประกอบงานจริง เช่น แบบ ป้าย สี โลโก้ ขนาด วัสดุ ติดตั้ง
ถ้ายังไม่แน่ใจ ให้ถือว่าไม่ใช่งาน แทนที่จะเดาเข้ากับ current_job
คืน JSON เท่านั้น

current_job: ${JSON.stringify(currentJob?{id:currentJob.id,survey_no:currentJob.survey_no,customer_name:currentJob.customer_name,project_name:currentJob.project_name}:null)}
recent_jobs: ${JSON.stringify(compactJobs)}
ข้อความใหม่: ${text}`;
    try{
      const r=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',
        headers:{authorization:`Bearer ${aiKey}`,'content-type':'application/json'},
        body:JSON.stringify({
          model:env('OPENAI_VISION_MODEL')||'gpt-4.1-mini',
          input:[{role:'user',content:[{type:'input_text',text:prompt}]}],
          text:{format:{type:'json_schema',name:'line_work_grouping',strict:true,schema}},
          max_output_tokens:700
        })
      });
      if(r.ok){
        const raw=await r.json();
        decision=JSON.parse(aiTextOf(raw));
      }
    }catch(error){console.error('work text AI failed',error);}
  }

  // Conservative fallback: use current job unless the message clearly introduces a new job/customer.
  if(!decision){
    decision={
      match_id:currentJob?.id||null,
      new_job:!currentJob,
      is_revision:isRevisionText(text),
      customer_name:null,
      project_name:text.slice(0,100),
      summary:text.slice(0,500),
      confidence:currentJob?0.65:0.55
    };
  }

  let job:any=null;
  const match=jobs.find((j:any)=>j.id===decision.match_id);
  if(match && Number(decision.confidence)>=0.68){
    job=match;
  }else if(currentJob && !decision.new_job){
    job=currentJob;
  }

  let created=false;
  if(!job){
    const surveyNo=makeSurveyNo();
    const customer=String(decision.customer_name||'รอระบุลูกค้า (LINE)').trim();
    const project=String(decision.project_name||decision.summary||text).trim().slice(0,160);
    const ins=await db.from('site_surveys').insert({
      survey_no:surveyNo,
      customer_name:customer,
      project_name:project||`งานจาก LINE ${bangkokLabel(new Date())}`,
      status:'surveying',
      note:`[LINE] ${String(decision.summary||text).slice(0,700)}`
    }).select('id,survey_no,customer_name,project_name,note,status,created_at,updated_at').single();
    if(ins.error)throw ins.error;
    job=ins.data;created=true;
  }else{
    const patch:any={updated_at:new Date().toISOString()};
    if((!job.customer_name||/รอระบุ|LINE/.test(job.customer_name))&&decision.customer_name)patch.customer_name=String(decision.customer_name).trim();
    if((!job.project_name||/^ชุดรูป LINE|^งานจาก LINE/.test(job.project_name))&&decision.project_name)patch.project_name=String(decision.project_name).trim().slice(0,160);
    const line=`[${bangkokLabel(new Date())}] ${decision.is_revision?'แก้ไข':'อัปเดต'}: ${String(decision.summary||text).slice(0,700)}`;
    patch.note=(String(job.note||'').trim()?String(job.note).trim()+'\n':'')+line;
    await db.from('site_surveys').update(patch).eq('id',job.id);
    job={...job,...patch};
  }

  await setWorkContext(db,event,job.id);
  const updateType=created?'new_job':decision.is_revision?'revision':'update';
  await saveWorkUpdate(db,event,job.id,updateType,text,String(decision.summary||text).slice(0,700),Number(decision.confidence)||0);

  if(created){
    await replyText(event.replyToken,`🆕 สรุปเป็นงานใหม่แล้ว\n${job.survey_no} — ${job.customer_name||'-'}\n${job.project_name||'ไม่ระบุชื่องาน'}\nส่งรูปหรือรายละเอียดต่อได้เลย ระบบจะรวมไว้ในงานนี้`);
  }else if(decision.is_revision && /^#?(งาน|job)/i.test(text)){
    const {count}=await db.from('line_work_updates').select('id',{count:'exact',head:true}).eq('survey_id',job.id).eq('update_type','revision');
    await replyText(event.replyToken,`✏️ รวมเป็นงานแก้ไขของงานเดิม\n${job.survey_no} — ${job.customer_name||'-'}\n${job.project_name||'ไม่ระบุชื่องาน'}\nแก้ไขครั้งที่ ${count||1}`);
  }
  return true;
}

function financeHint(text:string){
  return{
    direction:/รายรับ|โอนเข้า|รับเงิน|ยอดเข้า/i.test(text)?'income':/รายจ่าย|โอนออก|จ่าย|ซื้อ|ชำระ|ค่าน้ำมัน|ค่าแรง|ค่าวัสดุ|ค่าสี|ค่าไฟ/i.test(text)?'expense':null,
    category:/น้ำมัน|เดินทาง/i.test(text)?'ค่าน้ำมัน/เดินทาง':/ค่าแรง/i.test(text)?'ค่าแรง':/สี|ไฟ|วัสดุ/.test(text)?'ค่าวัสดุ':/มัดจำ/i.test(text)?'เงินมัดจำ':''
  };
}
async function autoAnalyzeFinanceEntry(db:any,rowId:string){
  const aiKey=env('OPENAI_API_KEY');
  if(!aiKey){console.error('auto finance AI: OPENAI_API_KEY missing');return false;}
  const {data:e,error:ee}=await db.from('line_account_entries').select('*').eq('id',rowId).maybeSingle();
  if(ee||!e||e.status!=='pending'||e.is_context_note)return false;
  if(!e.storage_path||!/^image\/(jpeg|png|webp)$/.test(e.mime_type||''))return false;

  const {data:blob,error:de}=await db.storage.from('line-account').download(e.storage_path);
  if(de||!blob)return false;
  if(blob.size>15*1024*1024)return false;

  const bytes=new Uint8Array(await blob.arrayBuffer());
  let binary=''; for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const b64=btoa(binary);
  const hint=[e.linked_note,e.message_text].filter(Boolean).join('\n');
  const schema={type:'object',additionalProperties:false,properties:{
    direction:{type:['string','null'],enum:['income','expense',null]},
    amount:{type:['number','null']},
    transaction_date:{type:['string','null']},
    category:{type:['string','null']},
    description:{type:['string','null']},
    counterparty:{type:['string','null']},
    bank_name:{type:['string','null']},
    reference_no:{type:['string','null']},
    project_name:{type:['string','null']},
    confidence:{type:'number'}
  },required:['direction','amount','transaction_date','category','description','counterparty','bank_name','reference_no','project_name','confidence']};

  const prompt=`อ่านข้อความจากสลิป/หลักฐานการเงินไทยจากภาพโดยตรงและคืน JSON ตาม schema เท่านั้น ห้ามเดา
บัญชีของบริษัทอาจเป็น ธานีแอดเวอร์ไทซิ่ง / ศิวนนท์ หรือเลขบัญชีลงท้าย 4034, 1403, 8829
ถ้าบริษัทเป็นผู้รับ = income; ถ้าบริษัทเป็นผู้โอน/ผู้จ่าย = expense
amount ต้องเป็นยอดทำรายการจริง ไม่ใช่ค่าธรรมเนียม/เลขบัญชี/เลขอ้างอิง
transaction_date ใช้วันที่บนสลิปจริง
counterparty คืออีกฝั่งของรายการ
หมวดรายรับ: รายได้งานป้าย, เงินมัดจำ, โอนจากลูกค้า, เงินสดรับ, อื่น ๆ
หมวดรายจ่าย: ค่าวัสดุ, ค่าแรง, ค่าน้ำมัน/เดินทาง, ค่าเครื่องมือ, ค่าใช้จ่ายสำนักงาน, ภาษี/ค่าธรรมเนียม, ค่าเช่า, ค่าโฆษณา/การตลาด, ค่าสาธารณูปโภค, ค่าโทรศัพท์/อินเทอร์เน็ต, ค่างวด/ยานพาหนะ, อื่น ๆ
ถ้าไม่ชัดให้ null และลด confidence ห้ามเดา
ข้อความประกอบจาก LINE: ${hint||'ไม่มี'}`;

  const models=[env('OPENAI_VISION_MODEL'),'gpt-4.1-mini','gpt-4o-mini'].filter((x,i,a)=>x&&a.indexOf(x)===i);
  let parsed:any=null,used='',last='';
  for(const model of models){
    try{
      const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),25000);
      let r:Response;
      try{
        r=await fetch('https://api.openai.com/v1/responses',{
          method:'POST',signal:ctrl.signal,
          headers:{authorization:`Bearer ${aiKey}`,'content-type':'application/json'},
          body:JSON.stringify({
            model,
            input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:`data:${e.mime_type};base64,${b64}`,detail:'high'}]}],
            text:{format:{type:'json_schema',name:'finance_evidence',strict:true,schema}},
            max_output_tokens:1000
          })
        });
      }finally{clearTimeout(timer);}
      const raw=await r.text();
      if(!r.ok){last=`OpenAI ${r.status}: ${raw.slice(0,180)}`;if([401,403,429].includes(r.status))break;continue;}
      parsed=JSON.parse(aiTextOf(JSON.parse(raw))); used=model; break;
    }catch(err){last=err instanceof Error?err.message:String(err);}
  }
  if(!parsed){console.error('auto finance AI failed',rowId,last);return false;}

  const h=financeHint(hint);
  const amount=parsed.amount==null?null:Number(parsed.amount);
  const direction=h.direction||(['income','expense'].includes(parsed.direction)?parsed.direction:null);
  const allowedIncome=['รายได้งานป้าย','เงินมัดจำ','โอนจากลูกค้า','เงินสดรับ','อื่น ๆ'];
  const allowedExpense=['ค่าวัสดุ','ค่าแรง','ค่าน้ำมัน/เดินทาง','ค่าเครื่องมือ','ค่าใช้จ่ายสำนักงาน','ภาษี/ค่าธรรมเนียม','ค่าเช่า','ค่าโฆษณา/การตลาด','ค่าสาธารณูปโภค','ค่าโทรศัพท์/อินเทอร์เน็ต','ค่างวด/ยานพาหนะ','อื่น ๆ'];
  let category=h.category||String(parsed.category||'').trim();
  const allowed=direction==='income'?allowedIncome:direction==='expense'?allowedExpense:[];
  if(!allowed.includes(category))category=direction==='income'?'รายได้งานป้าย':direction==='expense'?'อื่น ๆ':'อื่น ๆ';
  const date=parsed.transaction_date&&Number.isFinite(Date.parse(parsed.transaction_date))?new Date(parsed.transaction_date).toISOString():null;
  const confidence=Math.max(0,Math.min(1,Number(parsed.confidence)||0));

  const update={
    entry_type:direction,
    amount:Number.isFinite(amount)&&amount>0&&amount<=999999999999.99?amount:null,
    category,
    job_reference:parsed.project_name||null,
    suggested_transaction_date:date,
    suggested_description:e.linked_note||parsed.description||null,
    suggested_counterparty:parsed.counterparty||null,
    suggested_bank_name:parsed.bank_name||null,
    suggested_reference_no:parsed.reference_no||null,
    ai_confidence:confidence,
    analyzed_at:new Date().toISOString()
  };
  const {error:we}=await db.from('line_account_entries').update(update).eq('id',rowId).eq('status','pending');
  if(we){console.error('auto finance save failed',rowId,we.message);return false;}

  let autoStatus='needs_review';
  const canAutoApprove=
    confidence>=0.93 &&
    direction &&
    Number.isFinite(amount) && amount>0 &&
    date &&
    String(parsed.reference_no||'').trim();

  if(canAutoApprove){
    const {data:autoResult,error:autoError}=await db.rpc('auto_approve_line_account_entry',{
      p_id:rowId,
      p_direction:direction,
      p_amount:amount,
      p_category:category||'อื่น ๆ',
      p_description:e.linked_note||parsed.description||null,
      p_project_name:parsed.project_name||null,
      p_transaction_date:date,
      p_counterparty:parsed.counterparty||null,
      p_bank_name:parsed.bank_name||null,
      p_reference_no:parsed.reference_no||null,
      p_ai_confidence:confidence
    });
    if(autoError){
      console.error('auto finance approve failed',rowId,autoError.message);
    }else{
      autoStatus=autoResult?.status||'needs_review';
      console.log('auto finance review result',rowId,autoStatus,confidence);
    }
  }

  console.log('auto finance analyzed',rowId,used,confidence,autoStatus);
  return true;
}

async function linkContext(db:any,event:any,rowId:string,text:string,draft:any){
  if(!text||text.length>160||draft.amount)return;
  const groupId=event.source?.groupId?String(event.source.groupId):null;
  const senderId=event.source?.userId?String(event.source.userId):null;
  if(!senderId)return;
  const eventAt=event.timestamp?new Date(Number(event.timestamp)):new Date();
  const from=new Date(eventAt.getTime()-180000).toISOString();
  const q=db.from('line_account_entries').select('id,group_id').eq('sender_id',senderId).eq('status','pending').in('message_type',['image','file']).gte('event_at',from).lte('event_at',eventAt.toISOString()).is('linked_note',null).order('event_at',{ascending:false}).limit(5);
  const {data:recent,error}=await q;if(error||!recent?.length)return;
  const scoped=groupId?recent.filter((x:any)=>!x.group_id||x.group_id===groupId):recent;
  const ids=scoped.map((x:any)=>x.id);if(!ids.length)return;
  await db.from('line_account_entries').update({linked_note:text,suggested_description:text,...(draft.category?{category:draft.category}:{}),...(draft.direction?{entry_type:draft.direction}:{})}).in('id',ids);
  await db.from('line_account_entries').update({is_context_note:true,status:'rejected'}).eq('id',rowId);
}

Deno.serve(async(req)=>{
  const secret=env('LINE_CHANNEL_SECRET'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY'),url=env('SUPABASE_URL');
  if(req.method==='GET')return json({ok:true,version:26,batchMinutes:BATCH_MINUTES,dedupe:'sha256-per-survey',secretConfigured:!!secret,serviceRoleConfigured:!!serviceKey,urlConfigured:!!url,tokenConfigured:!!env('LINE_CHANNEL_ACCESS_TOKEN')});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!secret)return json({error:'LINE_CHANNEL_SECRET missing'},503);
  const body=await req.text(),signature=req.headers.get('x-line-signature')||'';
  if(!signature)return json({error:'Missing signature'},401);
  if(!(await validSignature(body,signature,secret)))return json({error:'Invalid signature'},401);
  let payload:any;try{payload=JSON.parse(body);}catch{return json({error:'Invalid JSON'},400);}
  const events=Array.isArray(payload?.events)?payload.events:[];
  if(events.length===0)return json({ok:true,verified:true,version:26});
  if(!url||!serviceKey)return json({error:'Database configuration missing',version:26},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let accepted=0,failed=0,surveyAccepted=0;
  for(const event of events){
    if(event?.type!=='message'||!event?.message)continue;
    const m=event.message;
    const groupId=event.source?.groupId?String(event.source.groupId):'';
    if(groupId===WORK_GROUP_ID&&m.type==='text'){
      try{
        const handled=await handleWorkGroupText(db,event);
        if(handled){accepted++;surveyAccepted++;continue;}
      }catch(error){
        failed++;console.error('work text error',error);
        await replyText(event.replyToken,'⚠️ วิเคราะห์/จัดกลุ่มงานไม่สำเร็จ ระบบเก็บข้อความไว้ตรวจภายหลัง');
        continue;
      }
      // Ordinary chat in the work group: do not create/update jobs and do not reply.
      continue;
    }
    if(groupId===WORK_GROUP_ID&&m.type==='image'){
      try{await handleWorkGroupImage(db,event);accepted++;surveyAccepted++;}
      catch(error){failed++;console.error('survey image error',error);await replyText(event.replyToken,'⚠️ รับรูปงานไม่สำเร็จ ระบบแจ้งข้อผิดพลาดแล้ว');}
      continue;
    }
    const eventId=String(event.webhookEventId||m.id||'');if(!eventId)continue;
    const text=m.type==='text'?String(m.text??''):'';
    const draft=m.type==='text'?parseText(text):{direction:null,amount:null,category:null};
    const row:any={line_event_id:eventId,line_message_id:m.id?String(m.id):null,group_id:event.source?.groupId?String(event.source.groupId):null,sender_id:event.source?.userId?String(event.source.userId):null,message_type:String(m.type||'unknown'),message_text:m.type==='text'?text:null,entry_type:draft.direction,amount:draft.amount,category:draft.category,event_at:event.timestamp?new Date(Number(event.timestamp)).toISOString():null,raw_event:event};
    const inserted=await db.from('line_account_entries').upsert(row,{onConflict:'line_event_id',ignoreDuplicates:true}).select('id,storage_path').maybeSingle();
    if(inserted.error){failed++;continue;}
    let saved=inserted.data;
    if(!saved){const existing=await db.from('line_account_entries').select('id,storage_path').eq('line_event_id',eventId).maybeSingle();if(existing.error||!existing.data){failed++;continue;}saved=existing.data;}
    if(['image','file'].includes(m.type)&&!saved.storage_path){const ok=await saveMedia(db,event,String(saved.id));if(!ok){failed++;continue;}}
    if(m.type==='image'&&groupId===FINANCE_GROUP_ID){try{await autoAnalyzeFinanceEntry(db,String(saved.id));}catch(error){console.error('auto finance analyze error',error);}}
    if(m.type==='text')await linkContext(db,event,String(saved.id),text,draft);
    accepted++;
  }
  if(failed>0)return json({ok:false,accepted,failed,surveyAccepted,version:26},500);
  return json({ok:true,accepted,failed:0,surveyAccepted,version:26},200);
});