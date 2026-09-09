import {extractThaiSlipDate,inferSlipDirection} from './slipFieldFixes';
let workerPromise;

async function prep(file,top=0,bottom=1,variant='contrast'){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('เปิดรูปสลิปไม่สำเร็จ'));x.src=url;});
    const y=Math.floor(img.naturalHeight*top),h=Math.max(1,Math.floor(img.naturalHeight*bottom)-y);
    const scale=Math.max(1.8,Math.min(3,2200/Math.max(1,img.naturalWidth)));
    const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(h*scale);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,y,img.naturalWidth,h,0,0,c.width,c.height);
    if(variant!=='original'){
      const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
      for(let i=0;i<d.length;i+=4){
        const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
        const v=variant==='threshold'?(g>175?255:0):(g>225?255:g<60?0:Math.max(0,Math.min(255,Math.round((g-128)*1.55+128))));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(im,0,0);
    }
    return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('เตรียมรูป OCR ไม่สำเร็จ')),'image/jpeg',.96));
  }finally{URL.revokeObjectURL(url);}
}

const clean=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c))).replace(/[，]/g,',').replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[\u200b-\u200d]/g,' ');
const splitPasses=text=>clean(text).split(/\n\s*-{2,}\s*OCR_PASS\s*-{2,}\s*\n/i).map(x=>x.trim()).filter(Boolean);
const moneyLabel=/(จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|amount|total)/i;
const feeLabel=/(ค่าธรรมเนียม|fee)/i;
const rejectLine=/(วันที่|date|เวลา|time|อ้างอิง|reference|เลขบัญชี|account|customer\s*no|ref\s*no|หมายเลขผู้ใช้ไฟฟ้า|รหัสร้านค้า|รหัสธุรกรรม)/i;

function numToken(s){const v=String(s||'').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/,/g,'');const n=Number(v);return Number.isFinite(n)?n:null;}
function moneyTokens(line){
  const out=[];const s=clean(line);
  const re=/(?:^|[^\dA-Za-z])((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)(?=\s*(?:บาท|baht|฿|\s|$))/gi;
  let m;while((m=re.exec(s))){const n=numToken(m[1]);if(n!=null&&n>0&&n<100000000)out.push(n);}return out;
}
function amountFromOnePass(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(!moneyLabel.test(lines[i])||feeLabel.test(lines[i]))continue;
    for(const [j,raw] of [lines[i],lines[i+1]||'',lines[i+2]||''].entries()){
      const line=j===0?raw.replace(moneyLabel,''):raw;
      if(rejectLine.test(line)||feeLabel.test(line))continue;
      const vals=moneyTokens(line);if(vals.length)return vals[0];
    }
  }
  const baht=[];
  for(const line of lines){
    if(feeLabel.test(line)||rejectLine.test(line))continue;
    const re=/((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)\s*บาท/gi;let m;
    while((m=re.exec(line))){const n=numToken(m[1]);if(n!=null&&n>0&&n<100000000)baht.push(n);}
  }
  if(!baht.length)return null;
  const counts=new Map();for(const n of baht)counts.set(n,(counts.get(n)||0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0][0];
}
function chooseAmount(text=''){
  const vals=splitPasses(text).map(amountFromOnePass).filter(v=>v!=null);
  if(!vals.length){const v=amountFromOnePass(text);return v==null?null:v;}
  const counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0][0];
}
function directBillExpense(t){
  const s=clean(t);if(!/กรุงไทย|krungthai/i.test(s))return false;
  return /จ่ายบิล|ชำระบิล|รหัสร้านค้า|รหัสธุรกรรม|\bEMPKB[A-Z0-9]*\b|\bKB\d{6,}\b|การไฟฟ้า|true|โตโยต้า|toyota|customer\s*no|ref\s*no/i.test(s);
}
function bankFrom(text=''){const m=clean(text).match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);return m?.[0]||'';}
function referenceFrom(text=''){
  const t=clean(text);const patterns=[/(?:รหัสอ้างอิง|เลขอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:#]?\s*([A-Za-z0-9-]{8,})/i,/(?:เลขที่รายการ)\s*[:#]?\s*([A-Za-z0-9-]{8,})/i,/\b([A-Za-z]{0,6}\d{10,}|\d{14,})\b/];
  for(const p of patterns){const m=t.match(p);if(m?.[1])return m[1];}return'';
}
function mode(values){const c=new Map();for(const v of values.filter(Boolean))c.set(v,(c.get(v)||0)+1);if(!c.size)return'';return [...c.entries()].sort((a,b)=>b[1]-a[1])[0][0];}
function parse(text=''){
  const t=clean(text),passes=splitPasses(t),list=passes.length?passes:[t];
  const amount=chooseAmount(t),transaction_date=extractThaiSlipDate(t);
  let direction=inferSlipDirection(t);if(!direction&&list.some(directBillExpense))direction='expense';
  const bank_name=mode(list.map(bankFrom))||bankFrom(t),reference_no=mode(list.map(referenceFrom))||referenceFrom(t);
  return{amount:amount==null?'':String(amount),transaction_date,direction,bank_name,reference_no,raw_text:t};
}

export async function readSlipLocally(file,onProgress=()=>{}){
  if(!file||!file.type.startsWith('image/'))throw new Error('กรุณาเลือกรูปภาพสลิป');
  if(file.size>15*1024*1024)throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  if(!workerPromise)workerPromise=import('tesseract.js').then(({createWorker})=>createWorker('tha+eng',1,{logger:m=>{if(m.status==='recognizing text')onProgress(Math.min(68,Math.round(m.progress*68)));}})).catch(e=>{workerPromise=null;throw e;});
  const worker=await workerPromise;let text='';
  const passes=[[0,1,'3','contrast'],[0,1,'6','original'],[.18,.99,'6','contrast'],[.42,.99,'6','threshold']];
  try{
    for(let i=0;i<passes.length;i++){
      onProgress([5,35,65,84][i]||5);
      const img=await prep(file,passes[i][0],passes[i][1],passes[i][3]);
      await worker.setParameters({tessedit_pageseg_mode:passes[i][2],preserve_interword_spaces:'1',tessedit_char_whitelist:''});
      const r=await worker.recognize(img);const passText=r.data.text||'';text+=(text?'\n---OCR_PASS---\n':'')+passText;
    }
  }finally{await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',tessedit_char_whitelist:''});}
  onProgress(100);return{text,confidence:null,fields:parse(text)};
}
export function parseSlipText(text){return parse(text);}
