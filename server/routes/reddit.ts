import { Router } from "express";
import { isRedditConfigured, isRedditMockMode, searchSubreddit, getMockPosts } from "../lib/reddit-client";

export const redditRouter = Router();

redditRouter.get("/api/reddit/status", (_req, res) => {
  const configured = isRedditConfigured();
  const mockMode = isRedditMockMode();
  
  res.json({
    enabled: true, // Always enabled (either real or mock)
    configured,
    mockMode,
    message: mockMode
      ? "Running in mock mode (placeholder data)"
      : "Reddit integration configured with live API",
  });
});

redditRouter.get("/api/reddit/search", async (req, res) => {
  try {
    const subreddit = (req.query.subreddit as string) || "sales";
    const query = (req.query.query as string) || "lead generation";
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 25);

    const mockMode = isRedditMockMode();
    
    if (mockMode) {
      console.log(`🔍 Reddit search (MOCK MODE): r/${subreddit} query="${query}" limit=${limit}`);
    } else {
      console.log(`🔍 Reddit search (LIVE): r/${subreddit} query="${query}" limit=${limit}`);
    }
    
    const posts = await searchSubreddit(subreddit, query, limit);

    res.json({
      subreddit,
      query,
      count: posts.length,
      mockMode,
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
