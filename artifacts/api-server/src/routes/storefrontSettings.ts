import {
  GetStorefrontSettingsResponse,
  UpdateStorefrontSettingsBody,
  UpdateStorefrontSettingsResponse,
} from "@workspace/api-zod";
import { db, storefrontReturnSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireMerchantAdmin } from "../middlewares/merchantAdminAuth";

const router: IRouter = Router();
const settingsId = "storefront";
const defaultReturnWindowDays = 4;

router.get("/storefront-settings", async (_req, res): Promise<void> => {
  const [settings] = await db
    .select({ returnWindowDays: storefrontReturnSettingsTable.returnWindowDays })
    .from(storefrontReturnSettingsTable)
    .where(eq(storefrontReturnSettingsTable.id, settingsId))
    .limit(1);

  res.json(GetStorefrontSettingsResponse.parse({
    returnWindowDays: settings?.returnWindowDays ?? defaultReturnWindowDays,
  }));
});

router.put("/storefront-settings", requireMerchantAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateStorefrontSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settings] = await db
    .insert(storefrontReturnSettingsTable)
    .values({ id: settingsId, returnWindowDays: parsed.data.returnWindowDays })
    .onConflictDoUpdate({
      target: storefrontReturnSettingsTable.id,
      set: {
        returnWindowDays: parsed.data.returnWindowDays,
        updatedAt: new Date(),
      },
    })
    .returning({ returnWindowDays: storefrontReturnSettingsTable.returnWindowDays });

  res.json(UpdateStorefrontSettingsResponse.parse({
    returnWindowDays: settings.returnWindowDays,
  }));
});

export default router;
