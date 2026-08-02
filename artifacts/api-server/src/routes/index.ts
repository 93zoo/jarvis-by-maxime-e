import { Router, type IRouter } from "express";
import healthRouter from "./health";
import saveRouter from "./save";
import leaderboardRouter from "./leaderboard";
import privacyRouter from "./privacy";
import termsRouter from "./terms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(saveRouter);
router.use(leaderboardRouter);
router.use(privacyRouter);
router.use(termsRouter);

export default router;
