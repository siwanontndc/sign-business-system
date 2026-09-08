// OCR runs entirely in the user's browser. No paid API or server-side AI.
let workerPromise;

async function makeEnhancedImage(file, cropTopOnly=false, cropRatio=0.62) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve,reject)=>{
      const el = new Image();
      el.onload=()=>resolve(el); el.onerror=()=>reject(new Error('เปิดรูปสลิปไม่สำเร็จ')); el.src=url;
    });
    const sourceH = cropTopOnly ? Math.max(1, Math.floor(img.naturalHeight * cropRatio)) : img.naturalHeight;
    const scale = Math.max(1.7, Math.min(3, 2100 / Math.max(1,img.naturalWidth)));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(img.naturalWidth*scale); canvas.height=Math.round(sourceH*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,img.naturalWidth,sourceH,0,0,canvas.width,canvas.height);
    const im=ctx.getImageData(0,0,canvas.width,canvas.height), d=im.data;
    for(let i=0;i<d.length;i+=4){
      const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
      const v=g>218?255:g<62?0:Math.max(0,Math.min(255,Math.round((g-128)*1.45+128)));
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(im,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('เตรียมรูป OCR ไม่สำเร็จ')),'image/jpeg',0.95));
  } finally { URL.revokeObjectURL(url); }
}

export async function readSlipLocally(file, onProgress = () => {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('กรุณาเลือกรูปภาพสลิป');
  if (file.size > 15 * 1024 * 1024) throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  if (!workerPromise) workerPromise = import('tesseract.js').then(({createWorker}) => createWorker('tha+eng', 1, {logger: m => { if(m.status === 'recognizing text') onProgress(Math.min(78,Math.round(m.progress * 78))); }})).catch(e => {workerPromise = null; throw e;});
  const worker = await workerPromise;
  const enhanced = await makeEnhancedImage(file,false);
  const first = await worker.recognize(enhanced);
  let text=first.data.text||'';
  let fields=parseSlipText(text);

  if(!fields.transaction_date){
    onProgress(80);
    const top=await makeEnhancedImage(file,true,0.55);
    await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
    const second=await worker.recognize(top);
    text += '\n' + (second.data.text||'');
    fields=parseSlipText(text);
  }

  // Numeric dates are commonly small on Thai banking slips and Safari/iPhone OCR can
  // confuse separators. A final date-focused pass makes the top area larger and limits
  // recognition to characters that can occur in a numeric date/time.
  if(!fields.transaction_date){
    onProgress(92);
    const dateTop=await makeEnhancedImage(file,true,0.42);
    await worker.setParameters({
      tessedit_pageseg_mode:'6',
      preserve_interword_spaces:'1',
      tessedit_char_whitelist:'0123456789/-. :'
    });
    const third=await worker.recognize(dateTop);
    text += '\n' + (third.data.text||'');
    fields=parseSlipText(text);
  }

  await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',tessedit_char_whitelist:''});
  onProgress(100);
  return {text, confidence: first.data.confidence / 100, fields};
}

function thaiDigitsToArabic(s='') {return s.replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));}

function normalizeDateOcr(s='') {
  let out=thaiDigitsToArabic(String(s))
    .replace(/[\u200b-\u200d]/g,' ')
    .replace(/[|]/g,' ')
    .replace(/[‐‑‒–—−]/g,'-')
    .replace(/[／]/g,'/')
    .replace(/[：]/g,':');

  // Correct common OCR confusions only when adjacent to another digit/date separator.
  out=out
    .replace(/(?<=[\d/\-.\s])[Oo](?=[\d/\-.\s])/g,'0')
    .replace(/(?<=[\d/\-.\s])[Il](?=[\d/\-.\s])/g,'1');
  return out;
}

function formatDate(day,month,year){
  day=Number(day); month=Number(month); year=Number(year);
  if(year<100) year += year>=40?2500:2000;
  if(year>2400) year-=543;
  if(day<1||day>31||month<1||month>12||year<2000||year>2100)return '';
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function findTransactionDate(text='') {
  let s=normalizeDateOcr(text);
  const fixes=[['มค','ม\\s*[\\.·,]?\\s*ค'],['กพ','ก\\s*[\\.·,]?\\s*พ'],['มีค','มี\\s*[\\.·,]?\\s*ค'],['เมย','เม\\s*[\\.·,]?\\s*ย'],['พค','พ\\s*[\\.·,]?\\s*ค'],['มิย','มิ\\s*[\\.·,]?\\s*ย'],['กค','ก\\s*[\\.·,]?\\s*ค'],['สค','ส\\s*[\\.·,]?\\s*ค'],['กย','ก\\s*[\\.·,]?\\s*ย'],['ตค','ต\\s*[\\.·,]?\\s*ค'],['พย','พ\\s*[\\.·,]?\\s*ย'],['ธค','ธ\\s*[\\.·,]?\\s*ค']];
  for(const [to,pat] of fixes)s=s.replace(new RegExp(pat+'\\s*[\\.]?','g'),to);
  const monthMap={มค:1,มกราคม:1,กพ:2,กุมภาพันธ์:2,มีค:3,มีนาคม:3,เมย:4,เมษายน:4,พค:5,พฤษภาคม:5,มิย:6,มิถุนายน:6,กค:7,กรกฎาคม:7,สค:8,สิงหาคม:8,กย:9,กันยายน:9,ตค:10,ตุลาคม:10,พย:11,พฤศจิกายน:11,ธค:12,ธันวาคม:12,jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const monthNames='มค|กพ|มีค|เมย|พค|มิย|กค|สค|กย|ตค|พย|ธค|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

  const numericPatterns=[
    /(?:วันที่|วันท|Date)?\s*[:：]?\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})(?=\D|$)/i,
    // Some OCR engines drop / or - and leave spaces between date components.
    /(?:วันที่|วันท|Date)\s*[:：]?\s*(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})(?=\D|$)/i
  ];
  for(const re of numericPatterns){const m=s.match(re);if(!m)continue;const v=formatDate(m[1],m[2],m[3]);if(v)return v;}

  const namedPatterns=[
    new RegExp('(\\d{1,2})\\s*('+monthNames+')\\.?\\s*[,\\-]?\\s*(\\d{2,4})','i'),
    new RegExp('(?:วันที่|วันท|Date)\\s*[:：]?\\s*(\\d{1,2})\\s*('+monthNames+')\\.?\\s*[,\\-]?\\s*(\\d{2,4})','i')
  ];
  for(const re of namedPatterns){const m=s.match(re);if(!m)continue;const month=monthMap[m[2].toLowerCase()];const v=formatDate(m[1],month,m[3]);if(v)return v;}
  return '';
}

export function parseSlipText(text){
 const t=thaiDigitsToArabic(String(text||'')).replace(/[\u200b-\u200d]/g,'');
 const money=[...t.matchAll(/(?:฿|THB|บาท|จำนวนเงิน|ยอดเงิน|จำนวน|Amount|Total)\s*[:：]?\s*([\d,]+(?:\.\d{2})?)/gi)].map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>0);
 const amounts=[...t.matchAll(/(?:^|\s)([\d,]+\.\d{2})(?=\s|$|บาท|฿)/gm)].map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>0);
 const amount=money[0]||(amounts.length===1?amounts[0]:null), transaction_date=findTransactionDate(t);
 const bank=t.match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);
 const ref=t.match(/(?:เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:：#]?\s*([A-Za-z0-9-]{8,})/i);
 return {amount:amount==null?'':String(amount),transaction_date,bank_name:bank?.[0]||'',reference_no:ref?.[1]||'',raw_text:t};
}
