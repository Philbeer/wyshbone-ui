import { Router } from 'express';
import { searchHN, DEFAULT_HN_KEYWORDS } from '../lib/hn-client';
import { openai } from '../openai';

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

interface HNDraftRequest {
  item: {
    id: number;
    title: string;
    hn_link: string;
    url?: string;
    snippet?: string;
    matched_keywords?: string[];
    type?: string;
  };
  keywords?: string[];
}

hnRouter.post('/api/hn/draft', async (req, res) => {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  console.log(`📝 POST /api/hn/draft - OpenAI key present: ${hasOpenAIKey}`);

  if (!hasOpenAIKey) {
    console.error('❌ HN draft error: OPENAI_API_KEY not configured');
    return res.status(503).json({
      error: 'OpenAI API key not configured',
      details: 'Please set the OPENAI_API_KEY environment variable to enable draft generation.',
    });
  }

  try {
    const body = req.body as HNDraftRequest;

    if (!body.item || !body.item.title) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Missing required item.title field',
      });
    }

    const { item, keywords = [] } = body;

    console.log(`📝 Generating draft for HN post: "${item.title.substring(0, 50)}..."`);

    const prompt = `You are drafting a reply to a Hacker News discussion.

CONTEXT:
Title: ${item.title}
${item.type ? `Type: ${item.type}` : ''}
${item.snippet ? `Content snippet: ${item.snippet}` : ''}
${keywords.length > 0 ? `Matched keywords: ${keywords.join(', ')}` : ''}

GUIDELINES:
- Be concise and technical (2-4 sentences)
- Maintain a neutral, professional tone that fits Hacker News
- No hype, marketing language, or excessive enthusiasm
- No explicit call-to-action or self-promotion
- Only mention Wyshbone if directly relevant to the discussion topic (and if so, as a brief parenthetical)
- Focus on adding genuine value to the discussion
- Match the HN community's expectations for thoughtful, substantive discourse
- Be authentic and contribute something meaningful

Write a thoughtful draft reply:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const draft = completion.choices[0]?.message?.content?.trim();

    if (!draft) {
      console.error('❌ HN draft error: Empty response from OpenAI');
      return res.status(500).json({
        error: 'Empty response from LLM',
        details: 'The AI model returned an empty response. Please try again.',
      });
    }

    console.log(`✅ Generated draft (${draft.length} chars)`);

    res.json({
      success: true,
      draft,
      item_id: item.id,
    });
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error';
    const statusCode = err.status || err.statusCode || 500;

    console.error(`❌ HN draft error (${statusCode}):`, errorMessage);

    if (err.code === 'insufficient_quota') {
      return res.status(402).json({
        error: 'OpenAI quota exceeded',
        details: 'The OpenAI API quota has been exceeded. Please check your billing.',
      });
    }

    if (err.code === 'invalid_api_key') {
      return res.status(401).json({
        error: 'Invalid OpenAI API key',
        details: 'The configured OpenAI API key is invalid.',
      });
    }

    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: 'Draft generation failed',
      details: errorMessage,
    });
  }
});
