import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Copy, Check, RefreshCw, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DEFAULT_HN_KEYWORDS = [
  "lead generation",
  "sales automation",
  "sales enablement",
  "crm",
  "b2b sales",
  "prospecting",
  "outbound sales",
  "sales tooling",
  "ai sales",
  "agentic ai",
  "sales ai",
  "business discovery",
  "account planning",
  "territory planning",
  "route planning",
  "call tracking",
  "order tracking",
  "sales crm",
  "vertical saas",
  "sales workflow",
  "pipeline management",
];

interface HNPost {
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
  source: "hackernews";
  type: "Story" | "Ask HN" | "Show HN";
}

interface SearchResponse {
  keywords: string[];
  limit: number;
  count: number;
  posts: HNPost[];
}

export default function HackerNewsPage() {
  const [posts, setPosts] = useState<HNPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState(DEFAULT_HN_KEYWORDS.join(", "));
  const [limit, setLimit] = useState<string>("300");
  const [hasSearched, setHasSearched] = useState(false);

  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPost, setDraftPost] = useState<HNPost | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const keywordsParam = encodeURIComponent(keywords);
      const res = await fetch(
        `/api/hn/search?keywords=${keywordsParam}&limit=${limit}`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }
      const data: SearchResponse = await res.json();
      setPosts(data.posts);
      setHasSearched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [keywords, limit]);

  useEffect(() => {
    fetchPosts();
  }, []);

  const [draftError, setDraftError] = useState(false);

  const handleDraftReply = async (post: HNPost) => {
    setDraftPost(post);
    setDraftModalOpen(true);
    setDraftLoading(true);
    setDraftText("");
    setDraftError(false);
    setCopiedDraft(false);

    try {
      const res = await fetch("/api/hn/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            id: post.id,
            title: post.title,
            hn_link: post.hn_link,
            url: post.url,
            snippet: post.snippet,
            matched_keywords: post.matched_keywords,
            type: post.type,
          },
          keywords: post.matched_keywords,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.details || data.error || `HTTP ${res.status}`;
        setDraftError(true);
        setDraftText(`Error: ${errorMsg}`);
        return;
      }

      if (data.draft) {
        setDraftText(data.draft);
      } else {
        setDraftError(true);
        setDraftText("Error: No draft content returned");
      }
    } catch (err) {
      setDraftError(true);
      setDraftText(`Error: ${(err as Error).message}`);
    } finally {
      setDraftLoading(false);
    }
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draftText);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "Ask HN":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "Show HN":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Hacker News Discovery</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Find relevant HN discussions and draft thoughtful replies
            </p>
          </div>

          <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Keywords (comma-separated)
                </label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="lead generation, sales automation, crm..."
                  className="w-full"
                />
              </div>
              <div className="flex items-end gap-4">
                <div className="w-40">
                  <label className="block text-sm font-medium mb-2">
                    Posts to scan
                  </label>
                  <Select value={limit} onValueChange={setLimit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="200">200 posts</SelectItem>
                      <SelectItem value="300">300 posts</SelectItem>
                      <SelectItem value="500">500 posts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={fetchPosts}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh Results
                </Button>
              </div>
            </div>
          </div>

          {loading && !hasSearched && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">
                Searching Hacker News...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/50 rounded-lg">
              <p className="text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && hasSearched && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No matching posts found. Try different keywords.
              </p>
            </div>
          )}

          {hasSearched && posts.length > 0 && (
            <div className="mb-4 text-sm text-muted-foreground">
              Found {posts.length} matching posts
            </div>
          )}

          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-card rounded-lg border overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeColor(
                            post.type
                          )}`}
                        >
                          {post.type}
                        </span>
                        <span>by {post.by}</span>
                        <span>•</span>
                        <span title={post.time_iso}>{post.time_human}</span>
                      </div>
                      <h3 className="text-lg font-medium mb-2">{post.title}</h3>
                      {post.snippet && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {post.snippet}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Score: {post.score}</span>
                        <span>Comments: {post.descendants}</span>
                      </div>
                      {post.matched_keywords.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.matched_keywords.map((kw) => (
                            <span
                              key={kw}
                              className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 border-t flex items-center gap-3 flex-wrap">
                  <a
                    href={post.hn_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open on HN
                  </a>
                  {post.url !== post.hn_link && (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded text-sm font-medium transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      External Link
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDraftReply(post)}
                    className="gap-1"
                  >
                    Draft Reply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={draftModalOpen} onOpenChange={setDraftModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft Reply</DialogTitle>
          </DialogHeader>
          {draftPost && (
            <div className="text-sm text-muted-foreground mb-2 line-clamp-2">
              Replying to: {draftPost.title}
            </div>
          )}
          {draftLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">
                Generating draft...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                {draftText}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDraftModalOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={copyDraft}
                  disabled={draftError || !draftText}
                  className="gap-2"
                >
                  {copiedDraft ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
