import { ArrowRight, Trash2 } from "lucide-react";
import { Shell, PageHero, useStore, products, format, saveItems, Qty, moneySub, Empty, base } from "./_shared";

export function Cart() {
  const cart = useStore("kq-cart");
  const selected = products.filter(product => cart.some(item => item.id === product.id));
  const total = moneySub(cart);
  return <Shell><PageHero eyebrow="Your bag · Sample selection" title="A little goodness, gathered." subtitle="Review your saved catalogue pieces and prepare a direct enquiry to the brand."/>
    <main className="wrap content">
      {!cart.length ? <div data-testid="empty-cart"><Empty title="Your bag is taking a quiet moment." copy="Explore the collection and find a textile that feels like you."/><div style={{textAlign:"center",marginBottom:32}}><button className="btn" disabled data-testid="button-empty-cart-enquiry" style={{opacity:.5,cursor:"not-allowed"}}>Review WhatsApp enquiry <ArrowRight size={14}/></button><p className="muted">Add a piece to your bag before preparing an enquiry.</p></div></div> : <div className="two-col">
        <div><div className="row"><span className="eyebrow" data-testid="text-cart-item-count">Your pieces ({cart.reduce((sum,item)=>sum+item.qty,0)})</span><a className="link" href={base+"Collections"}>Continue exploring</a></div>
          {selected.map(product => {
            const row=cart.find(item=>item.id===product.id)!;
            return <article key={product.id} className="cartrow" data-testid={`row-cart-item-${product.id}`}>
              <a href={`${base}Product?id=${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`}><span className={`textile s${products.indexOf(product)%6+1}`} style={{display:"block",width:110,height:140,minHeight:140}} role="img" aria-label={`${product.name} — illustrative pattern`}/></a>
              <div><a href={`${base}Product?id=${encodeURIComponent(product.id)}`}><h3>{product.name}</h3></a><p className="muted">{product.type} · {product.weave}</p><Qty value={row.qty} onChange={qty=>saveItems("kq-cart",cart.map(item=>item.id===product.id?{...item,qty}:item))}/></div>
              <div style={{textAlign:"right"}}><b>{format(product.price*row.qty)}</b><br/><button className="link" style={{marginTop:20,border:0,background:"none"}} data-testid={`button-remove-cart-${product.id}`} onClick={()=>saveItems("kq-cart",cart.filter(item=>item.id!==product.id))}><Trash2 size={13}/> Remove</button></div>
            </article>;
          })}
        </div>
        <aside className="panel">
          <span className="eyebrow">Enquiry summary</span><h3 style={{margin:"10px 0 22px"}}>Your selected pieces</h3>
          <div className="row"><span>Sample catalogue subtotal</span><b data-testid="text-cart-subtotal">{format(total)}</b></div>
          <p className="muted">Shipping and taxes are not calculated. Availability and final prices must be confirmed by the brand.</p>
          <a className="btn" style={{width:"100%",marginTop:22}} href={base+"Checkout"} data-testid="link-review-whatsapp-enquiry">Review WhatsApp enquiry <ArrowRight size={14}/></a>
          <p className="muted" style={{fontSize:11}}>This is not a payable amount. Continuing opens an enquiry review, not a payment step.</p>
          <a className="link" href={base+"CustomerCare"}>Purchase & support notes →</a>
        </aside>
      </div>}
    </main>
  </Shell>;
}
