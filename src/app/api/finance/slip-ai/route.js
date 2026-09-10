export const runtime='nodejs';

const ALLOWED_CATEGORIES={
  income:['รายได้งานป้าย','เงินมัดจำ','โอนจากลูกค้า','เงินสดรับ','อื่น ๆ'],
  expense:['ค่าวัสดุ','ค่าแรง','ค่าน้ำมัน/เดินทาง','ค่าเครื่องมือ','ค่าใช้จ่ายสำนักงาน','ภาษี/ค่าธรรมเนียม','ค่าเช่า','ค่าโฆษณา/การตลาด','ค่าสาธารณูปโภค','ค่าโทรศัพท์/อินเทอร์เน็ต','ค่างวด/ยานพาหนะ','อื่น ๆ']
};
const MODEL=()=>process.env.OPENAI_VISION_MODEL||'gpt-5.6-luna';

function safeJson(text=''){
  try{return JSON.parse(text);}catch{}
  const a=text.indexOf('{'),b=text.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(text.slice(a,b+1));}catch{}}
  return null;
}
function normalizeDate(v=''){
  const m=String(v).match(/^(20\d{2})-(\d{2})-(\d{2})$/);return m?m[0]:'';
}
function normalizeAmount(v){const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)&&n>0&&n<100000000?String(n):'';}
function normalizeDirection(v){return v==='income'||v==='expense'?v:'';}
function normalizeCategory(v,dir){const list=ALLOWED_CATEGORIES[dir]||[];return list.includes(v)?v:'';}
function conf(v){return Math.max(0,Math.min(1,Number(v)||0));}
function fieldConf(j,field,overall){
  const c=j?.confidence_by_field?.[field];
  return c==null?overall:conf(c);
}
async function callOpenAI(body){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}

export async function GET(req){
  const configured=Boolean(process.env.OPENAI_API_KEY);
  const url=new URL(req.url);
  const live=url.searchParams.get('live')==='1';
  if(!live)return Response.json({ok:true,configured,model:MODEL()},{headers:{'Cache-Control':'no-store'}});
  if(!configured)return Response.json({ok:false,configured:false,model:MODEL(),error:'AI_NOT_CONFIGURED',detail:'OPENAI_API_KEY is missing'},{status:503,headers:{'Cache-Control':'no-store'}});
  try{
    const{r,data}=await callOpenAI({model:MODEL(),store:false,input:'Reply with only OK.',max_output_tokens:16});
    if(!r.ok)return Response.json({ok:false,configured:true,model:MODEL(),error:'AI_REQUEST_FAILED',status:r.status,code:data?.error?.code||'',detail:data?.error?.message||'OpenAI request failed'},{status:502,headers:{'Cache-Control':'no-store'}});
    return Response.json({ok:true,configured:true,live:true,model:MODEL(),status:r.status},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,configured:true,model:MODEL(),error:'AI_NETWORK_ERROR',detail:e?.message||'OpenAI health check failed'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}

export async function POST(req){
  try{
    if(!process.env.OPENAI_API_KEY)return Response.json({ok:false,error:'AI_NOT_CONFIGURED',detail:'OPENAI_API_KEY is missing'},{status:503});
    const form=await req.formData();
    const file=form.get('file');
    const localText=String(form.get('local_text')||'').slice(0,12000);
    if(!file||typeof file.arrayBuffer!=='function')return Response.json({ok:false,error:'NO_IMAGE'},{status:400});
    if(file.size>15*1024*1024)return Response.json({ok:false,error:'IMAGE_TOO_LARGE'},{status:400});
    const mime=file.type||'image/jpeg';
    if(!mime.startsWith('image/'))return Response.json({ok:false,error:'INVALID_IMAGE'},{status:400});
    const b64=Buffer.from(await file.arrayBuffer()).toString('base64');
    const dataUrl=`data:${mime};base64,${b64}`;
    const prompt=`อ่านข้อความจากสลิปธนาคาร/หลักฐานการชำระเงินภาษาไทยในภาพนี้โดยดูจากภาพเป็นหลัก ห้ามเดาจาก OCR ที่ผิด และคืน JSON เท่านั้น

บัญชีของบริษัทเราอาจแสดงชื่อ ธานีแอดเวอร์ไทซิ่ง / ศิวนนท์ หรือเลขบัญชีปิดท้าย 4034, 1403, 8829
- ถ้าบริษัทเราเป็นผู้โอน/ผู้จ่าย => direction = expense
- ถ้าบริษัทเราเป็นผู้รับ => direction = income
- ห้ามสรุป direction จากจำนวนเงิน วันที่ หรือเลขอ้างอิงเพียงอย่างเดียว
- ถ้าเป็นจ่ายบิล เช่น การไฟฟ้า True Toyota Stripe merchant/customer/ref bill และบัญชีเราเป็นผู้จ่าย => expense
- amount ต้องเป็นจำนวนเงินทำรายการหลัก ไม่ใช่ค่าธรรมเนียม ยอดค้าง เลขบัญชี หรือเลขอ้างอิง
- transaction_date ใช้วันที่ทำรายการบนสลิปจริง รูปแบบ YYYY-MM-DD ค.ศ. (พ.ศ. ลบ 543)
- counterparty คือบุคคล/บริษัทอีกฝั่งของธุรกรรม ไม่ใช่บริษัทเรา
- description ใช้บันทึกช่วยจำ/หมายเหตุบนสลิปถ้ามี
- category เลือกจากรายการเท่านั้น
รายรับ: รายได้งานป้าย, เงินมัดจำ, โอนจากลูกค้า, เงินสดรับ, อื่น ๆ
รายจ่าย: ค่าวัสดุ, ค่าแรง, ค่าน้ำมัน/เดินทาง, ค่าเครื่องมือ, ค่าใช้จ่ายสำนักงาน, ภาษี/ค่าธรรมเนียม, ค่าเช่า, ค่าโฆษณา/การตลาด, ค่าสาธารณูปโภค, ค่าโทรศัพท์/อินเทอร์เน็ต, ค่างวด/ยานพาหนะ, อื่น ๆ
- ค่าไฟ/ประปา => ค่าสาธารณูปโภค; โทรศัพท์/อินเทอร์เน็ต/True => ค่าโทรศัพท์/อินเทอร์เน็ต; Toyota/ค่างวดรถ => ค่างวด/ยานพาหนะ
- ถ้าไม่แน่ใจ field ไหน ให้ field นั้นเป็น string ว่างและให้ confidence ต่ำ ห้ามเดา
- evidence ให้สรุปสั้น ๆ ว่าเห็นผู้โอน/ผู้รับ/จำนวนเงิน/วันที่อะไรจากภาพ

JSON fields:
{
  "direction":"income|expense|",
  "amount":"",
  "transaction_date":"YYYY-MM-DD|",
  "counterparty":"",
  "bank_name":"",
  "reference_no":"",
  "description":"",
  "category":"",
  "confidence":0.0,
  "confidence_by_field":{"direction":0.0,"amount":0.0,"transaction_date":0.0,"counterparty":0.0,"bank_name":0.0,"reference_no":0.0,"description":0.0,"category":0.0},
  "evidence":""
}

OCR เดิมจากเครื่อง (ถ้ามี อาจผิด ใช้เป็นข้อมูลประกอบเท่านั้น):
${localText}`;
    const body={
      model:MODEL(),
      store:false,
      input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'high'}]}],
      text:{format:{type:'json_object'}},
      max_output_tokens:1000
    };
    const{r,data}=await callOpenAI(body);
    if(!r.ok){
      console.error('slip-ai OpenAI error',r.status,data?.error?.code,data?.error?.message);
      return Response.json({ok:false,error:'AI_REQUEST_FAILED',status:r.status,detail:data?.error?.message||'OpenAI request failed',code:data?.error?.code||''},{status:502});
    }
    const text=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n')||data.output_text||'';
    const j=safeJson(text);
    if(!j)return Response.json({ok:false,error:'AI_INVALID_JSON',detail:'AI returned invalid JSON'},{status:502});
    const direction=normalizeDirection(j.direction);
    const overall=conf(j.confidence);
    const out={
      direction,
      amount:normalizeAmount(j.amount),
      transaction_date:normalizeDate(j.transaction_date),
      counterparty:String(j.counterparty||'').trim().slice(0,160),
      bank_name:String(j.bank_name||'').trim().slice(0,80),
      reference_no:String(j.reference_no||'').trim().slice(0,120),
      description:String(j.description||'').trim().slice(0,240),
      category:normalizeCategory(String(j.category||'').trim(),direction),
      confidence:overall,
      confidence_by_field:{
        direction:fieldConf(j,'direction',overall),
        amount:fieldConf(j,'amount',overall),
        transaction_date:fieldConf(j,'transaction_date',overall),
        counterparty:fieldConf(j,'counterparty',overall),
        bank_name:fieldConf(j,'bank_name',overall),
        reference_no:fieldConf(j,'reference_no',overall),
        description:fieldConf(j,'description',overall),
        category:fieldConf(j,'category',overall)
      },
      evidence:String(j.evidence||'').trim().slice(0,500)
    };
    return Response.json({ok:true,model:body.model,fields:out});
  }catch(e){
    console.error('slip-ai',e);
    return Response.json({ok:false,error:'AI_SERVER_ERROR',detail:e?.message||'Unknown server error'},{status:500});
  }
}
