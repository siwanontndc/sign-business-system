const digits=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
const clean=s=>digits(s).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/').replace(/[\u200b-\u200d]/g,' ');
const num=s=>Number(String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
function formatDate(d,m,y){d=num(d);m=num(m);y=num(y);if(y>2400)y-=543;if(y<100)y+=y>=40?2500:2000;if(y<2000||y>2100||m<1||m>12||d<1||d>31)return'';const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
const months={มค:1,กพ:2,มีค:3,เมย:4,เมษายน:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};
function monthToken(s){const raw=clean(s).toLowerCase().replace(/[\s.·,]/g,'');if(months[raw])return months[raw];const stripped=raw.replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');if(months[stripped])return months[stripped];if(/^ก.?ย/.test(raw)||/^ก.?[ุูิีึืั็่้๊๋์ํ]*ย/.test(raw))return 9;if(/^ส.?ค/.test(raw))return 8;if(/^ต.?ค/.test(raw))return 10;return 0;}
export function extractThaiSlipDate(text=''){const s=clean(text);let m;const numeric=/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})(?!\d)/gi;while((m=numeric.exec(s))){const v=formatDate(m[1],m[2],m[3]);if(v)return v;}const named=/([0-9OoIl|]{1,2})\s*([ก-๙.\s]{1,22}?)\s*([0-9OoIl|]{4})(?!\d)/gi;while((m=named.exec(s))){const month=monthToken(m[2]);if(month){const v=formatDate(m[1],month,m[3]);if(v)return v;}}return'';}

const normalize=s=>clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
const accountDigits=s=>clean(s).replace(/[^0-9]/g,'');
const OWN_ACCOUNT_ENDINGS=['4034'];
function own(s){
 const n=normalize(s),a=accountDigits(s);
 const thanee=n.includes('ธานี')&&(n.includes('แอดเวอร์')||n.includes('แอดเวอ')||n.includes('ไทซิ่ง')||n.includes('advertis'));
 const owner=n.includes('ศิวนนท์')||n.includes('ศค้วนนท์')||n.includes('ศุภฐิติ')||n.includes('ศุภฐติ');
 const acct=OWN_ACCOUNT_ENDINGS.some(x=>a.endsWith(x));
 return thanee||owner||acct;
}
const sender=/^(?:จาก|ผู้โอน|บัญชีผู้โอน|from|sender)(?:\s|:|：|$)/i;
const recipient=/^(?:ไปยัง|ผู้รับ|บัญชีผู้รับ|to|recipient)(?:\s|:|：|$)/i;
const stop=/^(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|ยอดชำระ|ค่าธรรมเนียม|วันที่|วันท|เวลา|บันทึกช่วยจำ|หมายเหตุ|เลขอ้างอิง|รหัสอ้างอิง|reference|transaction|amount|total|fee|date|time|note|memo)(?:\s|:|：|$)/i;
function labelOf(line){return clean(line).replace(/^[^ก-๙A-Za-z]*/,'').trim();}

function directionalEvidence(text=''){
 const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let mode='',fromScore=0,toScore=0;
 for(let i=0;i<lines.length;i++){
  const l=labelOf(lines[i]);
  if(sender.test(l)){mode='from';continue;}
  if(recipient.test(l)){mode='to';continue;}
  if(stop.test(l)){mode='';continue;}
  if(!mode)continue;
  const window=[lines[i],lines[i+1]||'',lines[i+2]||''].join(' ');
  if(own(window)){
   if(mode==='from')fromScore+=3;
   if(mode==='to')toScore+=3;
  }
 }
 return{fromScore,toScore};
}

function directContextEvidence(text=''){
 const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let fromScore=0,toScore=0;
 for(let i=0;i<lines.length;i++){
  if(!own(lines[i]))continue;
  const prev=lines.slice(Math.max(0,i-5),i).map(labelOf);
  for(let j=prev.length-1;j>=0;j--){
   if(recipient.test(prev[j])){toScore+=2;break;}
   if(sender.test(prev[j])){fromScore+=2;break;}
   if(stop.test(prev[j]))break;
  }
 }
 return{fromScore,toScore};
}

export function extractSlipParties(text=''){
 const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const out={from:[],to:[]};let mode='';
 for(const line of lines){const l=labelOf(line);if(sender.test(l)){mode='from';continue;}if(recipient.test(l)){mode='to';continue;}if(stop.test(l)){mode='';continue;}if(mode)out[mode].push(line);}
 return{from:out.from.join(' | '),to:out.to.join(' | ')};
}

export function inferSlipDirection(text=''){
 const a=directionalEvidence(text),b=directContextEvidence(text);
 const from=a.fromScore+b.fromScore,to=a.toScore+b.toScore;
 if(from>to&&from>0)return'expense';
 if(to>from&&to>0)return'income';
 return'';
}
