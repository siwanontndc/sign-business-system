const digits=s=>String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
const clean=s=>digits(s).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/').replace(/[\u200b-\u200d]/g,' ');
const num=s=>Number(String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));

function formatDate(d,m,y){
  d=num(d);m=num(m);y=num(y);
  if(y>2400)y-=543;
  if(y<100)y+=y>=40?2500:2000;
  if(y<2000||y>2100||m<1||m>12||d<1||d>31)return'';
  const x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d
    ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
}

const months={มค:1,กพ:2,มีค:3,เมย:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,เมษายน:4,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};

function monthToken(s){
  const raw=clean(s).toLowerCase().replace(/[\s.·,]/g,'');
  if(months[raw])return months[raw];
  const stripped=raw.replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');
  if(months[stripped])return months[stripped];
  if(/^ก.?ย/.test(raw)||/^ก.?[ุูิีึืั็่้๊๋์ํ]*ย/.test(raw))return 9;
  if(/^ส.?ค/.test(raw))return 8;
  if(/^ต.?ค/.test(raw))return 10;
  return 0;
}

export function extractThaiSlipDate(text=''){
  const s=clean(text);let m;
  const numeric=/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})(?!\d)/gi;
  while((m=numeric.exec(s))){const v=formatDate(m[1],m[2],m[3]);if(v)return v;}
  const named=/([0-9OoIl|]{1,2})\s*([ก-๙.\s]{1,22}?)\s*([0-9OoIl|]{4})(?!\d)/gi;
  while((m=named.exec(s))){const month=monthToken(m[2]);if(month){const v=formatDate(m[1],month,m[3]);if(v)return v;}}
  return'';
}

function normalizeName(s){return clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}
function own(s){
  const n=normalizeName(s);
  const business=n.includes('ธานี')&&(n.includes('แอดเวอร์')||n.includes('แอดเวอ')||n.includes('advertis'));
  const owner=n.includes('ศิวนนท์')||n.includes('ศค้วนนท์')||n.includes('ศุภฐิติ')||n.includes('ศุภฐติ');
  return business||owner;
}
const sender=/^(?:จาก|ผู้โอน|บัญชีผู้โอน|from|sender)\s*[:：]?/i;
const recipient=/^(?:ไปยัง|ผู้รับ|บัญชีผู้รับ|to|recipient)\s*[:：]?/i;

function sections(text=''){
  const lines=clean(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let mode='',from=[],to=[];
  for(const line of lines){
    const label=line.replace(/^[^ก-๙A-Za-z]*/, '');
    if(recipient.test(label)){mode='to';to.push(line);continue;}
    if(sender.test(label)){mode='from';from.push(line);continue;}
    if(mode==='to')to.push(line);
    else if(mode==='from')from.push(line);
  }
  return{from:from.join(' '),to:to.join(' ')};
}

export function inferSlipDirection(text=''){
  const {from,to}=sections(text);
  const fromOwn=own(from),toOwn=own(to);
  if(toOwn&&!fromOwn)return'income';
  if(fromOwn&&!toOwn)return'expense';
  return'';
}
