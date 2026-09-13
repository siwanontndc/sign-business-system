import {extractThaiSlipDate,inferSlipDirection,extractSlipParties} from './slipFieldFixes';
let workerPromise;
const clean=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c))).replace(/[，]/g,',').replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-');
const split=text=>clean(text).split(/\n\s*-{2,}\s*OCR_PASS\s*-{2,}\s*\n/i).filter(Boolean);
const money=/(จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|amount|total)/i;
const fee=/(ค่าธรรมเนียม|fee)/i;
const excluded=/(วันที่|date|เวลา|time|อ้างอิง|reference|เลขบัญชี|account|customer\s*no|ref\s*no|หมายเลขผู้ใช้ไฟฟ้า|รหัสร้านค้า|รหัสธุรกรรม|ยอดค้างชำระ)/i;
function tokens(s){const out=[];const re=/(?:^|[^\dA-Za-z])((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)(?![\dA-Za-z.,])/g;let m;while((m=re.exec(clean(s)))){const n=Number(m[1].replace(/,/g,''));if(n>0&&n<100000000)out.push(n);}return out;}
function amountCandidates(text){const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];for(let i=0;i<lines.length;i++){if(!money.test(lines[i])||fee.test(lines[i])||excluded.test(lines[i]))continue;for(const [j,line] of [lines[i].replace(money,''),lines[i+1]||''].entries()){if(fee.test(line)||excluded.test(line))continue;const vals=tokens(line);if(vals.length===1)out.push({value:vals[0],weight:j===0?6:4});if(vals.length)break;}}for(const line of lines){if(fee.test(line)||excluded.test(line))continue;const m=line.match(/(?:^|\s)((?:\d{1,3}(?:,\d{3})+|\d{1,8})\.\d{2})\s*(?:บาท|baht|฿)/i);if(m)out.push({value:Number(m[1].replace(/,/g,'')),weight:3});}return out;}
function chooseAmount(text){const votes=new Map();for(const pass of split(text)){const seen=new Set();for(const c of amountCandidates(pass)){if(seen.has(c.value))continue;seen.add(c.value);votes.set(c.value,(votes.get(c.value)||0)+c.weight);}}if(!votes.size){for(const c of amountCandidates(text))votes.set(c.value,(votes.get(c.value)||0)+c.weight);}if(!votes.size)return null;const ranked=[...votes].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);if(ranked.length>1&&ranked[0][1]===ranked[1][1])return null;return ranked[0][0];}
function bankFrom(t){
  const s=clean(t);
  // Prefer the transfer/source bank for common slip layouts.
  if(/krungsri|กรุงศรี/i.test(s))return'กรุงศรี';
  if(/k\+|k plus|กสิกรไทย|kasikorn/i.test(s))return'กสิกรไทย';
  if(/krungthai|กรุงไทย/i.test(s))return'กรุงไทย';
  if(/scb|ไทยพาณิชย์/i.test(s))return'ไทยพาณิชย์';
  if(/bangkok bank|กรุงเทพ/i.test(s))return'กรุงเทพ';
  if(/ttb|ทหารไทยธนชาต/i.test(s))return'ทหารไทยธนชาต';
  if(/ออมสิน/i.test(s))return'ออมสิน';
  return'';
}
function referenceFrom(t){
  const s=clean(t);
  let m=s.match(/(?:เลขที่รายการ|เลขอ้างอิง|หมายเลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\\.?|Transaction ID)\\s*[:：#]?\\s*([A-Za-z0-9-]{8,})/i);
  if(m?.[1])return m[1];
  // Krungsri and several Thai banks print a long standalone reference such as KSA000...
  m=s.match(/\\b([A-Z]{2,5}\\d{10,30})\\b/i);
  return m?.[1]||'';
}
function mode(values){const c=new Map();for(const v of values.filter(Boolean))c.set(v,(c.get(v)||0)+1);return [...c].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}
function descriptionFrom(text){
  const lines=clean(text).split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),memo=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/(?:บันทึกช่วยจำ|บันทึกช่วยจํา|หมายเหตุ|memo|note)\\s*[:：]?\\s*(.*)$/i);
    if(m){
      let v=(m[1]||'').trim();
      if(!v){
        for(let j=i+1;j<Math.min(lines.length,i+4);j++){
          if(!/^(?:จำนวนเงิน|ค่าธรรมเนียม|วันที่|เลขอ้างอิง|หมายเลขอ้างอิง|สแกนตรวจสอบ)/i.test(lines[j])){v=lines[j].trim();break;}
        }
      }
      if(v&&!/^(?:จำนวนเงิน|ค่าธรรมเนียม|วันที่|เลขอ้างอิง|หมายเลขอ้างอิง)/.test(v))memo.push(v);
    }
  }
  return mode(memo);
}
function inferCategory(description='',direction=''){
  const t=clean(description);
  // A customer's memo like "ค่าสติกเกอร์" on money coming into Thanee is sales income,
  // not an expense for materials.
  if(direction==='income')return /มัดจำ/.test(t)?'เงินมัดจำ':'รายได้งานป้าย';
  if(direction!=='expense')return'';
  if(/สติกเกอร์|สติ๊กเกอร์|ไวนิล|อะคริลิก|เหล็ก|สี|วัสดุ|กาว|น็อต|ซิงค์|อลูมิเนียม/.test(t))return'ค่าวัสดุ';
  if(/น้ำมัน|เดินทาง|ทางด่วน|ที่จอด/.test(t))return'ค่าน้ำมัน/เดินทาง';
  if(/ค่าแรง|ช่าง|แรงงาน/.test(t))return'ค่าแรง';
  if(/โทรศัพท์|อินเทอร์เน็ต|ค่าเน็ต/.test(t))return'ค่าโทรศัพท์/อินเทอร์เน็ต';
  if(/ค่าไฟ|ค่าน้ำ|การไฟฟ้า|ประปา/.test(t))return'ค่าสาธารณูปโภค';
  return'';
}
function krungsriFields(text=''){
  const t=clean(text),lines=t.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
  if(!/กรุงศรี|krungsri/i.test(t))return{};
  const ownRe=/ธานี.{0,18}(?:แอดเวอร์|แอดเวอ|ไทซิ่ง|advertis)|ศิวนนท์|ศุภฐิติ/i;
  const ownIdx=lines.findIndex(x=>ownRe.test(x));
  const amountLine=lines.findIndex(x=>/จำนวนเงิน|amount/i.test(x));
  const headerEnd=amountLine>=0?amountLine:Math.min(lines.length,30);
  let direction='';
  if(ownIdx>=0){
    // Krungsri transfer slips list sender first, recipient second before the amount.
    const candidates=lines.slice(0,headerEnd).filter(x=>
      !/โอนเงินสำเร็จ|krungsri|กรุงศรี|จำนวนเงิน|ค่าธรรมเนียม|หมายเลขอ้างอิง|เลขอ้างอิง|THB|^[xX*0-9-]+$/.test(x) &&
      (/[A-Za-z]{3,}|[ก-๙]{3,}/.test(x))
    );
    const ownCandidate=candidates.findIndex(x=>ownRe.test(x));
    if(ownCandidate>=0){
      // Krungsri slip order is sender -> recipient. If Thanee is the second party, money is income.
      direction=ownCandidate>0?'income':'expense';
    }
    if(!direction&&ownIdx>=0){
      const arrowIdx=lines.findIndex(x=>/^↓$|^v$|^to$/i.test(x));
      if(arrowIdx>=0)direction=ownIdx>arrowIdx?'income':'expense';
    }
  }
  let counterparty='';
  if(direction){
    const plausible=lines.slice(0,headerEnd).filter(x=>
      !ownRe.test(x) &&
      !/โอนเงินสำเร็จ|krungsri|กรุงศรี|จำนวนเงิน|ค่าธรรมเนียม|หมายเลขอ้างอิง|เลขอ้างอิง|THB|^[xX*0-9-]+$|^จาก$|^ไปยัง$|^to$|^from$/i.test(x) &&
      (/[A-Z][A-Z .'-]{4,}/.test(x)||/[ก-๙]{4,}/.test(x))
    );
    counterparty=plausible[0]||'';
  }
  return{direction,counterparty};
}
function details(text){
  const parties=extractSlipParties(text),direction=inferSlipDirection(text),section=direction==='expense'?parties.to:direction==='income'?parties.from:'';
  let counterparty=section.split(/\\s*\\|\\s*/).find(x=>x&&!/^(?:กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|\\d|xxx)/i.test(x))||'';
  const k=krungsriFields(text);if(!counterparty&&k.counterparty)counterparty=k.counterparty;
  return{counterparty,description:descriptionFrom(text)};
}
export function parseSlipText(text=''){
  const t=clean(text),passes=split(t),k=krungsriFields(t);
  let amount=chooseAmount(t);
  if(amount==null&&/กรุงศรี|krungsri/i.test(t)){
    const m=t.match(/(?:จำนวนเงิน|amount)[^\d]{0,30}([0-9][0-9,]*\.\d{2})\s*(?:THB|บาท)?/i);
    if(m)amount=Number(m[1].replace(/,/g,''));
  }
  let transaction_date=extractThaiSlipDate(t);
  if(!transaction_date&&/กรุงศรี|krungsri/i.test(t)){
    const m=t.match(/([0-3]?\d)\s*ก\.?\s*ย\.?\s*(25\d{2})/i);
    if(m){const y=Number(m[2])-543;transaction_date=`${y}-09-${String(Number(m[1])).padStart(2,'0')}`;}
  }
  const direction=inferSlipDirection(t)||k.direction||'',d=details(t),description=d.description||'';
  let reference_no=mode(passes.map(referenceFrom))||referenceFrom(t);
  if(!reference_no&&/กรุงศรี|krungsri/i.test(t))reference_no=t.match(/\bKSA[0-9A-Z-]{10,}\b/i)?.[0]||'';
  return{amount:amount==null?'':String(amount),transaction_date,direction,bank_name:mode(passes.map(bankFrom))||bankFrom(t),reference_no,category:inferCategory(description,direction),confidence:null,confidence_by_field:{},ai_used:false,...d,raw_text:t};
}
async function prep(file,top=0,bottom=1,variant='contrast'){const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('เปิดรูปสลิปไม่สำเร็จ'));x.src=url;});const y=Math.floor(img.naturalHeight*top),h=Math.max(1,Math.floor(img.naturalHeight*bottom)-y),scale=Math.max(1.8,Math.min(3,2200/Math.max(1,img.naturalWidth)));const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(h*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,y,img.naturalWidth,h,0,0,c.width,c.height);if(variant!=='original'){const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);const v=variant==='threshold'?(g>175?255:0):(g>225?255:g<60?0:Math.max(0,Math.min(255,Math.round((g-128)*1.55+128))));d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(im,0,0);}return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('เตรียมรูป OCR ไม่สำเร็จ')),'image/jpeg',.96));}finally{URL.revokeObjectURL(url);}}
async function aiParse(file,localText=''){try{const fd=new FormData();fd.append('file',file,'slip.jpg');fd.append('local_text',String(localText||'').slice(0,12000));const r=await fetch('/api/finance/slip-ai',{method:'POST',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok||!j?.fields)return{fields:null,error:j?.error||'AI_REQUEST_FAILED',detail:j?.detail||`HTTP ${r.status}`,status:r.status,code:j?.code||''};return{fields:j.fields,error:'',detail:'',status:r.status,code:'',model:j.model||''};}catch(e){return{fields:null,error:'AI_NETWORK_ERROR',detail:e?.message||'เรียก AI ไม่สำเร็จ',status:0,code:''};}}
function goodAmount(v){const n=Number(v);return Number.isFinite(n)&&n>0&&n<100000000;}
function fc(ai,field){const n=Number(ai?.confidence_by_field?.[field]);return Number.isFinite(n)?n:(Number(ai?.confidence)||0);}
function useAi(ai,field,value,localValue,threshold=.62){if(value==null||value==='')return false;const c=fc(ai,field);return c>=threshold||(!localValue&&c>=.45);}
function merge(local,ai){if(!ai)return local;const out={...local};
  if(useAi(ai,'direction',ai.direction,local.direction,.68))out.direction=ai.direction;
  if(goodAmount(ai.amount)&&useAi(ai,'amount',ai.amount,local.amount,.7))out.amount=String(ai.amount);
  if(useAi(ai,'transaction_date',ai.transaction_date,local.transaction_date,.68))out.transaction_date=ai.transaction_date;
  if(useAi(ai,'counterparty',ai.counterparty,local.counterparty,.55))out.counterparty=ai.counterparty;
  if(useAi(ai,'bank_name',ai.bank_name,local.bank_name,.55))out.bank_name=ai.bank_name;
  if(useAi(ai,'reference_no',ai.reference_no,local.reference_no,.6))out.reference_no=ai.reference_no;
  if(useAi(ai,'description',ai.description,local.description,.5))out.description=ai.description;
  if(useAi(ai,'category',ai.category,local.category,.6))out.category=ai.category;
  out.confidence=Number(ai.confidence)||0;out.confidence_by_field=ai.confidence_by_field||{};out.ai_used=true;out.ai_evidence=ai.evidence||'';return out;}
function coreStrong(ai){return Boolean(ai?.direction)&&goodAmount(ai?.amount)&&Boolean(ai?.transaction_date)&&fc(ai,'direction')>=.7&&fc(ai,'amount')>=.72&&fc(ai,'transaction_date')>=.7;}
async function runOcr(file,onProgress){if(!workerPromise)workerPromise=import('tesseract.js').then(({createWorker})=>createWorker('tha+eng',1,{logger:m=>{if(m.status==='recognizing text')onProgress(Math.min(88,40+Math.round(m.progress*48)));}})).catch(e=>{workerPromise=null;throw e;});const worker=await workerPromise;let text='';const passes=[[0,1,'3','contrast'],[0,1,'6','original'],[0,.42,'6','contrast'],[.32,.72,'6','contrast'],[.62,.92,'6','contrast'],[.18,.99,'6','contrast']];try{for(let i=0;i<passes.length;i++){onProgress([35,46,57,68,79,88][i]||88);const img=await prep(file,passes[i][0],passes[i][1],passes[i][3]);await worker.setParameters({tessedit_pageseg_mode:passes[i][2],preserve_interword_spaces:'1',tessedit_char_whitelist:''});const r=await worker.recognize(img);text+=(text?'\n---OCR_PASS---\n':'')+(r.data.text||'');}}finally{await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',tessedit_char_whitelist:''});}return text;}
export async function readSlipLocally(file,onProgress=()=>{}){
  if(!file||!file.type.startsWith('image/'))throw new Error('กรุณาเลือกรูปภาพสลิป');
  if(file.size>15*1024*1024)throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  onProgress(5);
  const text=await runOcr(file,onProgress);
  onProgress(96);
  const fields=parseSlipText(text);
  fields.ai_source='ocr-local';
  fields.ai_error='';
  fields.ai_status=0;
  fields.ai_code='';
  onProgress(100);
  return{text,confidence:null,fields};
}
