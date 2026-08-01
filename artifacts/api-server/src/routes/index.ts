import { Router, type IRouter } from "express";
import healthRouter from "./health";
import saveRouter from "./save";
import leaderboardRouter from "./leaderboard";
import privacyRouter from "./privacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(saveRouter);
router.use(leaderboardRouter);
router.use(privacyRouter);

export default router;
