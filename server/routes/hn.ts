import { Router } from 'express';
import { searchHN, DEFAULT_HN_KEYWORDS, HNItem } from '../lib/hn-client';
import { openai } from '../openai';
import { hnReplies } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(process.env.DATABASE_URL!);
const db = drizzle(queryClient);

export const hnRouter = Router();

const STRONG_POSITIVE_KEYWORDS = [
  'saas', 'crm', 'sales tool', 'sales software', 'lead generation', 'sales automation',
  'prospecting', 'outbound', 'cold email', 'b2b sales', 'sales enablement',
  'pipeline', 'outreach', 'sales ops', 'revenue operations'
];

const POSITIVE_KEYWORDS = [
  'startup', 'growth', 'customer', 'marketing', 'business development',
  'leads', 'conversion', 'acquisition', 'gtm', 'go-to-market', 'ai agent',
  'automation', 'workflow', 'productivity'
];

const QUESTION_INDICATORS = [
  'ask hn', 'how do', 'what tools', 'recommendations', 'looking for',
  'best way to', 'how to', 'any suggestions', 'need help', 'advice'
];

const NEGATIVE_KEYWORDS = [
  'security vulnerability', 'kernel', 'linux kernel', 'assembly',
  'compiler', 'operating system', 'hardware', 'cpu architecture',
  'cryptography', 'low-level', 'embedded systems'
];

function scoreRelevance(item: HNItem): { score: number; label: 'High' | 'Medium' | 'Low' } {
  const titleLower = item.title.toLowerCase();
  const snippetLower = (item.snippet || '').toLowerCase();
  const combined = titleLower + ' ' + snippetLower;

  let score = 50;

  for (const kw of STRONG_POSITIVE_KEYWORDS) {
    if (combined.includes(kw)) {
      score += 15;
    }
  }

  for (const kw of POSITIVE_KEYWORDS) {
    if (combined.includes(kw)) {
      score += 8;
    }
  }

  for (const indicator of QUESTION_INDICATORS) {
    if (combined.includes(indicator)) {
      score += 12;
    }
  }

  if (item.type === 'Ask HN') {
    score += 10;
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (combined.includes(kw)) {
      score -= 20;
    }
  }

  score += Math.min(item.matched_keywords.length * 5, 20);

  if (item.descendants > 50) score += 5;
  if (item.score > 100) score += 5;

  score = Math.max(0, Math.min(100, score));

  let label: 'High' | 'Medium' | 'Low';
  if (score >= 70) {
    label = 'High';
  } else if (score >= 45) {
    label = 'Medium';
  } else {
    label = 'Low';
  }

  return { score, label };
}

export interface ScoredHNItem extends HNItem {
  relevance_score: number;
  relevance_label: 'High' | 'Medium' | 'Low';
  already_replied: boolean;
}

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

    const postIds = posts.map(p => p.id);
    let repliedIds: Set<number> = new Set();

    if (postIds.length > 0) {
      const repliedRows = await db
        .select({ itemId: hnReplies.itemId })
        .from(hnReplies)
        .where(inArray(hnReplies.itemId, postIds));
      repliedIds = new Set(repliedRows.map(r => r.itemId));
    }

    const scoredPosts: ScoredHNItem[] = posts.map(post => {
      const { score, label } = scoreRelevance(post);
      return {
        ...post,
        relevance_score: score,
        relevance_label: label,
        already_replied: repliedIds.has(post.id),
      };
    });

    scoredPosts.sort((a, b) => b.relevance_score - a.relevance_score);

    res.json({
      keywords,
      limit,
      count: scoredPosts.length,
      posts: scoredPosts,
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

hnRouter.get('/api/hn/replied-ids', async (_req, res) => {
  try {
    const rows = await db.select({ itemId: hnReplies.itemId }).from(hnReplies);
    res.json({ ids: rows.map(r => r.itemId) });
  } catch (err) {
    console.error('❌ Failed to fetch replied IDs:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch replied IDs' });
  }
});

hnRouter.post('/api/hn/mark-replied', async (req, res) => {
  try {
    const { item_id } = req.body as { item_id: number };

    if (!item_id || typeof item_id !== 'number') {
      return res.status(400).json({ error: 'item_id is required and must be a number' });
    }

    const existing = await db
      .select()
      .from(hnReplies)
      .where(eq(hnReplies.itemId, item_id))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ success: true, already_existed: true });
    }

    await db.insert(hnReplies).values({ itemId: item_id });

    console.log(`✅ Marked HN item ${item_id} as replied`);
    res.json({ success: true, already_existed: false });
  } catch (err) {
    console.error('❌ Failed to mark as replied:', (err as Error).message);
    res.status(500).json({ error: 'Failed to mark as replied' });
  }
});

hnRouter.post('/api/hn/unmark-replied', async (req, res) => {
  try {
    const { item_id } = req.body as { item_id: number };

    if (!item_id || typeof item_id !== 'number') {
      return res.status(400).json({ error: 'item_id is required and must be a number' });
    }

    await db.delete(hnReplies).where(eq(hnReplies.itemId, item_id));

    console.log(`✅ Unmarked HN item ${item_id} as replied`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to unmark replied:', (err as Error).message);
    res.status(500).json({ error: 'Failed to unmark replied' });
  }
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
