import { useEffect, useRef, useState } from "react";
import type { ShopifyAdminImageResponse } from "@workspace/api-client-react";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ProductPhotoPicker({ existingImage, disabled, onImage, onUploading, onPending }: {
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
