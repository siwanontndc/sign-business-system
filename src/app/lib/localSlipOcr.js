// OCR runs entirely in the user's browser. No paid API or server-side AI.
let workerPromise;

const OWN_ACCOUNT_RE=/(ธานี\s*แอดเวอร์ไทซิ่ง|THANEE\s*ADVERTISING|ศิวนนท์\s*ศุภฐิติพงศ์)/i;

async function makeEnhancedImage(file,{top=0,bottom=1}={}){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('เปิดรูปสลิปไม่สำเร็จ'));el.src=url;});
    const y=Math.max(0,Math.floor(img.naturalHeight*top));
    const h=Math.max(1,Math.floor(img.naturalHeight*Math.min(1,bottom))-y);
    const scale=Math.max(1.7,Math.min(3,2100/Math.max(1,img.naturalWidth)));
    const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(h*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,y,img.naturalWidth,h,0,0,canvas.width,canvas.height);
    const im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;
    for(let i=0;i<d.length;i+=4){const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);const v=g>220?255:g<65?0:Math.max(0,Math.min(255,Math.round((g-128)*1.5+128)));d[i]=d[i+1]=d[i+2]=v;}
    ctx.putImageData(im,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('เตรียมรูป OCR ไม่สำเร็จ')),'image/jpeg',0.95));
  }finally{URL.revokeObjectURL(url);}
}

export async function readSlipLocally(file,onProgress=()=>{}){
  if(!file||!file.type.startsWith('image/'))throw new Error('กรุณาเลือกรูปภาพสลิป');
  if(file.size>15*1024*1024)throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  if(!workerPromise)workerPromise=import('tesseract.js').then(({createWorker})=>createWorker('tha+eng',1,{logger:m=>{if(m.status==='recognizing text')onProgress(Math.min(72,Math.round(m.progress*72)));}})).catch(e=>{workerPromise=null;throw e;});
  const worker=await workerPromise;
  const full=await makeEnhancedImage(file);
  await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',tessedit_char_whitelist:''});
  const first=await worker.recognize(full);
  let text=first.data.text||'';
  let fields=parseSlipText(text);

  // Focus on the lower-middle receipt area where amount/date usually live.
  // Keep labels enabled so a date/time number can never be mistaken for the amount just because it is larger.
  if(!fields.amount||!fields.transaction_date){
    onProgress(78);
    const lower=await makeEnhancedImage(file,{top:.48,bottom:.96});
    await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',tessedit_char_whitelist:''});
    const second=await worker.recognize(lower);
    text+='\n'+(second.data.text||'');
    fields=parseSlipText(text);
  }

  if(!fields.transaction_date){
    onProgress(91);
    const upper=await makeEnhancedImage(file,{top:0,bottom:.62});
    const third=await worker.recognize(upper);
    text+='\n'+(third.data.text||'');
    fields=parseSlipText(text);
  }

  await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',tessedit_char_whitelist:''});
  onProgress(100);
  return{text,confidence:first.data.confidence/100,fields};
}

function thaiDigitsToArabic(s=''){return String(s).replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));}
function clean(s=''){return thaiDigitsToArabic(s).replace(/[\u200b-\u200d]/g,' ').replace(/[，]/g,',').replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/');}
function normalizeMoneyToken(token=''){
  let s=clean(token).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s+/g,'');
  s=s.replace(/,(?=\d{3}(?:\D|$))/g,'').replace(/,/g,'');
  const n=Number(s);return Number.isFinite(n)&&n>0&&n<100000000?n:null;
}
function amountFromLine(line=''){
  const m=clean(line).match(/([0-9OoIl|][0-9OoIl|,\s]{0,18}(?:\.\s*\d{1,2})?)/);
  return m?normalizeMoneyToken(m[1]):null;
}
function looksLikeDateOrTime(line=''){return /(วันที่|date|\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}|\d{1,2}\s*:\s*\d{2})/i.test(clean(line));}
function findAmount(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const labelRe=/(จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|amount|total)/i;
  for(let i=0;i<lines.length;i++){
    if(!labelRe.test(lines[i]))continue;
    const same=lines[i].replace(labelRe,'');
    const n1=amountFromLine(same);if(n1!=null)return n1;
    for(let j=i+1;j<=Math.min(i+2,lines.length-1);j++){
      if(looksLikeDateOrTime(lines[j])||/(ค่าธรรมเนียม|fee)/i.test(lines[j]))break;
      const n2=amountFromLine(lines[j]);if(n2!=null)return n2;
    }
  }
  // Conservative fallback: a decimal value on a non-date, non-fee line. Prefer the first visible money-like line, not the largest number.
  for(const line of lines){
    if(looksLikeDateOrTime(line)||/(ค่าธรรมเนียม|fee|reference|อ้างอิง)/i.test(line))continue;
    const m=line.match(/([0-9OoIl|][0-9OoIl|,\s]{0,14}\.\s*\d{2})/);
    if(m){const n=normalizeMoneyToken(m[1]);if(n!=null)return n;}
  }
  return null;
}
function formatDate(day,month,year){day=Number(day);month=Number(month);year=Number(year);if(year<100)year+=year>=40?2500:2000;if(year>2400)year-=543;if(day<1||day>31||month<1||month>12||year<2000||year>2100)return'';const d=new Date(Date.UTC(year,month-1,day));if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return'';return`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function findTransactionDate(text=''){
  const s=clean(text).replace(/(?<=[\d/\-.\s])[Oo](?=[\d/\-.\s])/g,'0').replace(/(?<=[\d/\-.\s])[Il](?=[\d/\-.\s])/g,'1');
  const numeric=s.match(/(?:วันที่ทำรายการ|วันที่|date)?\s*[:]?\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/i);if(numeric){const v=formatDate(numeric[1],numeric[2],numeric[3]);if(v)return v;}
  const months={มค:1,มกราคม:1,กพ:2,กุมภาพันธ์:2,มีค:3,มีนาคม:3,เมย:4,เมษายน:4,พค:5,พฤษภาคม:5,มิย:6,มิถุนายน:6,กค:7,กรกฎาคม:7,สค:8,สิงหาคม:8,กย:9,กันยายน:9,ตค:10,ตุลาคม:10,พย:11,พฤศจิกายน:11,ธค:12,ธันวาคม:12};
  const named=s.match(/(\d{1,2})\s*(ม\.?\s*ค|ก\.?\s*พ|มี\.?\s*ค|เม\.?\s*ย|พ\.?\s*ค|มิ\.?\s*ย|ก\.?\s*ค|ส\.?\s*ค|ก\.?\s*ย|ต\.?\s*ค|พ\.?\s*ย|ธ\.?\s*ค|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\.?\s*(\d{2,4})/i);
  if(named){const key=named[2].replace(/[.\s]/g,'');const v=formatDate(named[1],months[key],named[3]);if(v)return v;}return'';
}
function detectDirection(text=''){
  const t=clean(text);
  const to=t.match(/(?:ไปยัง|ผู้รับ|to)\s*[:：]?([\s\S]{0,180})/i)?.[1]||'';
  const from=t.match(/(?:จาก|ผู้โอน|from)\s*[:：]?([\s\S]{0,180})/i)?.[1]||'';
  if(OWN_ACCOUNT_RE.test(to))return'income';
  if(OWN_ACCOUNT_RE.test(from))return'expense';
  return'';
}
export function parseSlipText(text){
  const t=clean(text),amount=findAmount(t),transaction_date=findTransactionDate(t),direction=detectDirection(t);
  const bank=t.match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);
  const ref=t.match(/(?:เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:：#]?\s*([A-Za-z0-9-]{8,})/i);
  return{amount:amount==null?'':String(amount),transaction_date,direction,bank_name:bank?.[0]||'',reference_no:ref?.[1]||'',raw_text:t};
}
