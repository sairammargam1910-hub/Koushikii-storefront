import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { assertNoUserErrors, ShopifyAdminError, ShopifyInputError, shopifyAdminRequest } from "./shopifyAdminClient";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp",
};

// Decode and re-encode before forwarding: reject disguised/corrupt files,
// bound decompressed dimensions, and remove private EXIF/GPS metadata.
export async function prepareProductImage(bytes: Buffer, mimeType: string) {
  if (!formats[mimeType]) throw new ShopifyInputError("Choose a JPEG, PNG, or WebP photo.");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new ShopifyInputError("Choose a non-empty photo no larger than 10 MB.");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== formats[mimeType] || (metadata.pages ?? 1) !== 1) {
      throw new Error("Unsupported image format");
    }
    const cleaned = await image.rotate().toBuffer();
    if (cleaned.length > MAX_IMAGE_BYTES) throw new Error("Image too large after processing");
    return cleaned;
  } catch {
    throw new ShopifyInputError("This photo cannot be read. Choose a still JPEG, PNG, or WebP photo under 10 MB and 25 megapixels.");
  }
}

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

export async function stageProductImage(bytes: Buffer, mimeType: string): Promise<string> {
  const cleaned = await prepareProductImage(bytes, mimeType);
  const filename = `${randomUUID()}.${formats[mimeType]}`;
  const result = await shopifyAdminRequest<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[] | null;
      userErrors: Array<{ message: string }>;
    };
  }>(`mutation MerchantImageUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`, {
    input: [{ filename, mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(cleaned.length) }],
  });
  assertNoUserErrors(result.stagedUploadsCreate.userErrors);
  const target = result.stagedUploadsCreate.stagedTargets?.[0];
  if (!target || new URL(target.url).protocol !== "https:" || new URL(target.resourceUrl).protocol !== "https:") {
    throw new ShopifyAdminError("Shopify did not provide a secure upload target.");
  }
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  // Shopify's upload provider requires the file field after the signed parameters.
  form.append("file", new Blob([new Uint8Array(cleaned)], { type: mimeType }), filename);
  const response = await fetch(target.url, {
    method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new ShopifyAdminError("Shopify could not receive this photo.");
  return target.resourceUrl;
}
