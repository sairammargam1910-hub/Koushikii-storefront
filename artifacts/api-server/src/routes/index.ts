import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shopifyRouter from "./shopify";
import shopifyAdminRouter from "./shopifyAdmin";
import shopperRouter from "./shopper";
import siteContentRouter from "./siteContent";
import cashfreeCheckoutRouter from "./cashfreeCheckout";
import shopperOrdersRouter from "./shopperOrders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cashfreeCheckoutRouter);
router.use(shopifyRouter);
router.use(shopifyAdminRouter);
router.use(shopperRouter);
router.use(shopperOrdersRouter);
router.use(siteContentRouter);

export default router;
