function clean(s=''){
  return String(s||'')
    .replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)))
    .replace(/[：]/g,':')
    .replace(/[‐‑‒–—−]/g,'-')
    .replace(/[／]/g,'/')
    .replace(/[\u200b-\u200d]/g,' ');
}

function fixDigits(s=''){return String(s).replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');}

function formatDate(d,m,y){
  d=Number(d);m=Number(m);y=Number(y);
  if(y>2400)y-=543;
  if(y<100)y+=y>=40?2500:2000;
  if(d<1||d>31||m<1||m>12||y<2000||y>2100)return'';
  const x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d
    ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
}

const months={
  มค:1,กพ:2,มีค:3,เมย:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,
  มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,เมษายน:4,พฤษภาคม:5,มิถุนายน:6,
  กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12
};

function normalizeThaiMonthToken(token=''){
  let t=clean(token).toLowerCase();
  // OCR often inserts stray vowels/marks/spaces inside abbreviated Thai months,
  // e.g. "ก.ุย." instead of "ก.ย.".
  t=t.replace(/[\s.·,]/g,'')
     .replace(/[ุูิีึืั็่้๊๋์ํ]/g,'');
  const aliases={
    มค:'มค',กพ:'กพ',มีค:'มีค',มคค:'มีค',เมย:'เมย',พค:'พค',มิย:'มิย',
    กค:'กค',สค:'สค',กย:'กย',กุย:'กย',กิย:'กย',ตค:'ตค',พย:'พย',ธค:'ธค'
  };
  return aliases[t]||t;
}

export function extractThaiSlipDate(text=''){
  const s=clean(text);

  let m=s.match(/([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{1,2})\s*[\/\-.]\s*([0-9OoIl|]{2,4})/i);
  if(m){
    const v=formatDate(fixDigits(m[1]),fixDigits(m[2]),fixDigits(m[3]));
    if(v)return v;
  }

  // Match a loose Thai month token because OCR may inject Thai vowel marks.
  m=s.match(/([0-9OoIl|]{1,2})\s+([^\d\n]{1,18}?)\s+([0-9OoIl|]{2,4})(?=\s|$|[-–—,:])/i);
  if(m){
    const key=normalizeThaiMonthToken(m[2]);
    const month=months[key]||0;
    const v=formatDate(fixDigits(m[1]),month,fixDigits(m[3]));
    if(v)return v;
  }

  // Fallback for compact OCR such as "08ก.ุย.2569".
  m=s.match(/([0-9OoIl|]{1,2})\s*([^\d\s]{1,12})\s*([0-9OoIl|]{2,4})/i);
  if(m){
    const key=normalizeThaiMonthToken(m[2]);
    const month=months[key]||0;
    const v=formatDate(fixDigits(m[1]),month,fixDigits(m[3]));
    if(v)return v;
  }

  return'';
}

function normalizeName(s=''){
  return clean(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
}

function isOwnBusiness(text=''){
  const n=normalizeName(text);
  // Main account: ธานีแอดเวอร์ไทซิ่ง โดยนายศิวนนท์ ศุภฐิติพงศ์, Krungthai.
  // Use distinctive fragments so small OCR spelling errors still match.
  const hasThanee=n.includes('ธานี');
  const hasAdvert=n.includes('แอดเวอร์')||n.includes('advertis');
  const hasOwner=n.includes('ศิวนนท์')||n.includes('ศุภฐิติพงศ์')||n.includes('ศุภฐิติ');
  return (hasThanee&&hasAdvert)||hasOwner;
}

function blockAroundLabel(lines,labelRe){
  for(let i=0;i<lines.length;i++){
    if(labelRe.test(lines[i])) return lines.slice(i,Math.min(lines.length,i+8)).join(' ');
  }
  return'';
}

export function inferSlipDirection(text=''){
  const s=clean(text),lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

  // Do not require the label to start the line; OCR often prefixes symbols or bank text.
  const to=blockAroundLabel(lines,/(ไปยัง|ผู้รับ|บัญชีผู้รับ|to\b|recipient)/i);
  const from=blockAroundLabel(lines,/(จาก|ผู้โอน|บัญชีผู้โอน|from\b|sender)/i);

  if(to&&isOwnBusiness(to))return'income';
  if(from&&isOwnBusiness(from))return'expense';

  // Secondary heuristic: inspect positions of labels and own-account name in the raw OCR text.
  const lower=s.toLowerCase();
  const ownIndex=Math.min(...['ธานี','แอดเวอร์','ศิวนนท์','ศุภฐิติ'].map(k=>lower.indexOf(k)).filter(i=>i>=0));
  if(Number.isFinite(ownIndex)){
    const before=lower.slice(Math.max(0,ownIndex-220),ownIndex);
    if(/(ไปยัง|ผู้รับ|บัญชีผู้รับ|to\b|recipient)/i.test(before))return'income';
    if(/(จาก|ผู้โอน|บัญชีผู้โอน|from\b|sender)/i.test(before))return'expense';
  }

  return'';
}
