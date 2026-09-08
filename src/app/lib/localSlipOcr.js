import {extractThaiSlipDate,inferSlipDirection} from './slipFieldFixes';

let workerPromise;

async function prep(file,top=0,bottom=1){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('เปิดรูปสลิปไม่สำเร็จ'));x.src=url;});
    const y=Math.floor(img.naturalHeight*top),h=Math.max(1,Math.floor(img.naturalHeight*bottom)-y),scale=Math.max(1.8,Math.min(3,2200/Math.max(1,img.naturalWidth)));
    const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(h*scale);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,y,img.naturalWidth,h,0,0,c.width,c.height);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
    for(let i=0;i<d.length;i+=4){const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);const v=g>220?255:g<64?0:Math.max(0,Math.min(255,Math.round((g-128)*1.5+128)));d[i]=d[i+1]=d[i+2]=v;}
    ctx.putImageData(im,0,0);
    return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('เตรียมรูป OCR ไม่สำเร็จ')),'image/jpeg',.96));
  }finally{URL.revokeObjectURL(url);}
}

function thaiDigits(s=''){return String(s).replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));}
function clean(s=''){return thaiDigits(s).replace(/[，]/g,',').replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/');}
function moneyToken(s=''){
  const x=clean(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s+/g,'').replace(/,/g,'');
  const n=Number(x);return Number.isFinite(n)&&n>0&&n<100000000?n:null;
}
function dateLike(line=''){return /(วันที่|date|\b25\d{2}\b|\d{1,2}\s*:\s*\d{2})/i.test(clean(line));}
function findAmount(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),label=/(จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|amount|total)/i;
  for(let i=0;i<lines.length;i++){
    if(!label.test(lines[i]))continue;
    for(const line of [lines[i].replace(label,''),lines[i+1]||'',lines[i+2]||'']){
      if(dateLike(line)||/(ค่าธรรมเนียม|fee)/i.test(line))continue;
      const m=line.match(/([0-9OoIl|][0-9OoIl|,\s]{0,14}(?:\.\s*\d{1,2})?)/);if(m){const n=moneyToken(m[1]);if(n!=null)return n;}
    }
  }
  for(const line of lines){if(dateLike(line)||/(ค่าธรรมเนียม|fee|อ้างอิง|reference)/i.test(line))continue;const m=line.match(/([0-9OoIl|][0-9OoIl|,\s]{0,14}\.\s*\d{2})/);if(m){const n=moneyToken(m[1]);if(n!=null)return n;}}
  return null;
}
function parse(text=''){
  const t=clean(text),amount=findAmount(t),transaction_date=extractThaiSlipDate(t),direction=inferSlipDirection(t);
  const bank=t.match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);
  const ref=t.match(/(?:เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:#]?\s*([A-Za-z0-9-]{8,})/i);
  return{amount:amount==null?'':String(amount),transaction_date,direction,bank_name:bank?.[0]||'',reference_no:ref?.[1]||'',raw_text:t};
}

export async function readSlipLocally(file,onProgress=()=>{}){
  if(!file||!file.type.startsWith('image/'))throw new Error('กรุณาเลือกรูปภาพสลิป');
  if(file.size>15*1024*1024)throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  if(!workerPromise)workerPromise=import('tesseract.js').then(({createWorker})=>createWorker('tha+eng',1,{logger:m=>{if(m.status==='recognizing text')onProgress(Math.min(70,Math.round(m.progress*70)));}})).catch(e=>{workerPromise=null;throw e;});
  const worker=await workerPromise;
  let text='';
  const passes=[[0,1,'3'],[.2,.98,'6'],[.55,.99,'6']];
  for(let i=0;i<passes.length;i++){
    const current=parse(text);if(i>0&&current.amount&&current.transaction_date&&current.direction)break;
    onProgress(i===0?5:i===1?74:88);
    const img=await prep(file,passes[i][0],passes[i][1]);
    await worker.setParameters({tessedit_pageseg_mode:passes[i][2],preserve_interword_spaces:'1',tessedit_char_whitelist:''});
    const r=await worker.recognize(img);text+=(text?'\n':'')+(r.data.text||'');
  }
  await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',tessedit_char_whitelist:''});
  onProgress(100);
  const fields=parse(text);
  return{text,confidence:null,fields};
}

export function parseSlipText(text){return parse(text);}
