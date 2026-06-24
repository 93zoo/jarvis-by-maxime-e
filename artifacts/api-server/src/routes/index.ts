import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import emailRouter from "./email";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiRouter);
router.use("/email", emailRouter);

export default router;
