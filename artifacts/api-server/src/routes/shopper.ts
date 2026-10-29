import { clerkClient, getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetShopperPreferencesResponse,
  UpdateShopperProfileBody,
  UpdateShopperWishlistBody,
  type ShopperPreferencesResponse,
  type ShopperProfile,
} from "@workspace/api-zod";

const router: IRouter = Router();
const WISHLIST_KEY = "chenethaShopperWishlist";
const PROFILE_KEY = "chenethaShopperProfile";

const emptyProfile: ShopperProfile = {
  name: "",
  email: "",
  phone: "",
  addresses: [],
};

function preferencesFromMetadata(metadata: Record<string, unknown>): ShopperPreferencesResponse {
  const rawWishlist = metadata[WISHLIST_KEY];
  const rawProfile = metadata[PROFILE_KEY];
  const wishlist = Array.isArray(rawWishlist)
    ? rawWishlist.filter((id): id is string => typeof id === "string")
    : [];

  try {
    return GetShopperPreferencesResponse.parse({
      wishlist,
      profile: rawProfile ?? emptyProfile,
    });
  } catch {
    return { wishlist: [], profile: emptyProfile };
  }
}

function fitsPrivateMetadata(
  metadata: Record<string, unknown>,
  wishlist: string[] = Array.isArray(metadata[WISHLIST_KEY])
    ? (metadata[WISHLIST_KEY] as string[])
    : [],
  profile: ShopperProfile = (metadata[PROFILE_KEY] as ShopperProfile | undefined) ??
    emptyProfile,
) {
  return JSON.stringify({ wishlist, profile }).length <= 7000;
}

function rejectCrossOriginMutation(
  req: Request,
  res: Response,
) {
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.get("host");
  if (!origin) return false;
  try {
    if (new URL(origin).host === requestHost) return false;
  } catch {
    // Reject malformed origins below.
  }
  res.status(403).json({ error: "This request is not allowed." });
  return true;
}

function requireShopper(req: Request, res: Response) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save your preferences." });
    return null;
  }
  return userId;
}

router.get("/shopper/preferences", async (req, res): Promise<void> => {
  const userId = requireShopper(req, res);
  if (!userId) return;

  try {
    const user = await clerkClient.users.getUser(userId);
    res.setHeader("Cache-Control", "no-store");
    res.json(preferencesFromMetadata(user.privateMetadata));
  } catch (error) {
    req.log.error({ err: error }, "Could not load shopper preferences");
    res.status(503).json({ error: "Your saved preferences could not be loaded." });
  }
});

router.put("/shopper/preferences/wishlist", async (req, res): Promise<void> => {
  const userId = requireShopper(req, res);
  if (!userId) return;
  if (rejectCrossOriginMutation(req, res)) return;

  const body = UpdateShopperWishlistBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid wishlist." });
    return;
  }
  if (JSON.stringify(body.data.ids).length > 6000) {
    res.status(400).json({ error: "Your wishlist is too large to save." });
    return;
  }

  try {
    const currentUser = await clerkClient.users.getUser(userId);
    if (!fitsPrivateMetadata(currentUser.privateMetadata, body.data.ids)) {
      res.status(400).json({ error: "Your saved preferences are too large to store." });
      return;
    }
    const user = await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { [WISHLIST_KEY]: body.data.ids },
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(preferencesFromMetadata(user.privateMetadata));
  } catch (error) {
    req.log.error({ err: error }, "Could not save shopper wishlist");
    res.status(503).json({ error: "Your wishlist could not be saved." });
  }
});

router.put("/shopper/preferences/profile", async (req, res): Promise<void> => {
  const userId = requireShopper(req, res);
  if (!userId) return;
  if (rejectCrossOriginMutation(req, res)) return;

  const body = UpdateShopperProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Check the saved profile details and addresses." });
    return;
  }
  if (JSON.stringify(body.data).length > 6000) {
    res.status(400).json({ error: "Your saved profile is too large to store." });
    return;
  }

  try {
    const currentUser = await clerkClient.users.getUser(userId);
    if (!fitsPrivateMetadata(currentUser.privateMetadata, undefined, body.data)) {
      res.status(400).json({ error: "Your saved preferences are too large to store." });
      return;
    }
    const user = await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { [PROFILE_KEY]: body.data },
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(preferencesFromMetadata(user.privateMetadata));
  } catch (error) {
    req.log.error({ err: error }, "Could not save shopper profile");
    res.status(503).json({ error: "Your saved profile could not be saved." });
  }
});

router.delete("/shopper/preferences", async (req, res): Promise<void> => {
  const userId = requireShopper(req, res);
  if (!userId) return;
  if (rejectCrossOriginMutation(req, res)) return;

  try {
    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: {
        [WISHLIST_KEY]: [],
        [PROFILE_KEY]: emptyProfile,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Could not clear shopper preferences");
    res.status(503).json({ error: "Your saved preferences could not be cleared." });
  }
});

export default router;
