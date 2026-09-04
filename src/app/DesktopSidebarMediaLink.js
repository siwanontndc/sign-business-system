"use client";
import { useEffect,useState } from "react"; import { usePathname,useRouter } from "next/navigation"; import { supabase } from "./lib/supabase";
const allowedRoles=["owner","staff","production"];
export default function DesktopSidebarMediaLink(){const pathname=usePathname(),router=useRouter();const[role,setRole]=useState(null),[desktop,setDesktop]=useState(false);
useEffect(()=>{const media=window.matchMedia("(min-width: 900px)"),sync=()=>setDesktop(media.matches);sync();media.addEventListener?.("change",sync);return()=>media.removeEventListener?.("change",sync)},[]);
useEffect(()=>{let active=true;(async()=>{const{data:{user}}=await supabase.auth.getUser();if(!user||!active)return;const{data}=await supabase.rpc("current_user_role");if(active)setRole(data?String(data).trim().toLowerCase():null)})();return()=>{active=false}},[]);
if(!desktop||pathname!=="/")return null;const base={position:"fixed",left:18,width:216,zIndex:120,border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"12px 14px",textAlign:"left",background:"#1f2937",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 6px 18px rgba(0,0,0,.18)"};
return <>{allowedRoles.includes(role)&&<button type="button" onClick={()=>router.push("/job-media")} style={{...base,bottom:74}}>📷 ส่งแบบ / รูปหน้างาน</button>}{role==="owner"&&<button type="button" onClick={()=>router.push("/employees")} style={{...base,bottom:126,background:"#111827"}}>👥 จัดการพนักงาน</button>}</>}
