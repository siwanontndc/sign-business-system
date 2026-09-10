export const runtime='nodejs';

const ALLOWED_CATEGORIES={
  income:['รายได้งานป้าย','เงินมัดจำ','โอนจากลูกค้า','เงินสดรับ','อื่น ๆ'],
  expense:['ค่าวัสดุ','ค่าแรง','ค่าน้ำมัน/เดินทาง','ค่าเครื่องมือ','ค่าใช้จ่ายสำนักงาน','ภาษี/ค่าธรรมเนียม','ค่าเช่า','ค่าโฆษณา/การตลาด','ค่าสาธารณูปโภค','ค่าโทรศัพท์/อินเทอร์เน็ต','ค่างวด/ยานพาหนะ','อื่น ๆ']
};

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
    const prompt=`อ่านข้อความจากสลิปธนาคาร/หลักฐานการชำระเงินภาษาไทยในภาพนี้อย่างระมัดระวัง และคืน JSON เท่านั้น\n\nบัญชีของบริษัทเราอาจแสดงชื่อ ธานีแอดเวอร์ไทซิ่ง / ศิวนนท์ หรือเลขบัญชีปิดท้าย 4034, 1403, 8829\n- ถ้าบริษัทเราเป็นผู้โอน/ผู้จ่าย => direction = expense\n- ถ้าบริษัทเราเป็นผู้รับ => direction = income\n- ถ้าเป็นจ่ายบิล เช่น การไฟฟ้า True Toyota merchant/customer/ref bill => expense\n- amount ต้องเป็นจำนวนเงินทำรายการหลัก ไม่ใช่ค่าธรรมเนียม ยอดค้าง หรือเลขอ้างอิง\n- transaction_date ใช้วันที่ทำรายการบนสลิปจริง รูปแบบ YYYY-MM-DD ค.ศ. (พ.ศ. ลบ 543)\n- counterparty คือบุคคล/บริษัทอีกฝั่งของธุรกรรม ไม่ใช่บริษัทเรา\n- description ใช้บันทึกช่วยจำ/หมายเหตุบนสลิป เช่น ค่าไฟร้าน ไฟหลังร้าน ท่อ ค่างวดรถ ถ้ามี\n- category เลือกจากรายการเท่านั้น\nรายรับ: รายได้งานป้าย, เงินมัดจำ, โอนจากลูกค้า, เงินสดรับ, อื่น ๆ\nรายจ่าย: ค่าวัสดุ, ค่าแรง, ค่าน้ำมัน/เดินทาง, ค่าเครื่องมือ, ค่าใช้จ่ายสำนักงาน, ภาษี/ค่าธรรมเนียม, ค่าเช่า, ค่าโฆษณา/การตลาด, ค่าสาธารณูปโภค, ค่าโทรศัพท์/อินเทอร์เน็ต, ค่างวด/ยานพาหนะ, อื่น ๆ\n- ค่าไฟ/ประปา => ค่าสาธารณูปโภค; โทรศัพท์/อินเทอร์เน็ต/True => ค่าโทรศัพท์/อินเทอร์เน็ต; Toyota/ค่างวดรถ => ค่างวด/ยานพาหนะ\n- ถ้าไม่แน่ใจห้ามเดา ให้คืน string ว่างและ confidence ต่ำ\n\nJSON fields: direction, amount, transaction_date, counterparty, bank_name, reference_no, description, category, confidence, evidence\nOCR เดิมจากเครื่อง (อาจผิด ใช้เป็นข้อมูลประกอบเท่านั้น):\n${localText}`;
    const body={
      model:process.env.OPENAI_VISION_MODEL||'gpt-5.6-luna',
      store:false,
      input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'high'}]}],
      text:{format:{type:'json_object'}},
      max_output_tokens:900
    };
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      console.error('slip-ai OpenAI error',r.status,data?.error?.code,data?.error?.message);
      return Response.json({ok:false,error:'AI_REQUEST_FAILED',status:r.status,detail:data?.error?.message||'OpenAI request failed',code:data?.error?.code||''},{status:502});
    }
    const text=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n')||data.output_text||'';
    const j=safeJson(text);
    if(!j)return Response.json({ok:false,error:'AI_INVALID_JSON',detail:'AI returned invalid JSON'},{status:502});
    const direction=normalizeDirection(j.direction);
    const out={
      direction,
      amount:normalizeAmount(j.amount),
      transaction_date:normalizeDate(j.transaction_date),
      counterparty:String(j.counterparty||'').trim().slice(0,160),
      bank_name:String(j.bank_name||'').trim().slice(0,80),
      reference_no:String(j.reference_no||'').trim().slice(0,120),
      description:String(j.description||'').trim().slice(0,240),
      category:normalizeCategory(String(j.category||'').trim(),direction),
      confidence:Math.max(0,Math.min(1,Number(j.confidence)||0)),
      evidence:String(j.evidence||'').trim().slice(0,500)
    };
    return Response.json({ok:true,model:body.model,fields:out});
  }catch(e){
    console.error('slip-ai',e);
    return Response.json({ok:false,error:'AI_SERVER_ERROR',detail:e?.message||'Unknown server error'},{status:500});
  }
}
