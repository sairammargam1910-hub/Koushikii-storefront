import { getAuth } from "@clerk/express";
import {
  CreateSiteContentBody,
  CreateSiteContentResponse,
  DeleteSiteContentResponse,
  GetAdminSiteContentResponse,
  GetSiteContentResponse,
  RequestSiteContentUploadBody,
  RequestSiteContentUploadResponse,
  UpdateSiteContentBody,
  UpdateSiteContentParams,
  UpdateSiteContentResponse,
} from "@workspace/api-zod";
import { db, siteContentTable, type SiteContent } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { Router } from "express";
import { pipeline } from "node:stream/promises";
import { requireMerchantAdmin } from "../middlewares/merchantAdminAuth";
import {
  deleteSiteContentAsset,
  getSiteContentAssetFile,
  markSiteContentAssetPublic,
  requestSiteContentUploadUrl,
  siteContentAssetIdFromUrl,
  siteContentAssetIsPublic,
  siteContentAssetUrl,
} from "../lib/siteContentStorage";

const router = Router();
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

function toResponseItem(row: SiteContent) {
  return {
    id: row.id,
    kind: row.kind,
    placement: row.placement,
    title: row.title,
    eyebrow: row.eyebrow,
    body: row.body,
    imageUrl: row.imageUrl,
    mediaUrl: row.mediaUrl,
    altText: row.altText,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    linkedProductId: row.linkedProductId,
    sortOrder: row.sortOrder,
    published: row.published,
    approved: row.approved,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function invalidContentMessage(input: {
  kind: string;
  placement: string | null;
  body: string | null;
  imageUrl: string | null;
  mediaUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  published: boolean;
  approved: boolean;
}) {
  if ((input.kind === "hero_slide" || input.kind === "home_image") && !input.imageUrl) {
    return "Upload an image before saving this item.";
  }
  if (input.kind === "home_image" && input.placement !== "fabric_tile" && input.placement !== "weave_tile") {
    return "Choose whether this image belongs to Shop by Fabric or Shop by Weave.";
  }
  if (input.kind === "customer_voice" && !input.body?.trim()) {
    return "Add the customer's approved words before saving.";
  }
  if (input.kind === "customer_voice" && input.published && !input.approved) {
    return "Confirm the customer's approval before publishing their voice.";
  }
  if (input.kind === "video_post" && !input.mediaUrl) {
    return "Upload a video before saving this post.";
  }
  if (Boolean(input.ctaLabel) !== Boolean(input.ctaUrl)) {
    return "Add both a button label and destination, or leave both blank.";
  }
  if (input.ctaUrl && !isSafeLink(input.ctaUrl)) {
    return "Use a site path or a secure https:// link for the button destination.";
  }
  return null;
}

function isSafeLink(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function normalizeMediaUrl(
  value: string | null,
  mediaKind: "image" | "video",
  ownerId: string,
) {
  if (!value) return null;
  const assetId = siteContentAssetIdFromUrl(value);
  if (assetId) {
    const file = await getSiteContentAssetFile(assetId);
    const [exists] = await file.exists();
    if (!exists) throw new Error("The uploaded file has not finished uploading.");
    const [metadata] = await file.getMetadata();
    const mimeType = metadata.contentType?.toLowerCase() ?? "";
    const size = Number(metadata.size ?? 0);
    if (mediaKind === "image" && (!IMAGE_TYPES.has(mimeType) || size > MAX_IMAGE_BYTES)) {
      throw new Error("Choose a JPEG, PNG, or WebP image under 10 MB.");
    }
    if (mediaKind === "video" && (!VIDEO_TYPES.has(mimeType) || size > MAX_VIDEO_BYTES)) {
      throw new Error("Choose an MP4 or WebM video under 200 MB.");
    }
    await markSiteContentAssetPublic(assetId, ownerId);
    return siteContentAssetUrl(assetId);
  }

  if (mediaKind === "image") {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return value;
    } catch {
      // Existing same-site image paths are also valid.
      if (value.startsWith("/images/") || value.startsWith("/assets/")) return value;
    }
  }
  throw new Error(mediaKind === "image"
    ? "Use an uploaded image or a secure image URL."
    : "Upload the video file to this storefront.");
}

async function prepareInput(
  input: {
    kind: "hero_slide" | "home_image" | "customer_voice" | "video_post";
    placement: "fabric_tile" | "weave_tile" | null;
    title: string;
    eyebrow: string | null;
    body: string | null;
    imageUrl: string | null;
    mediaUrl: string | null;
    altText: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    linkedProductId: string | null;
    sortOrder: number;
    published: boolean;
    approved: boolean;
  },
  ownerId: string,
) {
  const message = invalidContentMessage(input);
  if (message) throw new Error(message);
  const imageUrl = await normalizeMediaUrl(input.imageUrl, "image", ownerId);
  const mediaUrl = await normalizeMediaUrl(input.mediaUrl, "video", ownerId);
  return {
    ...input,
    title: input.title.trim(),
    eyebrow: input.eyebrow?.trim() || null,
    body: input.body?.trim() || null,
    imageUrl,
    mediaUrl,
    altText: input.altText?.trim() || null,
    ctaLabel: input.ctaLabel?.trim() || null,
    ctaUrl: input.ctaUrl?.trim() || null,
    linkedProductId: input.linkedProductId?.trim() || null,
    approved: input.kind === "customer_voice" && input.approved,
  };
}

async function removeUnreferencedAssets(candidates: Array<string | null>) {
  const ids = [...new Set(candidates.map(siteContentAssetIdFromUrl).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const remaining = await db.select({
    imageUrl: siteContentTable.imageUrl,
    mediaUrl: siteContentTable.mediaUrl,
  }).from(siteContentTable);
  const usedIds = new Set(
    remaining.flatMap((row) => [row.imageUrl, row.mediaUrl])
      .map(siteContentAssetIdFromUrl)
      .filter((id): id is string => Boolean(id)),
  );
  for (const id of ids) {
    if (usedIds.has(id)) continue;
    try {
      await deleteSiteContentAsset(id);
    } catch {
      // The row is already gone; an orphaned media file is safe to clean up later.
    }
  }
}

router.get("/site-content", async (_req, res) => {
  const rows = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.published, true))
    .orderBy(asc(siteContentTable.sortOrder), asc(siteContentTable.createdAt));
  const items = rows.filter((row) => row.kind !== "customer_voice" || row.approved);
  res.json(GetSiteContentResponse.parse({ items: items.map(toResponseItem) }));
});

router.get("/site-content/admin", requireMerchantAdmin, async (_req, res) => {
  const rows = await db.select().from(siteContentTable)
    .orderBy(asc(siteContentTable.kind), asc(siteContentTable.sortOrder), asc(siteContentTable.createdAt));
  res.json(GetAdminSiteContentResponse.parse({ items: rows.map(toResponseItem) }));
});

router.post("/site-content/uploads", requireMerchantAdmin, async (req, res) => {
  const parsed = RequestSiteContentUploadBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a supported image or video file." });
  const { size, contentType } = parsed.data;
  const maxSize = IMAGE_TYPES.has(contentType) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size > maxSize) {
    return res.status(400).json({
      error: IMAGE_TYPES.has(contentType)
        ? "Images must be 10 MB or smaller."
        : "Videos must be 200 MB or smaller.",
    });
  }
  try {
    const result = await requestSiteContentUploadUrl();
    return res.status(201).json(RequestSiteContentUploadResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not create a site media upload URL");
    return res.status(502).json({ error: "Media uploads are temporarily unavailable. Please try again." });
  }
});

router.post("/site-content", requireMerchantAdmin, async (req, res) => {
  const parsed = CreateSiteContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the content fields and try again." });
  const ownerId = getAuth(req).userId;
  if (!ownerId) return res.status(401).json({ error: "Sign in with a merchant account to continue." });
  try {
    const input = await prepareInput(parsed.data, ownerId);
    const [row] = await db.insert(siteContentTable).values(input).returning();
    return res.status(201).json(CreateSiteContentResponse.parse(toResponseItem(row)));
  } catch (error) {
    void removeUnreferencedAssets([parsed.data.imageUrl, parsed.data.mediaUrl]).catch((cleanupError) => {
      req.log.warn({ err: cleanupError }, "Could not clean up an unsaved media upload");
    });
    const message = error instanceof Error ? error.message : "Could not save this content.";
    req.log.warn({ err: error }, "Could not create site content");
    return res.status(400).json({ error: message });
  }
});

router.put("/site-content/:id", requireMerchantAdmin, async (req, res) => {
  const params = UpdateSiteContentParams.safeParse(req.params);
  const parsed = UpdateSiteContentBody.safeParse(req.body);
  if (!params.success) return res.status(400).json({ error: "Invalid content item." });
  if (!parsed.success) return res.status(400).json({ error: "Check the content fields and try again." });
  const ownerId = getAuth(req).userId;
  if (!ownerId) return res.status(401).json({ error: "Sign in with a merchant account to continue." });
  try {
    const [previous] = await db.select().from(siteContentTable)
      .where(eq(siteContentTable.id, params.data.id));
    if (!previous) return res.status(404).json({ error: "This content item no longer exists." });
    const input = await prepareInput(parsed.data, ownerId);
    const [row] = await db.update(siteContentTable)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(siteContentTable.id, params.data.id))
      .returning();
    if (!row) return res.status(404).json({ error: "This content item no longer exists." });
    void removeUnreferencedAssets([previous.imageUrl, previous.mediaUrl]).catch((cleanupError) => {
      req.log.warn({ err: cleanupError }, "Could not clean up replaced site media");
    });
    return res.json(UpdateSiteContentResponse.parse(toResponseItem(row)));
  } catch (error) {
    void removeUnreferencedAssets([parsed.data.imageUrl, parsed.data.mediaUrl]).catch((cleanupError) => {
      req.log.warn({ err: cleanupError }, "Could not clean up an unsaved media upload");
    });
    const message = error instanceof Error ? error.message : "Could not update this content.";
    req.log.warn({ err: error }, "Could not update site content");
    return res.status(400).json({ error: message });
  }
});

router.delete("/site-content/:id", requireMerchantAdmin, async (req, res) => {
  const params = UpdateSiteContentParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid content item." });
  const [row] = await db.delete(siteContentTable)
    .where(eq(siteContentTable.id, params.data.id))
    .returning();
  if (!row) return res.status(404).json({ error: "This content item no longer exists." });
  void removeUnreferencedAssets([row.imageUrl, row.mediaUrl]).catch((error) => {
    req.log.warn({ err: error }, "Could not clean up unreferenced site media");
  });
  return res.json(DeleteSiteContentResponse.parse({ id: row.id, deleted: true }));
});

router.get("/site-content/media/:assetId", async (req, res) => {
  const assetId = req.params.assetId;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  try {
    const file = await getSiteContentAssetFile(assetId);
    const [exists] = await file.exists();
    if (!exists || !(await siteContentAssetIsPublic(file))) {
      res.status(404).json({ error: "Media not found." });
      return;
    }
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    const contentType = metadata.contentType ?? "application/octet-stream";
    const rangeHeader = req.header("range");
    let start: number | undefined;
    let end: number | undefined;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match || (!match[1] && !match[2])) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
      } else {
        const suffixLength = Number(match[2]);
        start = Math.max(0, size - suffixLength);
        end = size - 1;
      }
      if (start < 0 || end < start || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      end = Math.min(end, size - 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", end - start + 1);
    } else {
      res.setHeader("Content-Length", size);
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.createReadStream(start === undefined ? {} : { start, end }), res);
  } catch (error) {
    req.log.error({ err: error }, "Could not stream site media");
    if (!res.headersSent) {
      res.status(404).json({ error: "Media not found." });
      return;
    }
    res.destroy(error as Error);
  }
});

export default router;
