import PQueue from 'p-queue';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_HN_KEYWORDS = [
  'ai',
  'agent',
  'crm',
  'sales',
  'saas',
  'outreach',
  'prospecting',
  'lead',
];

export interface HNItem {
  id: number;
  title: string;
  by: string;
  score: number;
  time_iso: string;
  time_human: string;
  url: string;
  hn_link: string;
  descendants: number;
  snippet: string;
  matched_keywords: string[];
  source: 'hackernews';
  type: 'Story' | 'Ask HN' | 'Show HN';
}

interface RawHNItem {
  id: number;
  type: string;
  title?: string;
  by?: string;
  score?: number;
  time?: number;
  url?: string;
  text?: string;
  descendants?: number;
}

interface CacheEntry {
  data: number[];
  timestamp: number;
}

let newStoriesCache: CacheEntry | null = null;

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTimeHuman(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function inferType(title: string): 'Story' | 'Ask HN' | 'Show HN' {
  if (title.startsWith('Ask HN:')) return 'Ask HN';
  if (title.startsWith('Show HN:')) return 'Show HN';
  return 'Story';
}

function matchKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw.toLowerCase()));
}

async function fetchNewStoryIds(limit: number): Promise<number[]> {
  if (newStoriesCache && Date.now() - newStoriesCache.timestamp < CACHE_TTL_MS) {
    console.log('📦 Using cached HN story IDs');
    return newStoriesCache.data.slice(0, limit);
  }

  console.log('🔄 Fetching fresh HN story IDs');
  const response = await fetch(`${HN_API_BASE}/newstories.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch HN stories: ${response.statusText}`);
  }

  const ids: number[] = await response.json();
  newStoriesCache = {
    data: ids,
    timestamp: Date.now(),
  };

  return ids.slice(0, limit);
}

async function fetchItem(id: number): Promise<RawHNItem | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn(`Failed to fetch HN item ${id}:`, err);
    return null;
  }
}

export async function searchHN(
  keywords: string[],
  limit: number = 300
): Promise<HNItem[]> {
  const storyIds = await fetchNewStoryIds(limit);
  console.log(`📰 Fetching ${storyIds.length} HN items with concurrency limit 10`);

  const queue = new PQueue({ concurrency: 10 });
  const rawItems = await Promise.all(
    storyIds.map(id => queue.add(() => fetchItem(id)))
  );

  const results: HNItem[] = [];

  for (const item of rawItems) {
    if (!item) continue;
    if (item.type !== 'story') continue;
    if (!item.title) continue;

    const searchText = `${item.title} ${item.text || ''}`;
    const matched = matchKeywords(searchText, keywords);

    if (matched.length === 0) continue;

    const hnLink = `https://news.ycombinator.com/item?id=${item.id}`;
    const snippet = stripHtml(item.text || '').substring(0, 240);

    results.push({
      id: item.id,
      title: item.title,
      by: item.by || '[unknown]',
      score: item.score || 0,
      time_iso: item.time ? new Date(item.time * 1000).toISOString() : '',
      time_human: item.time ? formatTimeHuman(item.time) : '',
      url: item.url || hnLink,
      hn_link: hnLink,
      descendants: item.descendants || 0,
      snippet,
      matched_keywords: matched,
      source: 'hackernews',
      type: inferType(item.title),
    });
  }

  results.sort((a, b) => {
    const timeA = a.time_iso ? new Date(a.time_iso).getTime() : 0;
    const timeB = b.time_iso ? new Date(b.time_iso).getTime() : 0;
    return timeB - timeA;
  });

  console.log(`✅ Found ${results.length} matching HN posts`);
  return results;
}
