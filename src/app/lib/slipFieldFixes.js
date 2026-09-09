const digits=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
const clean=s=>digits(s).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/').replace(/[\u200b-\u200d]/g,' ');
const num=s=>Number(String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
function formatDate(d,m,y){d=num(d);m=num(m);y=num(y);if(y>2400)y-=543;if(y<100)y+=y>=40?2500:2000;if(y<2000||y>2100||m<1||m>12||d<1||d>31)return'';const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
const months={มค:1,กพ:2,มีค:3,เมย:4,เมษายน:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};
function monthToken(s){const raw=clean(s).toLowerCase().replace(/[\s.·,]/g,'');if(months[raw])return months[raw];const stripped=raw.replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');if(months[stripped])return months[stripped];if(/^ก.?ย/.test(raw)||/^ก.?[ุูิีึืั็่้๊๋์ํ]*ย/.test(raw))return 9;if(/^ส.?ค/.test(raw))return 8;if(/^ต.?ค/.test(raw))return 10;return 0;}
export function extractThaiSlipDate(text=''){const s=clean(text);let m;const numeric=/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})(?!\d)/gi;while((m=numeric.exec(s))){const v=formatDate(m[1],m[2],m[3]);if(v)return v;}const named=/([0-9OoIl|]{1,2})\s*([ก-๙.\s]{1,22}?)\s*([0-9OoIl|]{4})(?!\d)/gi;while((m=named.exec(s))){const month=monthToken(m[2]);if(month){const v=formatDate(m[1],month,m[3]);if(v)return v;}}return'';}

const normalize=s=>clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
function own(s){
 const n=normalize(s);
 const thanee=n.includes('ธานี')&&(n.includes('แอดเวอร์')||n.includes('แอดเวอ')||n.includes('แอด')||n.includes('ไทซิ่ง')||n.includes('ไทซ')||n.includes('advertis'));
 const owner=n.includes('ศิวนนท์')||n.includes('ศค้วนนท์')||n.includes('ศุภฐิติ')||n.includes('ศุภฐติ');
 return thanee||owner;
}
const sender=/^(?:จาก|จา[กค]|วาก|ผู้โอน|บัญชีผู้โอน|from|sender)(?:\s|:|：|$)/i;
const recipient=/^(?:ไปยัง|ไปยั[งง]|ผู้รับ|บัญชีผู้รับ|to|recipient)(?:\s|:|：|$)/i;
const stop=/^(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|ค่าธรรมเนียม|วันที่|วันท|เวลา|บันทึกช่วยจำ|หมายเหตุ|เลขอ้างอิง|รหัสอ้างอิง|reference|transaction|amount|total|fee|date|time|note|memo)(?:\s|:|：|$)/i;
function labelOf(line){return clean(line).replace(/^[^ก-๙A-Za-z]*/,'').trim();}

function classifyOwnLine(lines,i){
  // 1) Prefer the nearest explicit section marker above the account/name.
  for(let j=i-1;j>=Math.max(0,i-8);j--){
    const l=labelOf(lines[j]);
    if(stop.test(l))break;
    if(recipient.test(l))return'income';
    if(sender.test(l))return'expense';
  }
  // 2) Krungthai-style slips always put sender before the "ไปยัง" marker.
  // This fallback handles OCR that misreads "จาก" but still reads "ไปยัง" correctly.
  for(let j=i+1;j<=Math.min(lines.length-1,i+8);j++){
    const l=labelOf(lines[j]);
    if(stop.test(l))break;
    if(recipient.test(l))return'expense';
    if(sender.test(l))break;
  }
  return'';
}

export function extractSlipParties(text=''){
 const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const out={from:[],to:[]};let mode='';
 for(const line of lines){const l=labelOf(line);if(sender.test(l)){mode='from';continue;}if(recipient.test(l)){mode='to';continue;}if(stop.test(l)){mode='';continue;}if(mode)out[mode].push(line);}
 return{from:out.from.join(' | '),to:out.to.join(' | ')};
}

export function inferSlipDirection(text=''){
 const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let expense=0,income=0;
 for(let i=0;i<lines.length;i++){
   if(!own(lines[i]))continue;
   const d=classifyOwnLine(lines,i);
   if(d==='expense')expense++;
   if(d==='income')income++;
 }
 if(expense>income&&expense>0)return'expense';
 if(income>expense&&income>0)return'income';
 // Final safe fallback: if every recognized occurrence agrees, use it; otherwise do not guess.
 if(expense>0&&income===0)return'expense';
 if(income>0&&expense===0)return'income';
 return'';
}
