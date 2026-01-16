import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Copy, Check, RefreshCw, Loader2, Eye, EyeOff, CheckCircle, Undo2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  "ai",
  "agent",
  "crm",
  "sales",
  "saas",
  "outreach",
  "prospecting",
  "lead",
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
  relevance_score: number;
  relevance_label: "High" | "Medium" | "Low";
  is_done: boolean;
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
  const [hideDone, setHideDone] = useState(true);
  const [showOnlyDone, setShowOnlyDone] = useState(false);
  const [sortBy, setSortBy] = useState<"relevance" | "score" | "time">("relevance");

  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPost, setDraftPost] = useState<HNPost | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [draftError, setDraftError] = useState(false);

  const [togglingDone, setTogglingDone] = useState<Set<number>>(new Set());

  const [savedDrafts, setSavedDrafts] = useState<Map<number, string>>(new Map());
  const [claudePromptModalOpen, setClaudePromptModalOpen] = useState(false);
  const [claudePromptText, setClaudePromptText] = useState("");
  const [claudePromptError, setClaudePromptError] = useState<string | null>(null);
  const [copiedClaudePrompt, setCopiedClaudePrompt] = useState(false);
  const [claudePromptLoading, setClaudePromptLoading] = useState(false);

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

  const toggleDone = async (post: HNPost) => {
    if (togglingDone.has(post.id)) return;

    setTogglingDone(prev => new Set(prev).add(post.id));

    try {
      const endpoint = post.is_done
        ? '/api/hn/undo'
        : '/api/hn/done';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: post.id }),
      });

      if (res.ok) {
        setPosts(prevPosts =>
          prevPosts.map(p =>
            p.id === post.id
              ? { ...p, is_done: !p.is_done }
              : p
          )
        );
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to update done status');
      }
    } catch (err) {
      console.error('Failed to toggle done status:', err);
      setError('Failed to update done status');
    } finally {
      setTogglingDone(prev => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  };

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
          relevance_score: post.relevance_score || 0,
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
        setSavedDrafts(prev => new Map(prev).set(post.id, data.draft));
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

  const generateClaudePrompt = async () => {
    setClaudePromptLoading(true);
    setClaudePromptError(null);

    const unrepliedPosts = posts
      .filter(p => !p.is_done)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 2);

    if (unrepliedPosts.length < 2) {
      setClaudePromptError("Not enough unreplied threads available.");
      setClaudePromptText("");
      setClaudePromptModalOpen(true);
      setClaudePromptLoading(false);
      return;
    }

    const thread1 = unrepliedPosts[0];
    const thread2 = unrepliedPosts[1];

    const generateDraftForPost = async (post: HNPost): Promise<string | null> => {
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
            relevance_score: post.relevance_score || 0,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.draft) {
          console.error(`Draft generation failed for post ${post.id}:`, data);
          return null;
        }
        return data.draft;
      } catch (err) {
        console.error(`Draft generation error for post ${post.id}:`, err);
        return null;
      }
    };

    const [draft1, draft2] = await Promise.all([
      generateDraftForPost(thread1),
      generateDraftForPost(thread2),
    ]);

    if (!draft1 || !draft2) {
      setClaudePromptError("Failed to generate drafts for the top 2 threads. Please try again.");
      setClaudePromptText("");
      setClaudePromptModalOpen(true);
      setClaudePromptLoading(false);
      return;
    }

    setSavedDrafts(prev => {
      const next = new Map(prev);
      next.set(thread1.id, draft1);
      next.set(thread2.id, draft2);
      return next;
    });

    const prompt = `You are Claude Chrome with full browser access.

GOAL
Post two Hacker News replies using my already logged-in HN account.

You MUST follow the instructions exactly.
Do NOT rewrite, improve, shorten, or expand the draft replies.
Do NOT add links, signatures, or extra commentary.

PRECONDITIONS
- I am already logged into Hacker News in this browser.
- Do NOT log out or switch accounts.
- Do NOT open more than the two threads listed below.

GENERAL RULES
- Paste the draft replies EXACTLY as provided.
- Submit one comment per thread.
- After submitting the second comment, STOP.

────────────────────────────────
THREAD 1
────────────────────────────────

URL:
${thread1.hn_link}

INSTRUCTIONS:
1) Open the URL.
2) Scroll to the comment box.
3) Paste the draft reply below verbatim.
4) Submit the comment.
5) Do NOT edit after submission.

DRAFT REPLY:
${draft1}

────────────────────────────────
THREAD 2
────────────────────────────────

URL:
${thread2.hn_link}

INSTRUCTIONS:
1) Open the URL.
2) Scroll to the comment box.
3) Paste the draft reply below verbatim.
4) Submit the comment.
5) Do NOT edit after submission.

DRAFT REPLY:
${draft2}

────────────────────────────────
STOP CONDITION
────────────────────────────────

After submitting the second reply:
- Do NOT open any additional pages
- Do NOT post additional comments
- Stop execution immediately`;

    setClaudePromptError(null);
    setClaudePromptText(prompt);
    setClaudePromptModalOpen(true);
    setClaudePromptLoading(false);
  };

  const copyClaudePrompt = async () => {
    await navigator.clipboard.writeText(claudePromptText);
    setCopiedClaudePrompt(true);
    setTimeout(() => setCopiedClaudePrompt(false), 2000);
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

  const getRelevanceBadgeColor = (label: string) => {
    switch (label) {
      case "High":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
      case "Medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "Low":
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  const filteredPosts = posts.filter(post => {
    if (showOnlyDone) {
      return post.is_done === true;
    }
    if (hideDone) {
      return post.is_done === false;
    }
    return true;
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    switch (sortBy) {
      case "score":
        return b.score - a.score;
      case "time":
        return new Date(b.time_iso).getTime() - new Date(a.time_iso).getTime();
      case "relevance":
      default:
        return b.relevance_score - a.relevance_score;
    }
  });

  const doneCount = posts.filter(p => p.is_done).length;
  const notDoneCount = posts.filter(p => !p.is_done).length;

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
              <div className="flex items-end gap-4 flex-wrap">
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
                <div className="w-40">
                  <label className="block text-sm font-medium mb-2">
                    Sort by
                  </label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="score">HN Score</SelectItem>
                      <SelectItem value="time">Newest</SelectItem>
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
              
              <div className="flex items-center gap-6 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hide-done"
                    checked={hideDone}
                    onCheckedChange={(checked) => {
                      setHideDone(checked === true);
                      if (checked) setShowOnlyDone(false);
                    }}
                    disabled={showOnlyDone}
                  />
                  <Label htmlFor="hide-done" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <EyeOff className="h-4 w-4" />
                    Hide done ({doneCount})
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-only-done"
                    checked={showOnlyDone}
                    onCheckedChange={(checked) => {
                      setShowOnlyDone(checked === true);
                      if (checked) setHideDone(false);
                    }}
                  />
                  <Label htmlFor="show-only-done" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <Eye className="h-4 w-4" />
                    Show only done ({doneCount})
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 mb-4 bg-destructive/10 border border-destructive/50 rounded-lg">
              <p className="text-destructive">{error}</p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setError(null)}
                className="mt-2"
              >
                Dismiss
              </Button>
            </div>
          )}

          {loading && !hasSearched && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">
                Searching Hacker News...
              </p>
            </div>
          )}

          {!loading && !error && hasSearched && sortedPosts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {showOnlyDone && doneCount === 0
                  ? "No done posts yet. Mark some posts as done to see them here."
                  : posts.length > 0 && hideDone
                  ? `All ${posts.length} posts are marked done. Toggle "Hide done" off or use "Show only done" to see them.`
                  : "No matching posts found. Try different keywords."}
              </p>
            </div>
          )}

          {hasSearched && sortedPosts.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {sortedPosts.length} of {posts.length} posts
                {showOnlyDone 
                  ? ` (showing only ${doneCount} done)`
                  : hideDone && doneCount > 0 
                  ? ` (${doneCount} done hidden)`
                  : ''}
                {savedDrafts.size > 0 && (
                  <span className="ml-2 text-primary">
                    ({savedDrafts.size} draft{savedDrafts.size !== 1 ? 's' : ''} generated)
                  </span>
                )}
              </div>
              <Button
                onClick={generateClaudePrompt}
                variant="outline"
                className="gap-2"
                disabled={claudePromptLoading}
              >
                {claudePromptLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating drafts...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate & Post Prompt (Top 2)
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {sortedPosts.map((post) => (
              <div
                key={post.id}
                className={`bg-card rounded-lg border overflow-hidden transition-opacity ${
                  post.is_done ? 'opacity-60' : ''
                }`}
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
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${getRelevanceBadgeColor(
                            post.relevance_label
                          )}`}
                        >
                          {post.relevance_score} - {post.relevance_label}
                        </span>
                        {post.is_done && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Done
                          </span>
                        )}
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
                  <Button
                    variant={post.is_done ? "ghost" : "default"}
                    size="lg"
                    onClick={() => toggleDone(post)}
                    disabled={togglingDone.has(post.id)}
                    className={`gap-2 ml-auto font-semibold ${
                      post.is_done
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'bg-primary hover:bg-primary/90'
                    }`}
                  >
                    {togglingDone.has(post.id) ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : post.is_done ? (
                      <>
                        <Undo2 className="h-5 w-5" />
                        Undo
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Mark as Done
                      </>
                    )}
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

      <Dialog open={claudePromptModalOpen} onOpenChange={setClaudePromptModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Claude Chrome Posting Prompt
            </DialogTitle>
          </DialogHeader>
          {claudePromptError ? (
            <div className="py-8 text-center">
              <p className="text-destructive">{claudePromptError}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy this prompt and paste it into Claude Chrome to post the top 2 replies automatically.
              </p>
              <textarea
                readOnly
                value={claudePromptText}
                className="w-full h-80 p-4 bg-muted rounded-lg text-sm font-mono resize-none border-0 focus:ring-0"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setClaudePromptModalOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={copyClaudePrompt}
                  className="gap-2"
                >
                  {copiedClaudePrompt ? (
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
