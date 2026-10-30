import { ArrowRight, CircleAlert, Film } from "lucide-react";
import { useGetSiteContent, getGetSiteContentQueryKey } from "@workspace/api-client-react";
import { Shell, base } from "./_shared";
import { useShopifyCatalog } from "./ShopifyCatalog";
import "./_video-commerce.css";

export function Videos() {
  const content = useGetSiteContent({ query: { queryKey: getGetSiteContentQueryKey(), staleTime: 60_000 } });
  const catalog = useShopifyCatalog();
  const posts = (content.data?.items || []).filter(item => item.kind === "video_post" && item.published && item.mediaUrl).sort((a, b) => a.sortOrder - b.sortOrder);
  const products = catalog.data?.products || [];
  return <Shell>
    <main className="video-page">
      <section className="video-intro"><div className="wrap"><span className="eyebrow">Chenetha · Cloth, seen more closely</span><h1>Shop via video</h1><p>See the colour, border and movement of a weave in motion. Each post is shared directly by the Chenetha team.</p><span className="video-ornament" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path d="M32 7 40 24 57 32 40 40 32 57 24 40 7 32 24 24 32 7Z"/><path d="m17 17 30 30M47 17 17 47M24 32h16M32 24v16"/></svg></span></div></section>
      <section className="video-feed-section"><div className="wrap">
        <div className="video-feed-head"><div><span className="eyebrow">The video edit</span><h2>Look closer. Choose thoughtfully.</h2><p>Real clips and product links published by the store.</p></div></div>
        {content.isLoading ? <div className="video-empty" role="status"><span className="video-loading-lines"/><p>Loading published videos…</p></div> :
          content.isError ? <div className="video-empty" role="alert"><CircleAlert size={22}/><h3>Videos could not load</h3><p>{content.error instanceof Error ? content.error.message : "Please try again."}</p><button className="video-retry" onClick={() => void content.refetch()}>Try again</button></div> :
          posts.length ? <div className="video-card-grid" role="list" aria-label="Published video posts">{posts.map(post => {
            const product = post.linkedProductId ? products.find(item => item.id === post.linkedProductId) : undefined;
            return <article className="video-card" role="listitem" key={post.id}>
              <div className="video-poster"><video src={post.mediaUrl || undefined} controls playsInline preload="metadata" poster={post.imageUrl || undefined} aria-label={post.title}/></div>
              <div className="video-card-copy">{post.eyebrow && <span className="eyebrow">{post.eyebrow}</span>}<h3>{post.title}</h3>{post.body && <p>{post.body}</p>}
                {product && <div className="video-card-product"><a href={base + "Product?shopify=" + encodeURIComponent(product.handle)}>{product.title}</a><ArrowRight size={14}/></div>}
              </div>
            </article>;
          })}</div> :
          <div className="video-empty"><span className="video-empty-icon"><Film size={22}/></span><h3>No videos published yet</h3><p>New videos will appear here when the store publishes them.</p></div>}
        {catalog.isError && posts.some(post => post.linkedProductId) && <p className="video-product-note">Product details could not be loaded. Linked items will appear when the live Shopify catalog is available.</p>}
      </div></section>
    </main>
  </Shell>;
}
