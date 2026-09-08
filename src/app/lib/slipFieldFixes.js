function clean(s=''){return String(s||'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c))).replace(/[：]/g,':').replace(/[‐‑‒–—−]/g,'-').replace(/[／]/g,'/');}
function fixDigits(s=''){return String(s).replace(/[Oo]/g,'0').replace(/[Il]/g,'1');}
function formatDate(d,m,y){d=Number(d);m=Number(m);y=Number(y);if(y>2400)y-=543;if(y<100)y+=y>=40?2500:2000;if(d<1||d>31||m<1||m>12||y<2000||y>2100)return'';const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
const months={มค:1,กพ:2,มีค:3,เมย:4,พค:5,มิย:6,กค:7,สค:8,กย:9,ตค:10,พย:11,ธค:12,มกราคม:1,กุมภาพันธ์:2,มีนาคม:3,เมษายน:4,พฤษภาคม:5,มิถุนายน:6,กรกฎาคม:7,สิงหาคม:8,กันยายน:9,ตุลาคม:10,พฤศจิกายน:11,ธันวาคม:12};
export function extractThaiSlipDate(text=''){
 const s=clean(text);
 let m=s.match(/([0-9OoIl]{1,2})\s*[\/\-.]\s*([0-9OoIl]{1,2})\s*[\/\-.]\s*([0-9OoIl]{2,4})/i);
 if(m){const v=formatDate(fixDigits(m[1]),fixDigits(m[2]),fixDigits(m[3]));if(v)return v;}
 m=s.match(/([0-9OoIl]{1,2})\s*(ม\.?\s*ค|ก\.?\s*พ|มี\.?\s*ค|เม\.?\s*ย|พ\.?\s*ค|มิ\.?\s*ย|ก\.?\s*ค|ส\.?\s*ค|ก\.?\s*ย|ต\.?\s*ค|พ\.?\s*ย|ธ\.?\s*ค|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\.?\s*([0-9OoIl]{2,4})/i);
 if(!m)return'';const key=m[2].replace(/[.\s]/g,'');return formatDate(fixDigits(m[1]),months[key]||0,fixDigits(m[3]));
}
export function inferSlipDirection(text=''){
 const s=clean(text),lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 function block(re){for(let i=0;i<lines.length;i++)if(re.test(lines[i]))return lines.slice(i,i+7).join(' ');return'';}
 const to=block(/^(ไปยัง|ผู้รับ|to)\b/i),from=block(/^(จาก|ผู้โอน|from)\b/i),business=/(แอดเวอร์|advertis)/i;
 if(business.test(to))return'income';
 if(business.test(from))return'expense';
 return'';
}
