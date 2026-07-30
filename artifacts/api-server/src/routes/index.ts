import { Router, type IRouter } from "express";
import healthRouter from "./health";
import saveRouter from "./save";

const router: IRouter = Router();

router.use(healthRouter);
router.use(saveRouter);

export default router;
