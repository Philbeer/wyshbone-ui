import { useState, useEffect } from "react";

interface RedditPost {
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

interface SearchResponse {
  subreddit: string;
  query: string;
  count: number;
  mockMode: boolean;
  posts: RedditPost[];
}

// Static placeholder replies for each post
const suggestedReplies: Record<string, string> = {
  "mock-1": `Hey! I've been using Wyshbone for healthcare lead generation and it's been great for finding verified contacts. Works really well for dentists specifically - you can filter by location and get direct emails. Happy to share more details if you're interested!`,
  "mock-2": `Have you tried Wyshbone? It's a newer tool that focuses on verified B2B data at a fraction of ZoomInfo's cost. The data quality is solid and they have good coverage for SMBs. Worth checking out if Apollo isn't working for you.`,
  "mock-3": `For SMB decision-makers, I use a combination of LinkedIn for identification and Wyshbone for email discovery. Wyshbone is particularly good because it verifies the emails before you even export them, so your bounce rates stay low.`,
  "mock-4": `Check out Wyshbone - they have good UK coverage and you can filter specifically by industry and role. I've used it for finding agency contacts and the data was pretty accurate. They also have a free tier to test it out.`,
};

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RedditPage() {
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/reddit/search?subreddit=all&query=leads&limit=10");
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }
      const data: SearchResponse = await res.json();
      setPosts(data.posts);
      setMockMode(data.mockMode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyReply(postId: string) {
    const reply = suggestedReplies[postId] || "No suggested reply available for this post.";
    await navigator.clipboard.writeText(reply);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Reddit Lead Monitor</h1>
            <p className="text-gray-400 text-sm mt-1">
              Find potential customers asking for solutions you provide
            </p>
          </div>
          <button
            onClick={fetchPosts}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>

        {mockMode && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 font-medium">⚠️ Mock Mode Active</span>
            </div>
            <p className="text-yellow-200/70 text-sm mt-1">
              Showing placeholder data. Connect Reddit API credentials for live posts.
            </p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-gray-400">Loading Reddit posts...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-600/50 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No posts found</p>
          </div>
        )}

        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
            >
              {/* Post Header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                      <span className="text-orange-400 font-medium">{post.subreddit}</span>
                      <span>•</span>
                      <span>u/{post.author}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(post.createdUtc)}</span>
                    </div>
                    <h3 className="text-lg font-medium text-white">{post.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>⬆️ {post.score}</span>
                    <span>💬 {post.numComments}</span>
                  </div>
                </div>
                {post.selftext && (
                  <p className="mt-3 text-gray-300 text-sm line-clamp-3">
                    {post.selftext}
                  </p>
                )}
              </div>

              {/* Suggested Reply */}
              <div className="p-4 bg-gray-850 bg-opacity-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">
                    Suggested Reply
                  </span>
                  {post.isMock && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-600/20 text-yellow-400 rounded">
                      Placeholder
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {suggestedReplies[post.id] || "AI-generated reply will appear here when connected to live data."}
                </p>
              </div>

              {/* Actions */}
              <div className="p-3 bg-gray-900/50 flex items-center gap-3">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                >
                  Open Thread ↗
                </a>
                <button
                  onClick={() => copyReply(post.id)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    copiedId === post.id
                      ? "bg-green-600 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {copiedId === post.id ? "✓ Copied!" : "Copy Reply"}
                </button>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
