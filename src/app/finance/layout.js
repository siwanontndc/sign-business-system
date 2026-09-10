import Link from "next/link";

export default function FinanceLayout({children}){
  return <>
    <nav style={{position:"sticky",top:0,zIndex:80,display:"flex",gap:8,alignItems:"center",padding:"10px 14px",background:"#111827",borderBottom:"1px solid #374151",overflowX:"auto"}}>
      <Link href="/finance" style={link}>การเงิน</Link>
      <Link href="/finance/line" style={link}>💬 บัญชีจาก LINE</Link>
      <Link href="/finance/reports" style={link}>📊 รายงาน</Link>
      <Link href="/finance/system-check" style={link}>🩺 ตรวจระบบ</Link>
      <Link href="/" style={{...link,marginLeft:"auto"}}>หน้าหลัก</Link>
    </nav>
    {children}
  </>;
}
const link={color:"white",textDecoration:"none",fontWeight:700,fontSize:14,whiteSpace:"nowrap",padding:"7px 10px",borderRadius:7,background:"rgba(255,255,255,.08)"};
