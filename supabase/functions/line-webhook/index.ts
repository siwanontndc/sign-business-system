import { createClient } from 'npm:@supabase/supabase-js@2';

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const enc=new TextEncoder();
const env=(n:string)=>(Deno.env.get(n)||'').trim();
const WORK_GROUP_ID='Cf630d4a5d3e49dd721ff3d149f53e88b';
const FINANCE_GROUP_ID='C38847122b9046058c55f79261b6695fc';
const BATCH_MINUTES=5;

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
        expires_at:new Date(Date.now()+BATCH_MINUTES*60*1000).toISOString(),
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
    note:`สร้างอัตโนมัติจาก LINE กลุ่มงาน; รูปที่ส่งต่อเนื่องภายใน ${BATCH_MINUTES} นาทีจะอยู่ชุดเดียวกัน`
  }).select('id,survey_no,customer_name,project_name,created_at').single();
  if(ins.error)throw ins.error;

  const context=await db.from('survey_line_contexts').upsert({
    group_id:groupId,
    survey_id:ins.data.id,
    set_by_line_user_id:event.source?.userId?String(event.source.userId):null,
    expires_at:new Date(Date.now()+BATCH_MINUTES*60*1000).toISOString(),
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
    await replyText(event.replyToken,`✅ เริ่มชุดรูปใหม่แล้ว\n${picked.survey.survey_no}\nรูปที่ส่งต่อภายใน ${BATCH_MINUTES} นาทีจะอยู่ชุดเดียวกัน`);
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
  console.log('auto finance analyzed',rowId,used,confidence);
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
  if(req.method==='GET')return json({ok:true,version:22,batchMinutes:BATCH_MINUTES,dedupe:'sha256-per-survey',secretConfigured:!!secret,serviceRoleConfigured:!!serviceKey,urlConfigured:!!url,tokenConfigured:!!env('LINE_CHANNEL_ACCESS_TOKEN')});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!secret)return json({error:'LINE_CHANNEL_SECRET missing'},503);
  const body=await req.text(),signature=req.headers.get('x-line-signature')||'';
  if(!signature)return json({error:'Missing signature'},401);
  if(!(await validSignature(body,signature,secret)))return json({error:'Invalid signature'},401);
  let payload:any;try{payload=JSON.parse(body);}catch{return json({error:'Invalid JSON'},400);}
  const events=Array.isArray(payload?.events)?payload.events:[];
  if(events.length===0)return json({ok:true,verified:true,version:22});
  if(!url||!serviceKey)return json({error:'Database configuration missing',version:22},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let accepted=0,failed=0,surveyAccepted=0;
  for(const event of events){
    if(event?.type!=='message'||!event?.message)continue;
    const m=event.message;
    const groupId=event.source?.groupId?String(event.source.groupId):'';
    if(groupId===WORK_GROUP_ID&&m.type==='image'){
      try{await handleWorkGroupImage(db,event);accepted++;surveyAccepted++;}
      catch(error){failed++;console.error('survey image error',error);await replyText(event.replyToken,'⚠️ รับรูปสำรวจไม่สำเร็จ ระบบแจ้งข้อผิดพลาดแล้ว');}
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
  if(failed>0)return json({ok:false,accepted,failed,surveyAccepted,version:22},500);
  return json({ok:true,accepted,failed:0,surveyAccepted,version:22},200);
});