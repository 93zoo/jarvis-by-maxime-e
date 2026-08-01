import { Router, type IRouter } from "express";
import healthRouter from "./health";
import saveRouter from "./save";
import leaderboardRouter from "./leaderboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(saveRouter);
router.use(leaderboardRouter);

export default router;
