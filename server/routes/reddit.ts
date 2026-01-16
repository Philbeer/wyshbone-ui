import { Router } from "express";

export const redditRouter = Router();

redditRouter.get("/api/reddit/status", (_req, res) => {
  res.json({ enabled: false, message: "Reddit integration not configured" });
});
