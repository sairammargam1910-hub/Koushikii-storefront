import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";

/** One Railway process serves the API and SPA, keeping auth and media same-origin. */
export function serveStorefront(app: Express, directory?: string) {
  const root = path.resolve(directory || process.env.STOREFRONT_DIST_DIR || "artifacts/chenetha-storefront/dist/public");
  const index = path.join(root, "index.html");
  if (!existsSync(index)) throw new Error("Storefront build missing. Run pnpm run build:railway first.");
  app.use("/api", (_req, res) => { res.status(404).json({ error: "API route not found." }); });
  app.use(express.static(root, {
    index: false,
    dotfiles: "deny",
    setHeaders(res, file) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    },
  }));
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || path.extname(req.path) || !req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
}
