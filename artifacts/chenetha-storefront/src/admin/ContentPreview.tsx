import { useEffect, useRef, type MouseEvent } from "react";
import { Eye, X } from "lucide-react";
import type { ShopifyAdminProduct, SiteContentInput, SiteContentItem } from "@workspace/api-client-react";
import { DynamicHomeTiles, PublishedHero, Reviews } from "../storefront/Home";
import { VideoPostCard } from "../storefront/Videos";
import "./ContentAdmin.css";

type Placement = "fabric_tile" | "weave_tile";
type Draft = SiteContentInput & { placement: Placement | null };

function keepPreviewInWorkspace(event: MouseEvent<HTMLDivElement>) {
  const target = event.target;
  if (target instanceof Element && target.closest("a")) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function ContentPreview({
  draft,
  imageUrl,
  mediaUrl,
  product,
  onClose,
}: {
  draft: Draft;
  imageUrl?: string | null;
  mediaUrl?: string | null;
  product?: Pick<ShopifyAdminProduct, "title" | "handle">;
  onClose: () => void;
}) {
  const now = new Date().toISOString();
  const item = {
    ...draft,
    id: "merchant-content-preview",
    imageUrl: imageUrl ?? draft.imageUrl,
    mediaUrl: mediaUrl ?? draft.mediaUrl,
    createdAt: now,
    updatedAt: now,
  } as SiteContentItem & { placement: Placement | null };
  const placement: Placement = draft.placement || "fabric_tile";
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div
    className="content-preview-backdrop"
    role="presentation"
    onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <section className="content-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="content-preview-title">
      <header className="content-preview-header">
        <div>
          <span className="eyebrow">PRIVATE STOREFRONT PREVIEW</span>
          <h2 id="content-preview-title">{draft.title || "Untitled content"}</h2>
          <p>See this item in the storefront layout. Previewing does not save or publish your changes.</p>
        </div>
        <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close preview"><X size={18}/></button>
      </header>
      <div className="content-preview-render">
        <div className="content-preview-note"><Eye size={15}/> Private to this merchant workspace · publishing remains a separate action</div>
        <div className="kq content-preview-storefront" onClickCapture={keepPreviewInWorkspace}>
          {draft.kind === "hero_slide" && (item.imageUrl
            ? <PublishedHero slides={[item]}/>
            : <PreviewNeedsMedia>Upload an image to see the hero preview.</PreviewNeedsMedia>)}

          {draft.kind === "home_image" && <section className={`section ${placement === "fabric_tile" ? "home-fabric-section" : "home-weave-section"}`}>
            <div className="wrap">
               <div className="section-head"><div><span className="eyebrow">HOMEPAGE THUMBNAIL</span><h2>{placement === "fabric_tile" ? "Shop by Fabric" : "Shop by Collection"}</h2><p>{placement === "fabric_tile" ? "Find the cloth that feels like you." : "Browse published Shopify collections."}</p></div></div>
              {item.imageUrl
                ? <DynamicHomeTiles items={[item]} placement={placement}/>
                : <PreviewNeedsMedia>Upload an image to see this thumbnail.</PreviewNeedsMedia>}
            </div>
          </section>}

          {draft.kind === "customer_voice" && (item.body?.trim()
            ? <Reviews items={[item]}/>
            : <PreviewNeedsMedia>Add the exact customer-approved words to see the quote preview.</PreviewNeedsMedia>)}

          {draft.kind === "video_post" && <section className="video-feed-section">
            <div className="wrap">
              <div className="video-feed-head"><div><span className="eyebrow">{item.eyebrow || "THE VIDEO EDIT"}</span><h2>Look closer. Choose thoughtfully.</h2><p>See how this video post appears to shoppers.</p></div></div>
              {item.mediaUrl
                ? <div className="video-card-grid" role="list" aria-label="Video post preview"><VideoPostCard post={item} product={product} disableProductLink/></div>
                : <PreviewNeedsMedia>Upload an MP4 or WebM video to see the post preview.</PreviewNeedsMedia>}
            </div>
          </section>}
        </div>
      </div>
    </section>
  </div>;
}

function PreviewNeedsMedia({ children }: { children: string }) {
  return <div className="content-preview-needs-media" role="status">{children}</div>;
}
