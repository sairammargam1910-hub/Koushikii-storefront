import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ACL_METADATA_KEY = "custom:aclPolicy";

const storage = new Storage({
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

export async function requestSiteContentUploadUrl() {
  const assetId = randomUUID();
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

export async function getSiteContentAssetFile(assetId: string): Promise<File> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("Invalid site media ID.");
  const { bucketName, objectName } = parseStoragePath(
    `${privateObjectDirectory()}/uploads/${assetId}`,
  );
  return storage.bucket(bucketName).file(objectName);
}

export async function markSiteContentAssetPrivate(assetId: string, ownerId: string) {
  const file = await getSiteContentAssetFile(assetId);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The uploaded file has not finished uploading.");
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
