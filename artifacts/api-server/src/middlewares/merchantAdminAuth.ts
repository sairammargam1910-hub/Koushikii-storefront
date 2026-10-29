import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const configuredAdminEmails = () =>
  (process.env.MERCHANT_ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const requireMerchantAdmin: RequestHandler = async (
  req,
  res,
  next,
) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to manage this store." });
    return;
  }

  const allowedEmails = configuredAdminEmails();
  if (!allowedEmails.length) {
    res.status(503).json({
      error: "Store owner access has not been configured yet.",
    });
    return;
  }

  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.get("host");
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && origin) {
    try {
      if (new URL(origin).host !== requestHost) {
        res.status(403).json({ error: "This request is not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "This request is not allowed." });
      return;
    }
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const userEmails = user.emailAddresses.map((entry) =>
      entry.emailAddress.trim().toLowerCase(),
    );
    if (!userEmails.some((email) => allowedEmails.includes(email))) {
      res.status(403).json({
        error: "This account is not authorized to manage this store.",
      });
      return;
    }
    next();
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Could not verify store owner access",
    );
    res.status(503).json({ error: "Store owner access could not be verified." });
  }
};
