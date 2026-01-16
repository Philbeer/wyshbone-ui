// Reddit client with mock mode fallback
// snoowrap is only imported when credentials are present

let redditClient: any = null;
let snoowrapModule: any = null;

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  numComments: number;
  selftext: string;
  author: string;
  isMock?: boolean;
}

// Check if mock mode is enabled
export function isRedditMockMode(): boolean {
  return process.env.USE_REDDIT_MOCK === "true" || !isRedditConfigured();
}

function validateEnvVars(): RedditConfig | null {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const userAgent = process.env.REDDIT_USER_AGENT || "wyshbone-agent/1.0.0";

  const missing: string[] = [];
  if (!clientId) missing.push("REDDIT_CLIENT_ID");
  if (!clientSecret) missing.push("REDDIT_CLIENT_SECRET");
  if (!username) missing.push("REDDIT_USERNAME");
  if (!password) missing.push("REDDIT_PASSWORD");

  if (missing.length > 0) {
    return null;
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    username: username!,
    password: password!,
    userAgent,
  };
}

async function loadSnoowrap() {
  if (!snoowrapModule) {
    try {
      snoowrapModule = await import("snoowrap");
    } catch (err) {
      console.warn("⚠️ snoowrap not installed, Reddit will use mock mode");
      return null;
    }
  }
  return snoowrapModule.default || snoowrapModule;
}

export async function getRedditClient(): Promise<any | null> {
  if (redditClient) return redditClient;

  const config = validateEnvVars();
  if (!config) return null;

  try {
    const Snoowrap = await loadSnoowrap();
    if (!Snoowrap) return null;

    redditClient = new Snoowrap({
      userAgent: config.userAgent,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      username: config.username,
      password: config.password,
    });
    console.log("✅ Reddit client initialized");
    return redditClient;
  } catch (err) {
    console.error("❌ Failed to initialize Reddit client:", (err as Error).message);
    return null;
  }
}

export function isRedditConfigured(): boolean {
  return validateEnvVars() !== null;
}

// Generate mock Reddit posts for testing
export function getMockPosts(): RedditPost[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: "mock-1",
      title: "Looking for a CRM to find dentists in Texas",
      subreddit: "r/sales",
      permalink: "https://reddit.com/r/sales/comments/mock1",
      createdUtc: now - 2 * 3600,
      score: 12,
      numComments: 4,
      selftext: "I'm trying to build a list of dentists in Texas and need emails. Any tools that work well for healthcare leads? ZoomInfo is way too expensive for my budget.",
      author: "throwaway123",
      isMock: true,
    },
    {
      id: "mock-2",
      title: "Best way to generate B2B leads without ZoomInfo?",
      subreddit: "r/Entrepreneur",
      permalink: "https://reddit.com/r/Entrepreneur/comments/mock2",
      createdUtc: now - 6 * 3600,
      score: 8,
      numComments: 7,
      selftext: "Apollo is expensive and their data quality has been declining. Are there any good alternatives for finding business emails and phone numbers?",
      author: "startup_guy",
      isMock: true,
    },
    {
      id: "mock-3",
      title: "How do you find decision-makers at small businesses?",
      subreddit: "r/sales",
      permalink: "https://reddit.com/r/sales/comments/mock3",
      createdUtc: now - 12 * 3600,
      score: 24,
      numComments: 11,
      selftext: "I'm targeting SMBs and it's really hard to find the owner/CEO contact info. LinkedIn Sales Navigator is helpful but I need emails. What's your process?",
      author: "sdr_life",
      isMock: true,
    },
    {
      id: "mock-4",
      title: "UK-based leads for marketing agencies?",
      subreddit: "r/digital_marketing",
      permalink: "https://reddit.com/r/digital_marketing/comments/mock4",
      createdUtc: now - 18 * 3600,
      score: 5,
      numComments: 3,
      selftext: "I'm looking for a database of UK marketing agencies. Specifically need contact details for founders or marketing directors. Any suggestions?",
      author: "agency_hunter",
      isMock: true,
    },
  ];
}

export async function searchSubreddit(
  subredditName: string,
  query: string,
  limit: number = 5
): Promise<RedditPost[]> {
  // Return mock data if in mock mode
  if (isRedditMockMode()) {
    const mockPosts = getMockPosts();
    // Filter by subreddit if specified (case-insensitive)
    const filtered = subredditName.toLowerCase() === "all" 
      ? mockPosts 
      : mockPosts.filter(p => p.subreddit.toLowerCase().includes(subredditName.toLowerCase()));
    return filtered.slice(0, limit);
  }

  const client = await getRedditClient();
  if (!client) {
    // Fall back to mock if client unavailable
    return getMockPosts().slice(0, limit);
  }

  const subreddit = client.getSubreddit(subredditName);
  const posts = await subreddit.search({
    query,
    time: "week",
    sort: "relevance",
    limit,
  });

  return posts.map((post: any) => ({
    id: post.id,
    title: post.title,
    subreddit: post.subreddit_name_prefixed,
    permalink: `https://reddit.com${post.permalink}`,
    createdUtc: post.created_utc,
    score: post.score,
    numComments: post.num_comments,
    selftext: post.selftext?.substring(0, 500) || "",
    author: post.author?.name || "[deleted]",
    isMock: false,
  }));
}
