const digits=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
const clean=s=>digits(s).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/').replace(/[\u200b-\u200d]/g,' ');
const num=s=>Number(String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
function formatDate(d,m,y){d=num(d);m=num(m);y=num(y);if(y>2400)y-=543;if(y<100)y+=y>=40?2500:2000;if(y<2000||y>2100||m<1||m>12||d<1||d>31)return'';const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
const months={มค:1,กพ:2,มีค:3,เมย:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,เมษายน:4,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};
function monthToken(s){const t=clean(s).replace(/[\s.·,]/g,'').replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');if(months[t])return months[t];if(/^ก.?ย/.test(t)||/^ก[ุูิีึืั็่้๊๋์ํ]?ย/.test(clean(s).replace(/[\s.·,]/g,'')))return 9;return 0;}
export function extractThaiSlipDate(text=''){
 const s=clean(text);let m;
 const numeric=/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})(?!\d)/gi;
 while((m=numeric.exec(s))){const v=formatDate(m[1],m[2],m[3]);if(v)return v;}
 const named=/([0-9OoIl|]{1,2})\s*([ก-๙.\s]{2,22}?)\s*([0-9OoIl|]{4})(?!\d)/gi;
 while((m=named.exec(s))){const month=monthToken(m[2]);if(month){const v=formatDate(m[1],month,m[3]);if(v)return v;}}
 return'';
}
function normalizeName(s){return clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}
function own(s){
 const n=normalizeName(s);
 const thanee=n.includes('ธานี')||n.includes('ธาณี')||n.includes('ทานี');
 const advert=n.includes('แอดเวอร์')||n.includes('แอดเวอ')||n.includes('ไทซิ่ง')||n.includes('ไทชิง')||n.includes('ไทซิง')||n.includes('advertis');
 const owner=n.includes('ศิวนนท์')||n.includes('ศค้วนนท์')||n.includes('ศิวนน')||n.includes('ศุภฐิติ')||n.includes('ศุภฐิติพงศ์');
 return (thanee&&advert)||owner;
}
const sender=/(?:^|\s)(จาก|ผู้โอน|บัญชีผู้โอน|from|sender)\s*[:：]?/i;
const recipient=/(?:^|\s)(ไปยัง|ผู้รับ|บัญชีผู้รับ|to|recipient)\s*[:：]?/i;
function classifyBySections(lines){
 let section='',from='',to='';
 for(const line of lines){
   if(recipient.test(line))section='to';
   else if(sender.test(line))section='from';
   if(section==='to')to+=' '+line;
   else if(section==='from')from+=' '+line;
 }
 const inFrom=own(from),inTo=own(to);
 if(inTo&&!inFrom)return'income';
 if(inFrom&&!inTo)return'expense';
 return'';
}
function nearestLabelDirection(s){
 const normalized=clean(s).toLowerCase();
 const keys=['ธานี','แอดเวอร์','ไทซิ่ง','ไทชิง','ศิวนนท์','ศค้วนนท์','ศุภฐิติ'];
 const positions=keys.map(k=>normalized.indexOf(k)).filter(i=>i>=0);
 if(!positions.length)return'';
 const ownPos=Math.min(...positions);
 const before=normalized.slice(Math.max(0,ownPos-450),ownPos);
 const toMatches=[...before.matchAll(/ไปยัง|ผู้รับ|บัญชีผู้รับ|\bto\b|recipient/gi)];
 const fromMatches=[...before.matchAll(/จาก|ผู้โอน|บัญชีผู้โอน|\bfrom\b|sender/gi)];
 const toPos=toMatches.length?toMatches[toMatches.length-1].index:-1;
 const fromPos=fromMatches.length?fromMatches[fromMatches.length-1].index:-1;
 if(toPos>fromPos&&toPos>=0)return'income';
 if(fromPos>toPos&&fromPos>=0)return'expense';
 return'';
}
export function inferSlipDirection(text=''){
 const s=clean(text),lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const bySection=classifyBySections(lines);
 if(bySection)return bySection;
 const byNearest=nearestLabelDirection(s);
 if(byNearest)return byNearest;
 return'';
}
