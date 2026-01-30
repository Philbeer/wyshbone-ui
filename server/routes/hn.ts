import { Router } from 'express';
import { searchHN, DEFAULT_HN_KEYWORDS, HNItem } from '../lib/hn-client';
import { openai } from '../openai';
import { hnReplies, hnDone } from '../../shared/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// SINGLE SOURCE OF TRUTH: SUPABASE_DATABASE_URL (Replit auto-provides DATABASE_URL for its built-in Postgres)
const queryClient = postgres(process.env.SUPABASE_DATABASE_URL!);
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
  is_done: boolean;
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
    let doneIds: Set<number> = new Set();

    if (postIds.length > 0) {
      const doneRows = await db
        .select({ itemId: hnDone.itemId })
        .from(hnDone)
        .where(and(
          inArray(hnDone.itemId, postIds),
          eq(hnDone.done, true)
        ));
      doneIds = new Set(doneRows.map((r: { itemId: number }) => r.itemId));
    }

    const scoredPosts: ScoredHNItem[] = posts.map(post => {
      const { score, label } = scoreRelevance(post);
      return {
        ...post,
        relevance_score: score,
        relevance_label: label,
        is_done: doneIds.has(post.id),
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

hnRouter.get('/api/hn/done-ids', async (_req, res) => {
  try {
    const rows = await db
      .select({ itemId: hnDone.itemId })
      .from(hnDone)
      .where(eq(hnDone.done, true));
    res.json({ ids: rows.map((r: { itemId: number }) => r.itemId) });
  } catch (err) {
    console.error('❌ Failed to fetch done IDs:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch done IDs' });
  }
});

hnRouter.post('/api/hn/done', async (req, res) => {
  try {
    const { item_id } = req.body as { item_id: number };

    if (!item_id || typeof item_id !== 'number') {
      return res.status(400).json({ error: 'item_id is required and must be a number' });
    }

    const existing = await db
      .select()
      .from(hnDone)
      .where(eq(hnDone.itemId, item_id))
      .limit(1);

    if (existing.length > 0) {
      await db.update(hnDone)
        .set({ done: true, updatedAt: new Date() })
        .where(eq(hnDone.itemId, item_id));
      return res.json({ success: true, already_existed: true });
    }

    await db.insert(hnDone).values({ itemId: item_id, done: true });

    console.log(`✅ Marked HN item ${item_id} as done`);
    res.json({ success: true, already_existed: false });
  } catch (err) {
    console.error('❌ Failed to mark as done:', (err as Error).message);
    res.status(500).json({ error: 'Failed to mark as done' });
  }
});

hnRouter.post('/api/hn/undo', async (req, res) => {
  try {
    const { item_id } = req.body as { item_id: number };

    if (!item_id || typeof item_id !== 'number') {
      return res.status(400).json({ error: 'item_id is required and must be a number' });
    }

    await db.delete(hnDone).where(eq(hnDone.itemId, item_id));

    console.log(`✅ Unmarked HN item ${item_id} as done`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to undo done:', (err as Error).message);
    res.status(500).json({ error: 'Failed to undo done' });
  }
});

hnRouter.get('/api/hn/replied-ids', async (_req, res) => {
  try {
    const rows = await db.select({ itemId: hnReplies.itemId }).from(hnReplies);
    res.json({ ids: rows.map((r: { itemId: number }) => r.itemId) });
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

    const { item, keywords = [], relevance_score = 0 } = body as HNDraftRequest & { relevance_score?: number };

    const titleLower = item.title.toLowerCase();
    const snippetLower = (item.snippet || '').toLowerCase();
    const combinedText = `${titleLower} ${snippetLower}`;

    const TOOL_REQUEST_PATTERNS = [
      /what\s+(do\s+you|should\s+i|tools?|software|crm|platform)/,
      /recommend(ation)?s?\s*(for|on)?/,
      /looking\s+for\s+(a\s+)?(tool|software|crm|platform|solution)/,
      /best\s+(tool|software|crm|platform|solution)/,
      /which\s+(tool|software|crm|platform)/,
      /any\s+(good\s+)?(tool|software|crm|recommendation)/,
      /suggest(ion)?s?\s*(for|on)?/,
      /ask\s+hn.*\s+(tool|software|use|recommend)/,
    ];

    const isToolRequest = TOOL_REQUEST_PATTERNS.some(pattern => pattern.test(combinedText));
    const detected_intent = isToolRequest ? 'tool_request' : 'general_discussion';

    console.log(`📝 Generating draft for HN post: "${item.title.substring(0, 50)}..." (relevance: ${relevance_score}, intent: ${detected_intent})`);

    const shouldMentionWyshbone = relevance_score >= 70;
    const mayIncludeLink = relevance_score >= 80 && isToolRequest;

    const prompt = `You are drafting a reply to a Hacker News discussion. Your reply must be formatted for HN and read like a genuine community comment.

CONTEXT:
Title: ${item.title}
${item.type ? `Type: ${item.type}` : ''}
${item.snippet ? `Post content: ${item.snippet}` : ''}
${keywords.length > 0 ? `Topic keywords: ${keywords.join(', ')}` : ''}
Relevance score: ${relevance_score}/100
Detected intent: ${detected_intent}

FORMATTING RULES (MANDATORY):
- Use short paragraphs (max 2 sentences each)
- Insert a blank line between paragraphs
- Total length: 4-6 sentences max
- No bullet points or lists

TONE:
- Friendly, thoughtful, builder-to-builder
- No marketing language or hype words ("powerful", "revolutionary", "game-changing", etc.)
- No calls to action ("check out", "try", "sign up", "launching", etc.)
- Be concrete and grounded

STRUCTURE (FOLLOW EXACTLY):

Paragraph 1:
Directly answer the question or respond to the post. Provide concrete, grounded insight. Do NOT mention any product.

Paragraph 2:
Share a brief personal or builder experience. Use framing like "We ran into this ourselves..." or "In our experience..."

${shouldMentionWyshbone ? `Paragraph 3 (INCLUDE - relevance >= 70):
One sentence maximum. Mention Wyshbone naturally as context, not a pitch.
Describe it factually as "an AI-assisted sales lead generation and sales enablement platform".
Only reference capabilities relevant to the post (discovery, outreach timing, CRM integration, etc).
Example framing: "We ended up building Wyshbone to handle X."
Do NOT include any links in this paragraph.` : `Paragraph 3:
Do NOT mention Wyshbone or any product. End with the builder experience.`}

${mayIncludeLink ? `Paragraph 4 (INCLUDE - tool request detected):
One sentence maximum.
Embed the naked domain "wyshbonesales.com" naturally in the sentence.
No http/https prefix.
Never as a standalone line or footer.
Example: "We built Wyshbone for this use case — details are at wyshbonesales.com."` : ''}

Write the draft reply now:`;

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
