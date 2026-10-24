import { useEffect, useState } from "react";
import { ArrowRight, Play, ShoppingBag } from "lucide-react";
import { Shell, products, format, addItem, base } from "./_shared";
import { readVideoPosts, subscribeVideoPosts, type VideoPost } from "./_video-demo";
import "./_video-commerce.css";

export function Videos() {
  const [posts, setPosts] = useState<VideoPost[]>(readVideoPosts);
  const [addedId, setAddedId] = useState("");

  useEffect(() => subscribeVideoPosts(() => setPosts(readVideoPosts())), []);
  useEffect(() => {
    if (!addedId) return;
    const timer = window.setTimeout(() => setAddedId(""), 2200);
    return () => window.clearTimeout(timer);
  }, [addedId]);

  const ordered = [...posts].sort((a, b) => b.createdAt - a.createdAt);

  return <Shell>
    <main className="video-page">
      <section className="video-intro">
        <div className="wrap">
          <span className="eyebrow">Chenetha · Cloth, seen more closely</span>
          <h1>Shop via video</h1>
          <p>Small glimpses of colour, border and drape to help you find a piece worth exploring. Open any linked textile for its details.</p>
          <span className="video-ornament" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path d="M32 7 40 24 57 32 40 40 32 57 24 40 7 32 24 24 32 7Z"/><path d="m17 17 30 30M47 17 17 47M24 32h16M32 24v16"/></svg></span>
        </div>
      </section>
      <section className="video-feed-section">
        <div className="wrap">
          <div className="video-feed-head">
            <div><span className="eyebrow">The video edit</span><h2>Look closer. Choose thoughtfully.</h2><p>Each card is linked to a sample catalogue item.</p></div>
            <aside className="video-feed-note">Sample posters, not video clips. These existing product photographs are placeholders until real footage is supplied.</aside>
          </div>
          {ordered.length ? <div className="video-card-grid" role="list" aria-label="Shop via video product cards">
            {ordered.map((post) => {
              const product = products.find((item) => item.id === post.productId);
              if (!product) return null;
              return <article className="video-card" role="listitem" key={post.id}>
                {post.videoUrl ? <div className="video-poster">
                  <video src={post.videoUrl} controls playsInline preload="metadata" poster={post.poster || product.image} aria-label="Video preview"/>
                  <span className="video-poster-label">Browser preview clip</span>
                </div> : <a className="video-poster" href={base + "Product?id=" + product.id}>
                  <img src={post.poster || product.image} alt={product.name} loading="lazy"/>
                  <span className="video-poster-label">Sample poster · no clip</span>
                  <span className="video-play-mark" aria-hidden="true"><Play size={21} fill="currentColor"/></span>
                  <span className="video-duration">{post.samplePoster ? "Preview" : post.duration ? `${Math.floor(post.duration / 60)}:${String(post.duration % 60).padStart(2, "0")}` : "Preview"}</span>
                </a>}
                <div className="video-card-copy">
                  <h3>{post.title}</h3>
                  <p>{post.samplePoster ? <><span>Sample preview · </span><span>{product.weave}</span></> : post.caption || <><span>{product.weave}</span><span> · <span>A closer look at this sample piece</span></span></>}</p>
                  <div className="video-card-product">
                    <a href={base + "Product?id=" + product.id}>{product.name}</a>
                    <span className="price">{format(product.price)}</span>
                  </div>
                  <button type="button" className="video-shop-button" onClick={() => { addItem(product.id); setAddedId(post.id); }}>
                    <ShoppingBag size={14} aria-hidden="true"/> Shop this piece <ArrowRight size={13} aria-hidden="true"/>
                  </button>
                  <p className="video-added" role="status" aria-live="polite">{addedId === post.id ? "Added to your demo bag." : "\u00a0"}</p>
                </div>
              </article>;
            })}
          </div> : <div className="video-empty"><h3>No posts in this edit yet</h3><p>New studio posts will appear here in this browser preview.</p></div>}
        </div>
      </section>
    </main>
  </Shell>;
}
