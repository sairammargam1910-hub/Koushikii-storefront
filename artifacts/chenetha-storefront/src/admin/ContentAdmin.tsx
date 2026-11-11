import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Eye, Film, ImagePlus, MessageSquareQuote, Pencil, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  getGetAdminSiteContentQueryKey, getGetSiteContentQueryKey,
  useCreateSiteContent, useDeleteSiteContent, useGetAdminSiteContent,
  useRequestSiteContentUpload, useUpdateSiteContent, useGetShopifyAdminProducts,
  type SiteContentInput, type SiteContentItem,
} from "@workspace/api-client-react";
import { AdminLayout } from "./Admin";
import { ContentPreview } from "./ContentPreview";
import "./ContentAdmin.css";

type Kind = SiteContentInput["kind"];
type Placement = "fabric_tile" | "weave_tile";
type Draft = SiteContentInput & { placement: Placement | null };
const emptyDraft = (kind: Kind = "hero_slide"): Draft => ({
  kind, title: "", eyebrow: null, body: null, imageUrl: null, mediaUrl: null,
  altText: null, ctaLabel: null, ctaUrl: null, linkedProductId: null,
  placement: null, sortOrder: 0, published: false, approved: false,
});
const labels: Record<Kind, string> = { hero_slide: "Hero slides", home_image: "Home thumbnails", customer_voice: "Customer voices", video_post: "Video posts" };
const acceptedImage = ["image/jpeg", "image/png", "image/webp"];
const acceptedVideo = ["video/mp4", "video/webm"];
const readable = (error: unknown) => error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]*:\s*/, "") : "Please try again.";

function uploadFile(file: File, uploadUrl: string, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status}).`));
    request.onerror = () => reject(new Error("Upload interrupted. Please try again."));
    request.send(file);
  });
}

function ContentEditor({ item, kind, onClose }: { item?: SiteContentItem; kind: Kind; onClose: () => void }) {
  const client = useQueryClient();
  const create = useCreateSiteContent();
  const update = useUpdateSiteContent();
  const requestUpload = useRequestSiteContentUpload();
  const shopify = useGetShopifyAdminProducts();
  const [draft, setDraft] = useState<Draft>(item ? {
    kind: item.kind, title: item.title, eyebrow: item.eyebrow, body: item.body,
    imageUrl: item.imageUrl, mediaUrl: item.mediaUrl, altText: item.altText,
    ctaLabel: item.ctaLabel, ctaUrl: item.ctaUrl, linkedProductId: item.linkedProductId,
    placement: (item as SiteContentItem & { placement?: Placement | null }).placement || null,
    sortOrder: item.sortOrder, published: item.published, approved: item.approved,
  } : emptyDraft(kind));
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [previews, setPreviews] = useState<{ imageUrl?: string; mediaUrl?: string }>({});
  const localPreviewUrls = useRef<string[]>([]);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const hadPreviewOpen = useRef(false);
  const busy = create.isPending || update.isPending || requestUpload.isPending || !!progress;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  useEffect(() => () => localPreviewUrls.current.forEach(URL.revokeObjectURL), []);
  useEffect(() => {
    if (previewOpen) {
      hadPreviewOpen.current = true;
      return;
    }
    if (hadPreviewOpen.current) {
      previewTriggerRef.current?.focus();
      hadPreviewOpen.current = false;
    }
  }, [previewOpen]);
  const upload = async (file: File, field: "imageUrl" | "mediaUrl") => {
    const isVideo = field === "mediaUrl";
    const validTypes = isVideo ? acceptedVideo : acceptedImage;
    const max = isVideo ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!validTypes.includes(file.type) || file.size > max) {
      setError(isVideo ? "Choose an MP4 or WebM video up to 200 MB." : "Choose a JPEG, PNG or WebP image up to 10 MB.");
      return;
    }
    setError("");
    setProgress({ label: `Preparing ${file.name}`, value: 0 });
    try {
      const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" } });
      setProgress({ label: `Uploading ${file.name}`, value: 0 });
      await uploadFile(file, signed.uploadUrl, value => setProgress({ label: `Uploading ${file.name}`, value }));
      const localPreview = URL.createObjectURL(file);
      localPreviewUrls.current.push(localPreview);
      setPreviews(current => ({ ...current, [field]: localPreview }));
      set(field, signed.assetUrl);
      setProgress(null);
    } catch (cause) {
      setProgress(null);
      setError(readable(cause));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if ((kind === "hero_slide" || kind === "home_image") && !draft.imageUrl) return setError("Upload an image before saving.");
    if (kind === "home_image" && !draft.placement) return setError("Choose a homepage placement for this image.");
    if (kind === "video_post" && !draft.mediaUrl) return setError("Upload an MP4 or WebM video before saving.");
    if (kind === "customer_voice" && draft.published && !draft.approved) return setError("Approve the exact supplied quote before publishing it.");
    if (kind === "customer_voice" && !draft.body?.trim()) return setError("Enter the exact customer-supplied quote.");
    const payload = { ...draft, title: draft.title.trim(), body: draft.body?.trim() || null };
    const options = {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetAdminSiteContentQueryKey() });
        void client.invalidateQueries({ queryKey: getGetSiteContentQueryKey() });
        onClose();
      },
      onError: (cause: Error) => setError(readable(cause)),
    };
    if (item) update.mutate({ id: item.id, data: payload }, options);
    else create.mutate({ data: payload }, options);
  };
  return <>
   <div className="modal-backdrop content-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="admin-modal content-editor" role="dialog" aria-modal="true" aria-hidden={previewOpen} aria-labelledby="content-editor-title">
      <header className="modal-head"><div><span className="eyebrow">STOREFRONT CONTENT</span><h2 id="content-editor-title">{item ? "Edit" : "Add"} {labels[kind].replace(/s$/, "").toLowerCase()}</h2></div><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Close"><X size={18}/></button></header>
      <form className="admin-form" onSubmit={submit}>
        <label>Title<input required maxLength={180} value={draft.title} onChange={event => set("title", event.target.value)} placeholder="A clear working title"/></label>
        {(kind === "hero_slide" || kind === "video_post") && <label>Eyebrow <span className="label-hint">Optional</span><input maxLength={120} value={draft.eyebrow || ""} onChange={event => set("eyebrow", event.target.value || null)} placeholder="A short introduction"/></label>}
        {kind !== "customer_voice" && kind !== "home_image" && <label>{kind === "video_post" ? "Caption" : "Supporting copy"}<textarea rows={3} maxLength={3000} value={draft.body || ""} onChange={event => set("body", event.target.value || null)} placeholder="Optional supporting text"/></label>}
        {kind === "customer_voice" && <label>Exact customer-supplied quote<textarea required rows={5} maxLength={3000} value={draft.body || ""} onChange={event => set("body", event.target.value || null)} placeholder="Paste the approved quote exactly as supplied"/></label>}
        {kind === "home_image" && <label>Homepage placement<select required value={draft.placement || ""} onChange={event => set("placement", (event.target.value || null) as Placement | null)}><option value="">Choose where this thumbnail appears</option><option value="fabric_tile">Shop by Fabric</option><option value="weave_tile">Shop by Collection</option></select><span className="field-note">A tile appears only when its title matches a published Shopify fabric or collection. The link always uses Shopify data.</span></label>}
        {kind !== "video_post" ? <MediaField label="Image" url={previews.imageUrl || draft.imageUrl} required={kind === "hero_slide" || kind === "home_image"} accept="image/jpeg,image/png,image/webp" onFile={file => void upload(file, "imageUrl")} onUrl={url => { set("imageUrl", url || null); if (!url) setPreviews(current => ({ ...current, imageUrl: undefined })); }}/> :
          <><MediaField label="Video file" url={previews.mediaUrl || draft.mediaUrl} required accept="video/mp4,video/webm" video onFile={file => void upload(file, "mediaUrl")} onUrl={url => { set("mediaUrl", url || null); if (!url) setPreviews(current => ({ ...current, mediaUrl: undefined })); }}/><MediaField label="Poster image" url={previews.imageUrl || draft.imageUrl} accept="image/jpeg,image/png,image/webp" onFile={file => void upload(file, "imageUrl")} onUrl={url => { set("imageUrl", url || null); if (!url) setPreviews(current => ({ ...current, imageUrl: undefined })); }}/></>}
        {(kind === "hero_slide" || kind === "home_image") && <label>Image description <span className="label-hint">For accessibility</span><input maxLength={500} value={draft.altText || ""} onChange={event => set("altText", event.target.value || null)} placeholder="Describe the image"/></label>}
        {kind === "hero_slide" && <div className="form-row"><label>Button label<input maxLength={80} value={draft.ctaLabel || ""} onChange={event => set("ctaLabel", event.target.value || null)} placeholder="Explore the collection"/></label><label>Button destination<input maxLength={2048} value={draft.ctaUrl || ""} onChange={event => set("ctaUrl", event.target.value || null)} placeholder="/Collections"/></label></div>}
        {kind === "video_post" && <label>Link to a live Shopify product <span className="label-hint">Optional</span><select value={draft.linkedProductId || ""} onChange={event => set("linkedProductId", event.target.value || null)}><option value="">No linked product</option>{(shopify.data?.products || []).filter(product => product.status === "ACTIVE").map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>}
        {kind === "customer_voice" && <label className="check-line"><input type="checkbox" checked={draft.approved} onChange={event => set("approved", event.target.checked)}/><span><b>Quote approved for publication</b><small>Only publish the exact quote supplied and approved by the customer.</small></span></label>}
        <div className="form-row"><label>Display order<input type="number" min="0" max="10000" value={draft.sortOrder} onChange={event => set("sortOrder", Number(event.target.value))}/></label><label className="check-line content-publish"><input type="checkbox" checked={draft.published} onChange={event => set("published", event.target.checked)}/><span><b>Publish</b><small>Visible on the public storefront.</small></span></label></div>
        {progress && <div className="content-upload-progress" role="status"><span>{progress.label}</span><progress max="100" value={progress.value}/><b>{progress.value}%</b></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
         <div className="modal-actions content-editor-actions"><button ref={previewTriggerRef} className="button button-quiet" type="button" disabled={busy} onClick={() => setPreviewOpen(true)}><Eye size={15}/> Preview</button><span className="content-editor-actions-spacer"/><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || !draft.title.trim()}>{busy ? "Working…" : item ? "Save changes" : "Save content"}</button></div>
      </form>
    </section>
   </div>
   {previewOpen && <ContentPreview
     draft={draft}
     imageUrl={previews.imageUrl || draft.imageUrl}
     mediaUrl={previews.mediaUrl || draft.mediaUrl}
     product={shopify.data?.products.find(product => product.id === draft.linkedProductId)}
     onClose={() => setPreviewOpen(false)}
   />}
  </>;
}

function MediaField({ label, url, required, accept, video, onFile, onUrl }: { label: string; url: string | null | undefined; required?: boolean; accept: string; video?: boolean; onFile: (file: File) => void; onUrl: (url: string) => void }) {
  return <div className="content-media-field">
    <div className="content-media-head"><b>{label}{required ? " · required" : ""}</b>{url && <button className="text-button danger-text" type="button" onClick={() => onUrl("")}>Remove asset</button>}</div>
    {url && (video ? <video src={url} controls preload="metadata"/> : <img src={url} alt="Selected content preview"/>)}
    <label className="content-file-button"><Upload size={15}/> Upload {video ? "video" : "image"}<input type="file" accept={accept} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }}/></label>
    <p className="field-note">{video ? "MP4 or WebM · up to 200 MB" : "JPEG, PNG or WebP · up to 10 MB"}</p>
  </div>;
}

export function AdminContent() {
  const content = useGetAdminSiteContent({ query: { queryKey: getGetAdminSiteContentQueryKey(), staleTime: 0, refetchOnMount: "always" } });
  const remove = useDeleteSiteContent();
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>("hero_slide");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SiteContentItem | null>(null);
  const [notice, setNotice] = useState("");
  const items = useMemo(() => (content.data?.items || []).filter(item => item.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder), [content.data?.items, kind]);
  const createKind = (value: Kind) => { setKind(value); setCreating(true); };
  const deleteItem = (item: SiteContentItem) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setNotice("");
    remove.mutate({ id: item.id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetAdminSiteContentQueryKey() }); void client.invalidateQueries({ queryKey: getGetSiteContentQueryKey() }); setNotice("Content removed."); }, onError: error => setNotice(readable(error)) });
  };
  const icon = kind === "hero_slide" ? <ImagePlus size={19}/> : kind === "home_image" ? <ImagePlus size={19}/> : kind === "customer_voice" ? <MessageSquareQuote size={19}/> : <Film size={19}/>;
  return <AdminLayout title="Storefront content" eyebrow="THE PUBLIC STOREFRONT" action={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16}/> Add {labels[kind].replace(/s$/, "").toLowerCase()}</button>}>
    <div className="content-intro"><div className="content-intro-mark">{icon}</div><div><b>Shape what shoppers see.</b><p>Manage the published stories, images and video across the storefront. Drafts remain private to this workroom.</p></div></div>
    <div className="content-tabs" role="tablist" aria-label="Content type">{(Object.keys(labels) as Kind[]).map(value => <button key={value} role="tab" aria-selected={kind === value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{labels[value]}<span>{content.data?.items.filter(item => item.kind === value).length ?? "—"}</span></button>)}</div>
    {notice && <div className="inline-notice notice-error" role="status"><CircleAlert size={16}/>{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {content.isLoading ? <div className="content-skeleton" aria-label="Loading content"><span/><span/><span/></div> : content.isError ? <div className="content-empty"><CircleAlert size={22}/><h2>Content could not load</h2><p>{readable(content.error)}</p><button className="button button-quiet" onClick={() => void content.refetch()}><RefreshCw size={15}/> Try again</button></div> :
      items.length ? <div className="content-item-list">{items.map(item => <article className="content-row" key={item.id}>
        <div className="content-preview">{item.kind === "video_post" ? item.imageUrl ? <img src={item.imageUrl} alt=""/> : <Film size={22}/> : item.imageUrl ? <img src={item.imageUrl} alt=""/> : <MessageSquareQuote size={22}/>}</div>
        <div className="content-row-copy"><span className="eyebrow">{item.kind === "home_image" ? ((item as SiteContentItem & {placement?: Placement|null}).placement === "fabric_tile" ? "Shop by Fabric" : "Shop by Collection") : item.eyebrow || labels[item.kind]}</span><h2>{item.title}</h2><p>{item.kind === "customer_voice" ? item.body : item.kind === "video_post" ? item.body || "Video post" : item.altText || item.body || "No additional copy"}</p></div>
        <div className="content-row-state"><span className={`status-pill ${item.published ? "status-active" : "status-draft"}`}>{item.published ? "Published" : "Draft"}</span>{item.kind === "customer_voice" && <span className={`status-pill ${item.approved ? "status-active" : "status-draft"}`}>{item.approved ? "Approved" : "Needs approval"}</span>}</div>
        <div className="content-row-actions"><button className="text-button" onClick={() => setEditing(item)}><Pencil size={14}/> Edit</button><button className="text-button danger-text" disabled={remove.isPending} onClick={() => deleteItem(item)}><Trash2 size={14}/> Delete</button></div>
      </article>)}</div> : <div className="content-empty">{icon}<h2>No {labels[kind].toLowerCase()} yet</h2><p>Add a real piece of storefront content when it is ready. Nothing is shown publicly until it is published.</p><button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16}/> Add {labels[kind].replace(/s$/, "").toLowerCase()}</button></div>}
    {(creating || editing) && <ContentEditor key={editing?.id || kind} item={editing || undefined} kind={editing?.kind || kind} onClose={() => { setCreating(false); setEditing(null); }}/>}
  </AdminLayout>;
}
