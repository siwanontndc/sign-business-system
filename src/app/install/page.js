"use client";

import { useRouter } from "next/navigation";

const steps = [
  { icon: "🧭", title: "1. เปิดด้วย Safari", text: "เปิด SIGN BUSINESS ด้วย Safari บน iPhone หรือ iPad (ไม่ใช่เบราว์เซอร์ภายใน LINE/Facebook)" },
  { icon: "⬆️", title: "2. กดปุ่ม แชร์", text: "แตะไอคอน Share รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น ที่แถบเครื่องมือของ Safari" },
  { icon: "➕", title: "3. เลือก เพิ่มไปยังหน้าจอโฮม", text: "เลื่อนเมนูลง แล้วแตะ “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)" },
  { icon: "📱", title: "4. กด เพิ่ม", text: "ตรวจสอบชื่อ SIGN BUSINESS แล้วกด “เพิ่ม” มุมขวาบน" },
  { icon: "✅", title: "5. เปิดจากไอคอน SIGN BUSINESS", text: "หลังติดตั้ง ให้เปิดจากไอคอนบนหน้าจอโฮม ระบบจะแสดงเต็มจอเหมือนแอป" },
];

export default function InstallPage() {
  const router = useRouter();
  return (
    <main style={{minHeight:"100vh",background:"#f4f6f8",padding:"28px 16px 100px",fontFamily:"Arial, sans-serif",color:"#111827"}}>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <button onClick={()=>router.push("/")} style={{border:0,background:"transparent",fontSize:16,fontWeight:700,cursor:"pointer",padding:"8px 0 18px"}}>← กลับหน้าหลัก</button>
        <section style={{background:"#111827",color:"white",borderRadius:24,padding:"28px 24px",boxShadow:"0 14px 35px rgba(0,0,0,.12)"}}>
          <div style={{fontSize:50,marginBottom:10}}>📲</div>
          <h1 style={{fontSize:28,margin:"0 0 8px"}}>ติดตั้ง SIGN BUSINESS บน iPhone</h1>
          <p style={{margin:0,color:"#d1d5db",lineHeight:1.6}}>ไม่ต้องโหลดจาก App Store • ใช้งานจากหน้าจอโฮมได้เหมือนแอป • อัปเดตระบบให้อัตโนมัติ</p>
        </section>

        <div style={{display:"grid",gap:14,marginTop:20}}>
          {steps.map((s)=>(
            <section key={s.title} style={{display:"flex",gap:16,background:"white",borderRadius:18,padding:20,border:"1px solid #e5e7eb",boxShadow:"0 5px 18px rgba(0,0,0,.04)"}}>
              <div style={{fontSize:32,width:46,flex:"0 0 46px",textAlign:"center"}}>{s.icon}</div>
              <div><h2 style={{fontSize:18,margin:"2px 0 6px"}}>{s.title}</h2><p style={{margin:0,color:"#4b5563",lineHeight:1.65}}>{s.text}</p></div>
            </section>
          ))}
        </div>

        <section style={{marginTop:20,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:18,padding:20}}>
          <strong>สำคัญสำหรับพนักงาน</strong>
          <p style={{margin:"7px 0 0",lineHeight:1.6,color:"#7c2d12"}}>พนักงานแต่ละคนใช้บัญชีของตัวเองในการ Login หลังติดตั้ง ระบบจะแสดงเมนูตามสิทธิ์ที่เจ้าของกำหนด</p>
        </section>

        <button onClick={()=>window.location.href="/login"} style={{width:"100%",marginTop:20,border:0,borderRadius:16,padding:"16px 20px",background:"#db2777",color:"white",fontSize:17,fontWeight:800,cursor:"pointer"}}>เข้าสู่ระบบ SIGN BUSINESS</button>
      </div>
    </main>
  );
}
