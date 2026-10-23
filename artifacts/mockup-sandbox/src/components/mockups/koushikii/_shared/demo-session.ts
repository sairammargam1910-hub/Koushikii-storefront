import { useEffect, useState } from "react";

const sessionKey="kq-demo-session";
export function startDemoSession(){localStorage.setItem(sessionKey,"active");window.dispatchEvent(new Event("kq-session"))}
export function endDemoSession(){localStorage.removeItem(sessionKey);window.dispatchEvent(new Event("kq-session"))}
export function useDemoSession(){
 const [active,setActive]=useState(()=>localStorage.getItem(sessionKey)==="active");
 useEffect(()=>{const sync=()=>setActive(localStorage.getItem(sessionKey)==="active");window.addEventListener("storage",sync);window.addEventListener("kq-session",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("kq-session",sync)}},[]);
 return active;
}
