import { useState, useEffect, useCallback } from "react";
import { BookOpen, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchRuns, fetchRules, isUsingMockData } from "@/lib/afr-data";
import type { Run, RuleUpdate } from "@/types/afr";

function ScopeKeySelector({
  scopeKeys,
  selected,
  onSelect,
}: {
  scopeKeys: string[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  if (scopeKeys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No scope keys found.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
        Scope Key
      </label>
      <div className="flex flex-wrap gap-1.5">
        {scopeKeys.map((key) => (
          <Button
            key={key}
            variant={selected === key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSelect(key)}
          >
            {key}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PolicyBundleCard({
  rules,
  scopeKey,
}: {
  rules: RuleUpdate[];
  scopeKey: string | null;
}) {
  const filtered = scopeKey
    ? rules.filter((r) => r.scope === scopeKey && r.status === "active")
    : rules.filter((r) => r.status === "active");

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Effective Policy Bundle
        </h3>
        <p className="text-xs text-muted-foreground">
          No active policies{scopeKey ? ` for scope "${scopeKey}"` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        Effective Policy Bundle
        <span className="ml-2 text-xs text-muted-foreground font-normal">
          ({filtered.length} active)
        </span>
      </h3>
      <div className="space-y-2">
        {filtered.map((rule) => (
          <div
            key={rule.id}
            className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-1"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-snug">{rule.rule_text}</p>
            </div>
            <div className="flex items-center gap-3 pl-5">
              <span className="text-[10px] text-muted-foreground">
                Scope: {rule.scope}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Confidence: {rule.confidence}
              </span>
              {rule.source && (
                <span className="text-[10px] text-muted-foreground">
                  Source: {rule.source}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PolicyHistoryList({ rules }: { rules: RuleUpdate[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...rules].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-sm font-semibold text-foreground">
          Policy History
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            ({sorted.length} versions)
          </span>
        </h3>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {sorted.map((rule, i) => (
            <div
              key={rule.id}
              className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
            >
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5">
                v{sorted.length - i}
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs text-foreground leading-snug truncate">
                  {rule.rule_text}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(rule.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      rule.status === "active"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : rule.status === "disabled"
                        ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    }`}
                  >
                    {rule.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {rule.update_type}
                  </span>
                  {rule.reason && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                      {rule.reason}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleUpdatesList({
  rules,
  onAccept,
  onReject,
}: {
  rules: RuleUpdate[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const active = rules.filter((r) => r.status === "active");
  const [localActions, setLocalActions] = useState<Record<string, "accepted" | "rejected">>({});

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Active Rule Updates
        </h3>
        <p className="text-xs text-muted-foreground">No active rule updates to review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        Active Rule Updates
        <span className="ml-2 text-xs text-muted-foreground font-normal">
          ({active.length} pending review)
        </span>
      </h3>
      <div className="space-y-2">
        {active.map((rule) => {
          const action = localActions[rule.id];
          return (
            <div
              key={rule.id}
              className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-2"
            >
              <p className="text-xs text-foreground leading-snug">{rule.rule_text}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  Scope: {rule.scope}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Confidence: {rule.confidence}
                </span>
                {rule.reason && (
                  <span className="text-[10px] text-muted-foreground">
                    Reason: {rule.reason}
                  </span>
                )}
              </div>
              {action ? (
                <div className="flex items-center gap-1.5">
                  {action === "accepted" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-xs text-muted-foreground capitalize">{action}</span>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900/30"
                    onClick={() => {
                      setLocalActions((prev) => ({ ...prev, [rule.id]: "accepted" }));
                      onAccept(rule.id);
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-red-700 border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/30"
                    onClick={() => {
                      setLocalActions((prev) => ({ ...prev, [rule.id]: "rejected" }));
                      onReject(rule.id);
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutcomeSummary({ runs }: { runs: Run[] }) {
  const recent = runs.slice(0, 20);
  const completed = recent.filter((r) => r.status === "completed");
  const stopped = recent.filter((r) => r.status === "stopped");
  const failed = recent.filter((r) => r.status === "failed");

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Recent Outcome Summary
        <span className="text-xs text-muted-foreground font-normal">
          (last {recent.length} runs)
        </span>
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50 p-3 text-center">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">
            {completed.length}
          </div>
          <div className="text-[10px] text-green-600 dark:text-green-500 uppercase tracking-wide font-medium">
            Delivered
          </div>
        </div>
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 text-center">
          <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
            {stopped.length}
          </div>
          <div className="text-[10px] text-amber-600 dark:text-amber-500 uppercase tracking-wide font-medium">
            Stopped
          </div>
        </div>
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-3 text-center">
          <div className="text-lg font-bold text-red-700 dark:text-red-400">
            {failed.length}
          </div>
          <div className="text-[10px] text-red-600 dark:text-red-500 uppercase tracking-wide font-medium">
            Failed
          </div>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Total requested: {recent.length} | Delivered: {completed.length} (
        {recent.length > 0 ? Math.round((completed.length / recent.length) * 100) : 0}%)
      </div>
    </div>
  );
}

export default function LearningPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [rules, setRules] = useState<RuleUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsData, rulesData] = await Promise.all([
        fetchRuns(50),
        fetchRules(200),
      ]);
      setRuns(runsData);
      setRules(rulesData);

      if (rulesData.length > 0 && !selectedScopeKey) {
        const scopes = [...new Set(rulesData.map((r) => r.scope))];
        if (scopes.length > 0) setSelectedScopeKey(scopes[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load learning data");
    } finally {
      setLoading(false);
    }
  }, [selectedScopeKey]);

  useEffect(() => {
    loadData();
  }, []);

  const scopeKeys = [...new Set(rules.map((r) => r.scope))];

  const handleAcceptRule = (ruleId: string) => {
    // TODO: Wire to backend endpoint when available (e.g. PATCH /api/afr/rules/:id)
    console.log("[Learning] Accept rule:", ruleId);
  };

  const handleRejectRule = (ruleId: string) => {
    // TODO: Wire to backend endpoint when available (e.g. PATCH /api/afr/rules/:id)
    console.log("[Learning] Reject rule:", ruleId);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Learning Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              View and manage learned policies, rules, and run outcomes.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {isUsingMockData() && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              Showing mock data. Set VITE_USE_MOCK_AFR=false to use live data.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {loading && runs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <ScopeKeySelector
            scopeKeys={scopeKeys}
            selected={selectedScopeKey}
            onSelect={setSelectedScopeKey}
          />

          <PolicyBundleCard rules={rules} scopeKey={selectedScopeKey} />

          <PolicyHistoryList rules={rules} />

          <RuleUpdatesList
            rules={rules}
            onAccept={handleAcceptRule}
            onReject={handleRejectRule}
          />

          <OutcomeSummary runs={runs} />
        </div>
      )}
    </div>
  );
}
