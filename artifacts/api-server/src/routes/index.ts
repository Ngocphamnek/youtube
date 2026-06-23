import { Router, type IRouter } from "express";
import healthRouter from "./health";
import players from "./players";
import rooms from "./rooms";
import leaderboard from "./leaderboard";
import transactions from "./transactions";
import games from "./games";

const router: IRouter = Router();

router.use(healthRouter);
router.use(players);
router.use(rooms);
router.use(leaderboard);
router.use(transactions);
router.use(games);

export default router;
