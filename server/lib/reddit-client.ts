// @ts-ignore - snoowrap has incomplete type definitions
import Snoowrap from "snoowrap";

let redditClient: Snoowrap | null = null;

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
    console.warn(`⚠️ Reddit integration disabled: missing ${missing.join(", ")}`);
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

export function getRedditClient(): Snoowrap | null {
  if (redditClient) return redditClient;

  const config = validateEnvVars();
  if (!config) return null;

  try {
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

export async function searchSubreddit(
  subredditName: string,
  query: string,
  limit: number = 5
): Promise<RedditPost[]> {
  const client = getRedditClient();
  if (!client) {
    throw new Error("Reddit client not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD");
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
  }));
}
