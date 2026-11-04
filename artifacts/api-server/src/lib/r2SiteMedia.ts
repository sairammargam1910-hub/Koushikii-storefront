import {
  CopyObjectCommand, DeleteObjectCommand, GetObjectCommand,
  HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

let client: S3Client | undefined;
function config() {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 storage is not fully configured.");
  }
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com") || url.username || url.password) {
    throw new Error("R2_ENDPOINT must be a secure Cloudflare R2 endpoint.");
  }
  client ??= new S3Client({
    endpoint, region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket };
}

export class R2AssetFile {
  constructor(
    readonly assetId: string,
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}
  private get key() { return `uploads/${this.assetId}`; }
  private head() {
    return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }));
  }
  async exists(): Promise<[boolean]> {
    try { await this.head(); return [true]; }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return [false];
      throw error;
    }
  }
  async getMetadata(): Promise<[{ contentType?: string; size: number }]> {
    const head = await this.head();
    return [{ contentType: head.ContentType, size: head.ContentLength ?? 0 }];
  }
  async markPrivate(ownerId: string) {
    // The bucket must remain private. Publication is authorized by the database-backed
    // app route, never by a public bucket ACL or a public R2 development URL.
    const head = await this.head();
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket, Key: this.key,
      CopySource: `${this.bucket}/${this.key}`,
      MetadataDirective: "REPLACE",
      ContentType: head.ContentType,
      Metadata: { ...head.Metadata, owner: ownerId, visibility: "private" },
    }));
  }
  createReadStream(options: { start?: number; end?: number } = {}) {
    const controller = new AbortController();
    const request = {
      Bucket: this.bucket, Key: this.key,
      ...(options.start === undefined ? {} : { Range: `bytes=${options.start}-${options.end ?? ""}` }),
    };
    const client = this.client;
    const stream = Readable.from((async function* () {
      const result = await client.send(new GetObjectCommand(request), { abortSignal: controller.signal });
      if (!result.Body) throw new Error("R2 returned an empty response body.");
      const body = result.Body as Readable;
      try { for await (const chunk of body) yield chunk; }
      finally { body.destroy(); }
    })());
    stream.on("close", () => controller.abort());
    return stream;
  }
  async delete(_options?: { ignoreNotFound?: boolean }) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key }));
  }
}

export function r2File(assetId: string) {
  const { bucket, client } = config();
  return new R2AssetFile(assetId, bucket, client);
}

export async function r2UploadUrl(assetId: string, contentType?: string, size?: number) {
  const { bucket, client } = config();
  return getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: `uploads/${assetId}`, ContentType: contentType, ContentLength: size,
  }), { expiresIn: 900, signableHeaders: new Set(["content-type", "content-length"]) });
}
