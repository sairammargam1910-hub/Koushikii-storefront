import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clapperboard, Trash2, Upload } from "lucide-react";
import { Shell, products } from "./_shared";
import { formatVideoDuration, readVideoPosts, saveVideoPosts, subscribeVideoPosts, type VideoPost } from "./_video-demo";
import "./_video-commerce.css";

export function VideoAdmin() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState<VideoPost[]>(readVideoPosts);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState(products[0].id);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => subscribeVideoPosts(() => setPosts(readVideoPosts())), []);
  function selectFile(selected: File | undefined) {
    setError("");
    setStatus("");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(null);
    setVideoUrl("");
    setDuration(0);
    if (!selected) return;
    if (!selected.type.startsWith("video/")) {
      setError("Choose a video file. The selected file is not recognised as video.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const url = URL.createObjectURL(selected);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const length = Number.isFinite(probe.duration) ? probe.duration : 0;
      if (length > 60) {
        URL.revokeObjectURL(url);
        setError(`This clip is ${formatVideoDuration(length)} long. Choose a clip of 60 seconds or less.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (!length) {
        URL.revokeObjectURL(url);
        setError("The clip duration could not be read. Try another video file.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setFile(selected);
      setVideoUrl(url);
      setDuration(length);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("This video’s metadata could not be read. Try a different file format.");
      if (inputRef.current) inputRef.current.value = "";
    };
    probe.src = url;
  }

  function postVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!file || !videoUrl || !duration) {
      setError("Choose a readable video clip before posting.");
      return;
    }
    if (duration > 60) {
      setError("Clips must be 60 seconds or shorter.");
      return;
    }
    const product = products.find((item) => item.id === productId);
    if (!product) {
      setError("Choose one of the available sample products.");
      return;
    }
    const post: VideoPost = {
      id: `preview-${Date.now()}`,
      title: title.trim(),
      caption: caption.trim(),
      productId,
      duration,
      fileName: file.name,
      videoUrl,
      poster: product.image,
      createdAt: Date.now(),
    };
    const updated = [post, ...posts.filter((item) => !item.samplePoster)];
    if (!saveVideoPosts(updated)) {
      setError("This browser could not save the post. Check local storage settings and try again.");
      return;
    }
    setPosts(readVideoPosts());
    setStatus("Posted to this browser’s customer feed preview.");
    setTitle("");
    setCaption("");
    setFile(null);
    setVideoUrl("");
    setDuration(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePost(id: string) {
    const existing = posts.find((post) => post.id === id);
    const updated = posts.filter((post) => post.id !== id);
    if (!saveVideoPosts(updated)) {
      setError("Could not update this browser’s saved feed.");
      return;
    }
    if (existing?.videoUrl) URL.revokeObjectURL(existing.videoUrl);
    setPosts(updated);
    setStatus("Post removed from this browser preview.");
  }

  return <Shell>
    <main className="video-page">
      <section className="studio-intro">
        <div className="wrap">
          <span className="eyebrow">Chenetha · Internal studio</span>
          <h1>Video post studio</h1>
          <p>Prepare a short product-linked clip for the Shop via Video preview. Choose one catalogue item, read the clip details, and review the post before adding it to this browser’s feed.</p>
        </div>
      </section>
      <div className="wrap studio-wrap">
        <aside className="studio-notice">
          <AlertCircle size={18} aria-hidden="true"/>
          <div><strong>Browser-only design preview</strong>Posts save video metadata and a temporary object URL in this browser’s localStorage. Video bytes are not saved or uploaded, and the temporary preview URL may not work after this browser session. No connected upload service is active.</div>
        </aside>
        <div className="studio-layout">
          <section className="studio-panel" aria-labelledby="studio-compose-heading">
            <h2 id="studio-compose-heading">Prepare a post</h2>
            <p className="studio-panel-intro">One clip, one linked product. Maximum duration: 60 seconds.</p>
            <label className="studio-drop" htmlFor="studio-video-file">
              <span className="studio-drop-icon"><Upload size={19} aria-hidden="true"/></span>
              <span><strong>{file ? file.name : "Choose a local video file"}</strong><small>Video files only · Metadata read in your browser</small></span>
              <input ref={inputRef} id="studio-video-file" type="file" accept="video/*" aria-describedby="studio-file-help studio-file-error" onChange={(event) => selectFile(event.currentTarget.files?.[0])}/>
            </label>
            <small id="studio-file-help" className="studio-help">The file stays on this device; only its name, duration and temporary preview URL are saved.</small>
            <p id="studio-file-error" className="studio-error" role="alert">{error}</p>
            <div className="studio-meta"><span>Selected clip</span><strong>{duration ? formatVideoDuration(duration) : "—:—"}</strong></div>
            <div className="studio-preview">
              {videoUrl ? <video src={videoUrl} controls playsInline aria-label="Selected video clip preview"/> :
                <div className="studio-preview-placeholder"><div><Clapperboard size={26} aria-hidden="true"/><p>{file ? "Reading clip preview…" : "Your selected clip preview will appear here."}</p></div></div>}
            </div>
            <form className="studio-form" onSubmit={postVideo}>
              <div className="studio-field">
                <label htmlFor="studio-title">Short title</label>
                <input id="studio-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={64} required placeholder="A closer look at the border"/>
                <span className="studio-help">{title.length}/64 characters</span>
              </div>
              <div className="studio-field">
                <label htmlFor="studio-caption">Caption</label>
                <textarea id="studio-caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={180} placeholder="A few careful words about the piece…" />
                <span className="studio-help">{caption.length}/180 characters</span>
              </div>
              <div className="studio-field">
                <label htmlFor="studio-product">Linked product</label>
                <select id="studio-product" value={productId} onChange={(event) => setProductId(event.target.value)} required>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.weave}</option>)}
                </select>
              </div>
              <button className="studio-post-button" type="submit" disabled={!videoUrl || !title.trim()}><Check size={15} aria-hidden="true"/> Post to preview feed</button>
              <p className="studio-status" role="status" aria-live="polite">{status}</p>
            </form>
          </section>
          <section className="studio-panel" aria-labelledby="studio-feed-heading">
            <div className="studio-list-head"><div><span className="eyebrow">Browser feed</span><h2 id="studio-feed-heading">Recent posts</h2></div><span>{posts.length} {posts.length === 1 ? "item" : "items"}</span></div>
            {posts.length ? posts.map((post) => {
              const product = products.find((item) => item.id === post.productId);
              return <article className="studio-post-row" key={post.id}>
                <img src={post.poster || product?.image} alt={`${product?.name || "Product"} sample poster`} />
                <div><strong>{post.title}</strong><small>{product?.name || "Product unavailable"} · {post.samplePoster ? "Sample poster only" : `${formatVideoDuration(post.duration)} · ${post.fileName}`}</small></div>
                <button type="button" aria-label={`Remove ${post.title} from preview feed`} onClick={() => removePost(post.id)}><Trash2 size={15} aria-hidden="true"/></button>
              </article>;
            }) : <div className="studio-empty">No posts remain in this preview feed.</div>}
          </section>
        </div>
      </div>
    </main>
  </Shell>;
}
