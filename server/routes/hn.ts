import { Router } from 'express';
import { searchHN, DEFAULT_HN_KEYWORDS } from '../lib/hn-client';

export const hnRouter = Router();

hnRouter.get('/api/hn/search', async (req, res) => {
  try {
    const keywordsParam = req.query.keywords as string | undefined;
    const limitParam = req.query.limit as string | undefined;

    const keywords = keywordsParam
      ? keywordsParam.split(',').map(k => k.trim()).filter(k => k.length > 0)
      : DEFAULT_HN_KEYWORDS;

    const limit = Math.min(
      Math.max(parseInt(limitParam || '300', 10) || 300, 50),
      500
    );

    console.log(`🔍 HN search: ${keywords.length} keywords, limit=${limit}`);

    const posts = await searchHN(keywords, limit);

    res.json({
      keywords,
      limit,
      count: posts.length,
      posts,
    });
  } catch (err) {
    console.error('❌ HN search error:', (err as Error).message);
    res.status(500).json({
      error: 'HN search failed',
      message: (err as Error).message,
    });
  }
});

hnRouter.get('/api/hn/default-keywords', (_req, res) => {
  res.json({ keywords: DEFAULT_HN_KEYWORDS });
});
