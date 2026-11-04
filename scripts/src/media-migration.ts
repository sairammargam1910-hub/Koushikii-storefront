import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { defaultExportFile, readExport } from "./content-migration";

async function sha256(stream: AsyncIterable<Uint8Array>) {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}
async function main() {
  const data = await readExport(process.argv.slice(2).find(arg => !arg.startsWith("--")) || defaultExportFile);
  if (!process.argv.includes("--apply") && !process.argv.includes("--verify")) {
    process.stdout.write(`Dry run: ${data.assetIds.length} referenced assets. Use --apply to copy or --verify to compare bytes without writing.\n`);
    return;
  }
  const { R2_ENDPOINT: endpoint, R2_BUCKET_NAME: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, PRIVATE_OBJECT_DIR: sourcePath } = process.env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !sourcePath) throw new Error("Source App Storage and destination R2 settings are required.");
  if (!new URL(endpoint).hostname.endsWith(".r2.cloudflarestorage.com")) throw new Error("Destination must be Cloudflare R2.");
  const [sourceBucket, ...prefixParts] = sourcePath.replace(/^\/+|\/+$/g, "").split("/");
  const source = new Storage({
    projectId: "",
    credentials: {
      type: "external_account", audience: "replit", subject_token_type: "access_token",
      token_url: "http://127.0.0.1:1106/token",
      credential_source: { url: "http://127.0.0.1:1106/credential", format: { type: "json", subject_token_field_name: "access_token" } },
      universe_domain: "googleapis.com",
    },
  });
  const target = new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED" });
  try {
    for (const id of data.assetIds) {
      const key = `uploads/${id}`;
      const file = source.bucket(sourceBucket).file([...prefixParts, key].join("/"));
      const [metadata] = await file.getMetadata();
      const digest = await sha256(file.createReadStream());
      let exists = false;
      try { await target.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); exists = true; }
      catch (error) { if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode !== 404) throw error; }
      if (!exists) {
        if (process.argv.includes("--verify")) throw new Error(`Destination asset missing: ${id}`);
        await target.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: file.createReadStream(),
          ContentLength: Number(metadata.size), ContentType: metadata.contentType,
          Metadata: { visibility: "private", sha256: digest },
        }));
      }
      const object = await target.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!object.Body || await sha256(object.Body as Readable) !== digest) {
        throw new Error(`Media mismatch for ${id}; refusing to overwrite an existing destination object.`);
      }
      process.stdout.write(`Verified asset ${id}.\n`);
    }
    process.stdout.write(`Verified ${data.assetIds.length} media objects byte-for-byte. Source unchanged.\n`);
  } finally { target.destroy(); }
}
main().catch(error => { process.stderr.write(`Media migration failed: ${error.message}\n`); process.exitCode = 1; });
