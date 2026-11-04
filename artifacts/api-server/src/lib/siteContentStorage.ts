import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";
import { r2File, R2AssetFile, r2UploadUrl } from "./r2SiteMedia";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ACL_METADATA_KEY = "custom:aclPolicy";

let storage: Storage | undefined;
function replitStorage() {
  return storage ??= new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
  });
}

function usesR2() {
  const provider = process.env.SITE_MEDIA_STORAGE || "replit";
  if (provider !== "replit" && provider !== "r2") throw new Error("Invalid SITE_MEDIA_STORAGE.");
  return provider === "r2";
}

function privateObjectDirectory() {
  const path = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!path) throw new Error("Private App Storage is not configured.");
  return path.replace(/\/+$/, "");
}

function parseStoragePath(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  const bucketName = parts.shift();
  if (!bucketName || parts.length === 0) throw new Error("Invalid App Storage path.");
  return { bucketName, objectName: parts.join("/") };
}

function assetIdFromPath(assetPath: string) {
  const match = /^\/api\/site-content\/media\/([0-9a-f-]{36})$/i.exec(assetPath);
  return match?.[1];
}

export function siteContentAssetUrl(assetId: string) {
  return `/api/site-content/media/${assetId}`;
}

export async function requestSiteContentUploadUrl(contentType?: string, size?: number) {
  const assetId = randomUUID();
  if (usesR2()) {
    return {
      uploadUrl: await r2UploadUrl(assetId, contentType, size),
      objectPath: `/objects/uploads/${assetId}`,
      assetUrl: siteContentAssetUrl(assetId),
    };
  }
  const fullPath = `${privateObjectDirectory()}/uploads/${assetId}`;
  const { bucketName, objectName } = parseStoragePath(fullPath);
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Could not create upload URL (${response.status}).`);
  }
  const result = await response.json() as { signed_url?: string };
  if (!result.signed_url) throw new Error("App Storage did not return an upload URL.");
  return {
    uploadUrl: result.signed_url,
    objectPath: `/objects/uploads/${assetId}`,
    assetUrl: siteContentAssetUrl(assetId),
  };
}

export function siteContentAssetIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  return assetIdFromPath(value);
}

export async function getSiteContentAssetFile(assetId: string): Promise<File | R2AssetFile> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("Invalid site media ID.");
  if (usesR2()) return r2File(assetId);
  const { bucketName, objectName } = parseStoragePath(
    `${privateObjectDirectory()}/uploads/${assetId}`,
  );
  return replitStorage().bucket(bucketName).file(objectName);
}

export async function markSiteContentAssetPrivate(assetId: string, ownerId: string) {
  const file = await getSiteContentAssetFile(assetId);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The uploaded file has not finished uploading.");
  if (file instanceof R2AssetFile) {
    await file.markPrivate(ownerId);
    return file;
  }
  await file.setMetadata({
    metadata: {
      [ACL_METADATA_KEY]: JSON.stringify({ owner: ownerId, visibility: "private" }),
    },
  });
  return file;
}

export async function deleteSiteContentAsset(assetId: string) {
  const file = await getSiteContentAssetFile(assetId);
  await file.delete({ ignoreNotFound: true });
}
