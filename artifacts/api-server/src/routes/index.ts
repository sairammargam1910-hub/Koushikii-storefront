import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shopifyRouter from "./shopify";
import shopifyAdminRouter from "./shopifyAdmin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shopifyRouter);
router.use(shopifyAdminRouter);

export default router;
