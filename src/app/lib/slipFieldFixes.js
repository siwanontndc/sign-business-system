const digits=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
const clean=s=>digits(s).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/').replace(/[\u200b-\u200d]/g,' ');
const normalize=s=>clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
const splitPasses=text=>clean(text).split(/\n\s*-{2,}\s*OCR_PASS\s*-{2,}\s*\n/i).map(x=>x.trim()).filter(Boolean);
const num=s=>Number(String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
const accountDigits=s=>clean(s).replace(/[^0-9]/g,'');

// Verified company identifiers from the user's actual slips.
const OWN_ACCOUNT_ENDINGS=['4034','1403'];
function own(s){
  const n=normalize(s),a=accountDigits(s);
  const thanee=n.includes('ธานี')&&(n.includes('แอดเวอร์')||n.includes('แอดเวอ')||n.includes('แอด')||n.includes('ไทซิ่ง')||n.includes('ไทซ')||n.includes('advertis'));
  const owner=n.includes('ศิวนนท์')||n.includes('ศค้วนนท์')||n.includes('ศุภฐิติ')||n.includes('ศุภฐติ');
  const account=OWN_ACCOUNT_ENDINGS.some(x=>a.endsWith(x));
  return thanee||owner||account;
}

function formatDate(d,m,y,{thaiShort=false}={}){
  d=num(d);m=num(m);y=num(y);
  if(y<100)y=thaiShort?2500+y:2000+y;
  if(y>2400)y-=543;
  if(y<2000||y>2100||m<1||m>12||d<1||d>31)return'';
  const x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
}
const months={มค:1,กพ:2,มีค:3,เมย:4,เมษายน:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};
function monthToken(s){
  const raw=clean(s).toLowerCase().replace(/[\s.·,]/g,'');
  if(months[raw])return months[raw];
  const stripped=raw.replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');
  if(months[stripped])return months[stripped];
  if(/^ก.?ย/.test(raw))return 9;if(/^ส.?ค/.test(raw))return 8;if(/^ต.?ค/.test(raw))return 10;
  return 0;
}
function dateFromOnePass(text=''){
  const s=clean(text);let m;
  const named=/([0-9OoIl|]{1,2})\s*([ก-๙.\s]{1,18}?)\s*([0-9OoIl|]{2,4})(?=\s|[-–]|\d{1,2}\s*:\s*\d{2}|น\.?|$)/gi;
  while((m=named.exec(s))){
    const month=monthToken(m[2]);if(!month)continue;
    const yy=String(m[3]).replace(/\D/g,'');
    const v=formatDate(m[1],month,m[3],{thaiShort:yy.length===2});if(v)return v;
  }
  const numeric=/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})(?!\d)/gi;
  while((m=numeric.exec(s))){
    const yy=String(m[3]).replace(/\D/g,'');
    let v=formatDate(m[1],m[2],m[3],{thaiShort:false});if(v)return v;
    if(yy.length===2){v=formatDate(m[1],m[2],m[3],{thaiShort:true});if(v)return v;}
  }
  return'';
}
function mode(values){
  const counts=new Map();for(const v of values.filter(Boolean))counts.set(v,(counts.get(v)||0)+1);
  if(!counts.size)return'';
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
}
export function extractThaiSlipDate(text=''){
  const passes=splitPasses(text);
  return mode(passes.map(dateFromOnePass))||dateFromOnePass(text);
}

const sender=/^(?:จาก|จา[กค]|วาก|ผู้โอน|บัญชีผู้โอน|from|sender)(?=\s|:|：|[ก-๙A-Za-z0-9]|$)/i;
const recipient=/^(?:ไปยัง|ไปยั[งง]|ผู้รับ|บัญชีผู้รับ|to|recipient)(?=\s|:|：|[ก-๙A-Za-z0-9]|$)/i;
const stop=/^(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดโอน|ยอดชำระ|ค่าธรรมเนียม|วันที่|วันที่ทำรายการ|วันท|เวลา|บันทึกช่วยจำ|หมายเหตุ|เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|รหัสร้านค้า|รหัสธุรกรรม|reference|transaction|amount|total|fee|date|time|note|memo)(?=\s|:|：|[0-9ก-๙A-Za-z]|$)/i;
function labelOf(line){return clean(line).replace(/^[^ก-๙A-Za-z]*/,'').trim();}
function stripMarker(line,re){return labelOf(line).replace(re,'').replace(/^\s*[:：-]?\s*/,'').trim();}
function sections(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const out={from:[],to:[]};let mode='',buf=[];
  const flush=()=>{if(mode&&buf.length)out[mode].push(buf.join(' '));buf=[];};
  for(const raw of lines){
    const l=labelOf(raw);
    if(sender.test(l)){flush();mode='from';const rest=stripMarker(l,sender);if(rest)buf.push(rest);continue;}
    if(recipient.test(l)){flush();mode='to';const rest=stripMarker(l,recipient);if(rest)buf.push(rest);continue;}
    if(stop.test(l)){flush();mode='';continue;}
    if(mode)buf.push(raw);
  }
  flush();return out;
}
function hasKbank(text){const n=normalize(text);return n.includes('กสิกรไทย')||n.includes('kplus')||n.includes('kbank')||n.includes('kasikorn');}
function kbankOrderDirection(text=''){
  if(!hasKbank(text))return'';
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let end=lines.length;
  for(let i=0;i<lines.length;i++)if(/^(?:เลขที่รายการ|จำนวน|ค่าธรรมเนียม|reference|amount)/i.test(labelOf(lines[i]))){end=i;break;}
  const header=lines.slice(0,end);
  const ownIdx=[];for(let i=0;i<header.length;i++)if(own(header.slice(Math.max(0,i-1),Math.min(header.length,i+2)).join(' ')))ownIdx.push(i);
  if(!ownIdx.length)return'';
  const bankIdx=[];for(let i=0;i<header.length;i++){const n=normalize(header[i]);if(n.includes('กสิกรไทย')||n.includes('กรุงไทย')||n.includes('ไทยพาณิชย์')||n.includes('กรุงเทพ')||n.includes('กรุงศรี')||n.includes('ttb')||n.includes('พร้อมเพย์')||n.includes('promptpay'))bankIdx.push(i);}
  if(!bankIdx.length)return'';
  const firstPartyBank=bankIdx[0];
  for(const i of ownIdx){if(i<firstPartyBank)return'expense';if(i>firstPartyBank)return'income';}
  return'';
}
function explicitMarkerEvidence(text=''){
  const p=sections(text);const from=p.from.some(own),to=p.to.some(own);
  if(from&&!to)return{direction:'expense',strength:100};
  if(to&&!from)return{direction:'income',strength:100};
  return{direction:'',strength:0};
}
function directNearbyEvidence(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(!own(lines.slice(i,Math.min(lines.length,i+2)).join(' ')))continue;
    for(let j=i-1;j>=Math.max(0,i-4);j--){const l=labelOf(lines[j]);if(recipient.test(l))return{direction:'income',strength:95};if(sender.test(l))return{direction:'expense',strength:95};if(stop.test(l))break;}
    for(let j=i+1;j<=Math.min(lines.length-1,i+4);j++){const l=labelOf(lines[j]);if(recipient.test(l))return{direction:'expense',strength:92};if(sender.test(l))break;if(stop.test(l))break;}
  }
  return{direction:'',strength:0};
}
function onePassEvidence(text=''){
  const explicit=explicitMarkerEvidence(text);if(explicit.direction)return explicit;
  const nearby=directNearbyEvidence(text);if(nearby.direction)return nearby;
  const n=normalize(text);
  if((n.includes('จ่ายบิลสำเร็จ')||n.includes('ชำระบิลสำเร็จ'))&&own(text))return{direction:'expense',strength:90};
  const kb=kbankOrderDirection(text);if(kb)return{direction:kb,strength:80};
  return{direction:'',strength:0};
}
export function extractSlipParties(text=''){const p=sections(text);return{from:p.from.join(' | '),to:p.to.join(' | ')};}
export function inferSlipDirection(text=''){
  const passes=splitPasses(text);
  const evidences=(passes.length?passes:[text]).map(onePassEvidence).filter(x=>x.direction);
  if(!evidences.length)return'';
  let income=0,expense=0,maxIncome=0,maxExpense=0;
  for(const e of evidences){if(e.direction==='income'){income+=e.strength;maxIncome=Math.max(maxIncome,e.strength);}else{expense+=e.strength;maxExpense=Math.max(maxExpense,e.strength);}}
  if(maxExpense>=95&&maxIncome<95)return'expense';
  if(maxIncome>=95&&maxExpense<95)return'income';
  if(expense>income)return'expense';if(income>expense)return'income';return'';
}
