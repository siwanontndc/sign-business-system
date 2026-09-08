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
export function parseSlipText(text) {
  const t = String(text || '').replace(/[\u200b-\u200d]/g, '');
  const money = [...t.matchAll(/(?:฿|THB|บาท|จำนวนเงิน|ยอดเงิน|จำนวน|Amount|Total)\s*[:：]?\s*([\d,]+\.\d{2})/gi)].map(m => Number(m[1].replace(/,/g,''))).filter(n => n > 0);
  const amounts = [...t.matchAll(/(?:^|\s)([\d,]+\.\d{2})(?=\s|$|บาท|฿)/gm)].map(m => Number(m[1].replace(/,/g,''))).filter(n => n > 0);
  const amount = money[0] || (amounts.length === 1 ? amounts[0] : null);
  const date = t.match(/(\d{1,2})[\s\/-]+(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|\d{1,2})[\s\/-]+(\d{2,4})/);
  let transaction_date = '';
  if(date) {
    const months = ['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
    const month = /^\d+$/.test(date[2]) ? Number(date[2]) : months.indexOf(date[2].replace(/\./g,'')) + 1;
    let year = Number(date[3]); if(year < 100) year += year > 40 ? 2500 : 2000; if(year > 2400) year -= 543;
    if(month >= 1 && month <= 12 && year >= 2000 && year <= 2100) transaction_date = `${year}-${String(month).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
  }
  const bank = t.match(/กรุงไทย|กสิกรไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทยธนชาต|ออมสิน|ธ\.ก\.ส\.|Krungthai|Kasikorn|SCB|Bangkok Bank|Krungsri|TTB/i);
  const ref = t.match(/(?:เลขที่รายการ|เลขอ้างอิง|รหัสอ้างอิง|Reference|Ref\.?|Transaction ID)\s*[:：#]?\s*([A-Za-z0-9-]{8,})/i);
  return {amount: amount == null ? '' : String(amount), transaction_date, bank_name: bank?.[0] || '', reference_no: ref?.[1] || '', raw_text:t};
}
