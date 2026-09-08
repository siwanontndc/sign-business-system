// OCR runs entirely in the user's browser. No paid API or server-side AI.
let workerPromise;
export async function readSlipLocally(file, onProgress = () => {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('กรุณาเลือกรูปภาพสลิป');
  if (file.size > 15 * 1024 * 1024) throw new Error('รูปภาพต้องไม่เกิน 15 MB');
  if (!workerPromise) workerPromise = import('tesseract.js').then(({createWorker}) => createWorker('tha+eng', 1, {logger: m => { if(m.status === 'recognizing text') onProgress(Math.round(m.progress * 100)); }})).catch(e => {workerPromise = null; throw e;});
  const worker = await workerPromise;
  const result = await worker.recognize(file);
  return {text: result.data.text, confidence: result.data.confidence / 100, fields: parseSlipText(result.data.text)};
}

function thaiDigitsToArabic(s='') {
  return s.replace(/[๐-๙]/g, c => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
}
function findTransactionDate(text='') {
  const s = thaiDigitsToArabic(String(text))
    .replace(/[\u200b-\u200d]/g,' ')
    .replace(/ก\s*\.\s*ย\s*\.?/g,'กย')
    .replace(/ม\s*\.\s*ค\s*\.?/g,'มค')
    .replace(/ก\s*\.\s*พ\s*\.?/g,'กพ')
    .replace(/มี\s*\.\s*ค\s*\.?/g,'มีค')
    .replace(/เม\s*\.\s*ย\s*\.?/g,'เมย')
    .replace(/พ\s*\.\s*ค\s*\.?/g,'พค')
    .replace(/มิ\s*\.\s*ย\s*\.?/g,'มิย')
    .replace(/ก\s*\.\s*ค\s*\.?/g,'กค')
    .replace(/ส\s*\.\s*ค\s*\.?/g,'สค')
    .replace(/ต\s*\.\s*ค\s*\.?/g,'ตค')
    .replace(/พ\s*\.\s*ย\s*\.?/g,'พย')
    .replace(/ธ\s*\.\s*ค\s*\.?/g,'ธค');
  const monthMap = {มค:1,มกราคม:1,กพ:2,กุมภาพันธ์:2,มีค:3,มีนาคม:3,เมย:4,เมษายน:4,พค:5,พฤษภาคม:5,มิย:6,มิถุนายน:6,กค:7,กรกฎาคม:7,สค:8,สิงหาคม:8,กย:9,กันยายน:9,ตค:10,ตุลาคม:10,พย:11,พฤศจิกายน:11,ธค:12,ธันวาคม:12,jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const patterns = [
    /(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{2,4})/i,
    /(\d{1,2})\s*(มค|กพ|มีค|เมย|พค|มิย|กค|สค|กย|ตค|พย|ธค|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*(\d{2,4})/i
  ];
  for (const re of patterns) {
    const m=s.match(re); if(!m) continue;
    const day=Number(m[1]);
    const month=/^\d+$/.test(m[2])?Number(m[2]):monthMap[m[2].toLowerCase()];
    let year=Number(m[3]);
    if(year<100) year += year>=40?2500:2000;
    if(year>2400) year-=543;
    if(day>=1&&day<=31&&month>=1&&month<=12&&year>=2000&&year<=2100) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return '';
}

export function parseSlipText(text) {
  const t = thaiDigitsToArabic(String(text || '')).replace(/[\u200b-\u200d]/g, '');
  const money = [...t.matchAll(/(?:฿|THB|บาท|จำนวนเงิน|ยอดเงิน|จำนวน|Amount|Total)\s*[:：]?\s*([\d,]+\.\d{2})/gi)].map(m => Number(m[1].replace(/,/g,''))).filter(n => n > 0);
  const amounts = [...t.matchAll(/(?:^|\s)([\d,]+\.\d{2})(?=\s|$|บาท|฿)/gm)].map(m => Number(m[1].replace(/,/g,''))).filter(n => n > 0);
  const amount = money[0] || (amounts.length === 1 ? amounts[0] : null);
  const transaction_date = findTransactionDate(t);
  const bank = t.match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);
  const ref = t.match(/(?:เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:：#]?\s*([A-Za-z0-9-]{8,})/i);
  return {amount: amount == null ? '' : String(amount), transaction_date, bank_name: bank?.[0] || '', reference_no: ref?.[1] || '', raw_text:t};
}
