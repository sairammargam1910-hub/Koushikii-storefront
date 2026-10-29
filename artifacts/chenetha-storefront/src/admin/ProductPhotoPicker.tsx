import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShopifyAdminProductMediaQueryKey,
  getGetShopifyAdminProductsQueryKey,
  getGetShopifyProductsQueryKey,
  useDeleteShopifyAdminProductMedia,
  useGetShopifyAdminProductMedia,
  useReorderShopifyAdminProductMedia,
  useUpdateShopifyAdminProductMedia,
  type ShopifyAdminImageResponse,
  type ShopifyAdminProductMedia,
} from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, Check, CircleAlert, ImagePlus, LoaderCircle, Star, Trash2, Upload, X } from "lucide-react";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ProductPhotoPicker(props: {
  existingImage?: string | null;
  disabled: boolean;
  onImage: (url: string) => void;
  onUploading: (uploading: boolean) => void;
  onPending: (pending: boolean) => void;
  productId?: string;
}) {
  return props.productId
    ? <ProductGalleryManager productId={props.productId} disabled={props.disabled} onUploading={props.onUploading} onPending={props.onPending}/>
    : <NewProductPhotoPicker {...props}/>;
}

function NewProductPhotoPicker({ existingImage, disabled, onImage, onUploading, onPending }: {
  existingImage?: string | null;
  disabled: boolean;
  onImage: (url: string) => void;
  onUploading: (uploading: boolean) => void;
  onPending: (pending: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const request = useRef<XMLHttpRequest | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = (photo: File) => {
    setError("");
    setUploaded(false);
    onImage("");
    onPending(true);
    onUploading(true);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open("POST", `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/shopify/admin/images`);
    xhr.setRequestHeader("Content-Type", photo.type);
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100));
    };
    const finish = () => {
      request.current = null;
      setProgress(null);
      onUploading(false);
    };
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText) as Partial<ShopifyAdminImageResponse> & { error?: string };
        if (xhr.status !== 201 || !response.resourceUrl) throw new Error(response.error || "The upload failed. Please try again.");
        onImage(response.resourceUrl);
        onPending(false);
        setUploaded(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The upload failed. Please try again.");
      } finally { finish(); }
    };
    xhr.onerror = () => { setError("The connection was interrupted. Please retry the upload."); finish(); };
    xhr.ontimeout = () => { setError("The photo upload took too long. Please try again."); finish(); };
    xhr.onabort = () => { finish(); };
    xhr.send(photo);
  };
  const clear = () => {
    request.current?.abort();
    setFile(null);
    setError("");
    setUploaded(false);
    onImage("");
    onPending(false);
    if (picker.current) picker.current.value = "";
  };
  const uploading = progress !== null;
  return <div className="product-photo-picker">
    <b>Product photo</b>
    <p className="field-note">JPEG, PNG or WebP · Up to 10 MB and 25 megapixels. Choose from your phone’s photos or camera. HEIC photos must be exported as JPEG first.</p>
    {existingImage && <figure><img className="photo-preview" src={existingImage} alt="Current product photo"/><figcaption>Current photo — all existing images will be kept.</figcaption></figure>}
    <label>Choose a photo
      <input ref={picker} type="file" accept={ACCEPT} disabled={disabled || uploading}
        data-testid="input-product-photo" onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          if (!ACCEPT.split(",").includes(selected.type) || !selected.size || selected.size > MAX_BYTES) {
            setError("Choose a non-empty JPEG, PNG, or WebP photo no larger than 10 MB.");
            event.target.value = "";
            return;
          }
          setFile(selected);
          upload(selected);
        }}/>
    </label>
    {preview && <figure><img className="photo-preview" src={preview} alt="Selected new product photo"/><figcaption>{file?.name}</figcaption></figure>}
    {uploading && <div role="status" aria-live="polite">
      <progress max={100} value={progress ?? 0} aria-label="Photo upload progress"/>
      <p>{progress === 100 ? "Uploading to Shopify… please keep this form open." : `Sending photo… ${progress}%`}</p>
    </div>}
    {uploaded && <p role="status" className="field-note">Photo uploaded. Save the product to add it. Existing images will not be replaced.</p>}
    {error && <p className="form-error" role="alert" data-testid="text-photo-upload-error">{error}{file && !uploaded ? " Retry or remove this photo before saving." : ""}</p>}
    {file && <div className="photo-actions">
      {!uploaded && !uploading && <button type="button" className="button button-quiet" disabled={disabled} onClick={() => upload(file)} data-testid="button-retry-photo">Retry upload</button>}
      <button type="button" className="button button-quiet" disabled={disabled} onClick={clear} data-testid="button-remove-photo">{uploading ? "Cancel upload" : "Remove selected photo"}</button>
    </div>}
  </div>;
}

function ProductGalleryManager({ productId, disabled, onUploading, onPending }: {
  productId: string;
  disabled: boolean;
  onUploading: (uploading: boolean) => void;
  onPending: (pending: boolean) => void;
}) {
  const gallery = useGetShopifyAdminProductMedia(productId, {
    query: { queryKey: getGetShopifyAdminProductMediaQueryKey(productId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const addOrReplace = useUpdateShopifyAdminProductMedia();
  const reorder = useReorderShopifyAdminProductMedia();
  const remove = useDeleteShopifyAdminProductMedia();
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement | null>(null);
  const replaceId = useRef<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const items = gallery.data?.media ?? [];
  const busy = disabled || uploading || addOrReplace.isPending || reorder.isPending || remove.isPending;
  const featuredId = items.find((item) => item.id === gallery.data?.featuredMediaId && item.mediaContentType === "IMAGE")?.id ?? null;
  useEffect(() => {
    onUploading(busy);
    onPending(busy);
  }, [busy, onPending, onUploading]);
  const refreshGallery = () => {
    void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductMediaQueryKey(productId) });
    void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() });
  };
  const upload = (photo: File) => {
    setError("");
    setNotice("");
    setUploading(true);
    setUploadProgress(0);
    const replacingId = replaceId.current;
    replaceId.current = undefined;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/shopify/admin/images`);
    xhr.setRequestHeader("Content-Type", photo.type);
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100));
    };
    const finish = () => {
      setUploading(false);
      setUploadProgress(0);
      if (picker.current) picker.current.value = "";
    };
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText) as Partial<ShopifyAdminImageResponse> & { error?: string };
        if (xhr.status !== 201 || !response.resourceUrl) {
          throw new Error(response.error || "The upload failed. Please try again.");
        }
        if (replacingId && !window.confirm("Replace this image? The new photo will be added first, and only this selected image will then be removed.")) {
          setNotice("Replacement cancelled. Your current gallery is unchanged.");
          return;
        }
        addOrReplace.mutate({
          productId,
          data: { resourceUrl: response.resourceUrl, ...(replacingId ? { replaceMediaId: replacingId } : {}) },
        }, {
          onSuccess: (data) => {
            refreshGallery();
            if (data.replacementStatus === "PROCESSING") {
              setNotice("The new photo is processing. The previous image was kept; remove it after the replacement is ready.");
            } else if (data.replacementStatus === "FAILED") {
              setError("Shopify could not process the replacement. The previous image was kept.");
            } else {
              setNotice(replacingId ? "The selected image was replaced." : "Photo added to the gallery.");
            }
          },
          onError: (reason: Error) => {
            refreshGallery();
            setError(reason.message || "Shopify could not update the gallery. Refresh and try again.");
          },
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The upload failed. Please try again.");
      } finally {
        finish();
      }
    };
    xhr.onerror = () => { setError("The connection was interrupted. Please retry the upload."); finish(); };
    xhr.ontimeout = () => { setError("The photo upload took too long. Please try again."); finish(); };
    xhr.send(photo);
  };
  const openPicker = (targetId?: string) => {
    if (busy || !picker.current) return;
    replaceId.current = targetId;
    picker.current.click();
  };
  const changeOrder = (index: number, destination: number) => {
    if (destination < 0 || destination >= items.length || busy) return;
    const mediaIds = items.map((item) => item.id);
    const [moved] = mediaIds.splice(index, 1);
    mediaIds.splice(destination, 0, moved);
    setError("");
    setNotice("");
    reorder.mutate({ productId, data: { mediaIds } }, {
      onSuccess: () => { refreshGallery(); setNotice("Gallery order saved."); },
      onError: (reason: Error) => { refreshGallery(); setError(reason.message || "Could not reorder the gallery."); },
    });
  };
  const removeItem = (item: ShopifyAdminProductMedia) => {
    if (!window.confirm(`Remove this ${item.mediaContentType === "IMAGE" ? "image" : "media item"} from the product gallery? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    remove.mutate({ productId, mediaId: item.id }, {
      onSuccess: () => { refreshGallery(); setNotice("The selected media was removed."); },
      onError: (reason: Error) => { refreshGallery(); setError(reason.message || "Could not remove this media."); },
    });
  };
  const readableStatus = (status: ShopifyAdminProductMedia["status"]) =>
    status === "READY" ? "Ready" : status === "FAILED" ? "Failed" : status === "PROCESSING" ? "Processing" : "Uploaded";

  return <section className="product-gallery" aria-labelledby="product-gallery-title" data-testid="product-gallery-manager">
    <div className="gallery-heading">
      <div><b id="product-gallery-title">Product photo gallery</b><p className="field-note">Reorder photos to change the featured image. Other media stays in the gallery.</p></div>
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => openPicker()} data-testid="button-add-gallery-photo"><ImagePlus size={15}/> Add photo</button>
    </div>
    <input ref={picker} type="file" accept={ACCEPT} className="gallery-file-input" aria-label="Choose a product gallery photo" disabled={busy}
      onChange={(event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!ACCEPT.split(",").includes(selected.type) || !selected.size || selected.size > MAX_BYTES) {
          setError("Choose a non-empty JPEG, PNG, or WebP photo no larger than 10 MB.");
          event.target.value = "";
          return;
        }
        upload(selected);
      }}/>
    {uploading && <div className="gallery-uploading" role="status"><progress max={100} value={uploadProgress} aria-label="Photo upload progress"/><span>Uploading photo… {uploadProgress}%</span></div>}
    {gallery.isLoading ? <div className="gallery-state" role="status"><LoaderCircle className="spin" size={17}/> Loading every product photo…</div>
      : gallery.isError ? <div className="gallery-state gallery-error" role="alert"><CircleAlert size={17}/><span>{gallery.error instanceof Error ? gallery.error.message : "Could not load the product gallery."}</span><button type="button" className="text-button" onClick={() => void gallery.refetch()}>Try again</button></div>
      : items.length === 0 ? <div className="gallery-empty"><ImagePlus size={20}/><span>No photos yet. Add a photo to start this gallery.</span></div>
      : <ol className="gallery-list">
        {items.map((item, index) => <li className="gallery-item" key={item.id} data-testid={`gallery-item-${index}`}>
          <div className="gallery-thumb">{item.imageUrl ? <img src={item.imageUrl} alt={item.alt || "Product gallery image"}/> : <span><ImagePlus size={20}/>{item.mediaContentType.replaceAll("_", " ")}</span>}</div>
          <div className="gallery-item-info">
            <div className="gallery-item-label">
              <b>{item.mediaContentType === "IMAGE" ? item.alt || `Photo ${index + 1}` : item.mediaContentType.replaceAll("_", " ")}</b>
              {item.id === featuredId && <span className="gallery-featured"><Star size={12} fill="currentColor"/> Featured</span>}
            </div>
            <span className={`gallery-status gallery-status-${item.status.toLowerCase()}`}>{readableStatus(item.status)}</span>
            {item.errors.map((mediaError, errorIndex) => <span className="gallery-media-error" key={`${mediaError.code}-${errorIndex}`}>{mediaError.message}{mediaError.details ? ` — ${mediaError.details}` : ""}</span>)}
          </div>
          <div className="gallery-item-actions">
            <button type="button" className="icon-button" aria-label={`Move item ${index + 1} up`} title="Move up" disabled={busy || index === 0} onClick={() => changeOrder(index, index - 1)} data-testid={`button-gallery-up-${index}`}><ArrowUp size={15}/></button>
            <button type="button" className="icon-button" aria-label={`Move item ${index + 1} down`} title="Move down" disabled={busy || index === items.length - 1} onClick={() => changeOrder(index, index + 1)} data-testid={`button-gallery-down-${index}`}><ArrowDown size={15}/></button>
            {item.mediaContentType === "IMAGE" && item.id !== featuredId && <button type="button" className="text-button" disabled={busy} onClick={() => changeOrder(index, 0)} data-testid={`button-gallery-feature-${index}`}><Star size={13}/> Feature</button>}
            {item.mediaContentType === "IMAGE" && <button type="button" className="text-button" disabled={busy} onClick={() => openPicker(item.id)} data-testid={`button-gallery-replace-${index}`}><Upload size={13}/> Replace</button>}
            <button type="button" className="icon-button danger-text" aria-label={`Remove item ${index + 1}`} title="Remove" disabled={busy} onClick={() => removeItem(item)} data-testid={`button-gallery-remove-${index}`}><Trash2 size={15}/></button>
          </div>
        </li>)}
      </ol>}
    {error && <p className="form-error gallery-message" role="alert" data-testid="text-gallery-error"><CircleAlert size={15}/>{error}</p>}
    {notice && <p className="gallery-message gallery-success" role="status"><Check size={15}/>{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14}/></button></p>}
  </section>;
}
