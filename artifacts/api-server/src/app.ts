import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { logger } from "./lib/logger";
import { serveStorefront } from "./lib/serveStorefront";

const app: Express = express();
app.set("trust proxy", 1);
const externalAuth = process.env.CLERK_AUTH_MODE === "external";
const allowedOrigins = (process.env.APP_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
if (!externalAuth) app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const allowed = !origin || allowedOrigins.includes(origin) ||
      (!externalAuth && process.env.NODE_ENV !== "production");
    callback(null, allowed);
  },
}));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: externalAuth ? process.env.CLERK_PUBLISHABLE_KEY : publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    ...(externalAuth && allowedOrigins.length ? { authorizedParties: allowedOrigins } : {}),
  })),
);
app.use("/api/cashfree/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
if (process.env.SERVE_STOREFRONT === "true") serveStorefront(app);

export default app;
