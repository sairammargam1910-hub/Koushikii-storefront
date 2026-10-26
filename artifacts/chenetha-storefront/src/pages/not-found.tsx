import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return <main className="kq" style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24}}>
    <section className="empty" style={{width:"min(100%,680px)"}} data-testid="state-not-found">
      <span className="eyebrow">A quiet detour</span>
      <h1 style={{fontSize:"clamp(48px,8vw,76px)",margin:"15px 0"}}>This path is not woven yet.</h1>
      <p>That page could not be found. Return to the collection or go back to the Chenetha home page.</p>
      <div className="actions" style={{justifyContent:"center",marginTop:20}}>
        <button className="btn outline" onClick={()=>setLocation("/")}><ArrowLeft size={14}/> Home</button>
        <Link className="btn" href="/Collections">Browse collections <ArrowRight size={14}/></Link>
      </div>
    </section>
  </main>;
}
