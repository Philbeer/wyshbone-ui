import { Router } from "express";
import { isRedditConfigured, searchSubreddit } from "../lib/reddit-client";

export const redditRouter = Router();

redditRouter.get("/api/reddit/status", (_req, res) => {
  const configured = isRedditConfigured();
  res.json({
    enabled: configured,
    message: configured
      ? "Reddit integration configured"
      : "Reddit integration not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD",
  });
});

redditRouter.get("/api/reddit/search", async (req, res) => {
  try {
    const subreddit = (req.query.subreddit as string) || "sales";
    const query = (req.query.query as string) || "lead generation";
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 25);

    if (!isRedditConfigured()) {
      return res.status(503).json({
        error: "Reddit not configured",
        message: "Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD environment variables",
      });
    }

    console.log(`🔍 Reddit search: r/${subreddit} query="${query}" limit=${limit}`);
    const posts = await searchSubreddit(subreddit, query, limit);

    res.json({
      subreddit,
      query,
      count: posts.length,
      posts,
    });
  } catch (err) {
    console.error("❌ Reddit search error:", (err as Error).message);
    res.status(500).json({
      error: "Reddit search failed",
      message: (err as Error).message,
    });
  }
});
