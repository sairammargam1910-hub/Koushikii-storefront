import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shopifyRouter from "./shopify";
import shopifyAdminRouter from "./shopifyAdmin";
import shopperRouter from "./shopper";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shopifyRouter);
router.use(shopifyAdminRouter);
router.use(shopperRouter);

export default router;
