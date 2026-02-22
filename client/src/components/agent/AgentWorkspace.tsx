import { useState, useCallback } from "react";
import { 
  TrendingUp, 
  Zap,
  Target,
  Mail,
  Calendar,
  Play,
  FileText,
  Loader2,
  Copy,
  Check,
  X,
  ChevronDown,
  Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LiveActivityPanel } from "@/components/live-activity-panel";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";
import { buildApiUrl, addDevAuthParams } from "@/lib/queryClient";
import { isDemoMode } from "@/hooks/useDemoMode";
import InjectionMouldingDemo from "@/components/demos/InjectionMouldingDemo";
import type { MouldingScenario, FactoryPayload } from "@/components/demos/InjectionMouldingDemo";

const IS_DEV = import.meta.env.DEV;

interface AgentWorkspaceProps {
  className?: string;
}

export function AgentWorkspace({ className }: AgentWorkspaceProps) {
  const { currentClientRequestId, setCurrentClientRequestId, pinnedClientRequestId, setPinnedClientRequestId, lastCompletedClientRequestId } = useCurrentRequest();
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofV2Loading, setProofV2Loading] = useState(false);
  const [proofV2Ids, setProofV2Ids] = useState<{ crid: string; runId: string } | null>(null);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainReport, setExplainReport] = useState<string | null>(null);
  const [explainRunId, setExplainRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleRunSupervisorDemo() {
    setDemoLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/debug/demo-plan-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Following ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleProofTowerLoop() {
    setProofLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/proof/tower-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Proof run: ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setProofLoading(false);
    }
  }

  async function handleProofTowerLoopV2() {
    setProofV2Loading(true);
    setDemoStatus(null);
    setProofV2Ids(null);
    try {
      const res = await fetch("/api/proof/tower-loop-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setProofV2Ids({ crid: id, runId: data.runId });
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Proof v2 run: ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setProofV2Loading(false);
    }
  }

  const resolvedClientRequestId = pinnedClientRequestId ?? currentClientRequestId ?? lastCompletedClientRequestId;

  const handleExplainRun = useCallback(async () => {
    setExplainOpen(true);
    setExplainLoading(true);
    setExplainError(null);
    setExplainReport(null);
    setExplainRunId(null);
    setCopied(false);

    try {
      const body: Record<string, string> = {};
      if (resolvedClientRequestId) {
        body.client_request_id = resolvedClientRequestId;
      } else {
        body.latest = "true";
      }
      const url = addDevAuthParams(buildApiUrl("/api/dev/explain-run"));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `Server responded ${res.status}`);
      }
      const data = await res.json();
      setExplainRunId(data.runId || null);
      setExplainReport(data.report_markdown || "No report generated.");
    } catch (err: any) {
      setExplainError(err.message || "Failed to generate explanation");
    } finally {
      setExplainLoading(false);
    }
  }, [resolvedClientRequestId]);

  const handleCopy = useCallback(() => {
    if (!explainReport) return;
    navigator.clipboard.writeText(explainReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [explainReport]);

  const activitySummary = {
    leadsFound: 0,
    emailsSent: 0,
    meetingsBooked: 0,
    successRate: 0,
  };


  return (
    <div className={cn("flex flex-col flex-1 min-h-0 h-full", className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Agent Activity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              What your AI sales agent has been working on
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              24/7 Active
            </Badge>
          </div>
        </div>
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 group/tools">
              <Wrench className="w-3 h-3" />
              <span>Tools</span>
              <ChevronDown className="w-3 h-3 transition-transform group-data-[state=open]/tools:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExplainRun}
                disabled={explainLoading}
                title="Generate a plain-English explanation of the last run"
                className="border-2 border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 disabled:opacity-60"
              >
                {explainLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                {explainLoading ? "Explaining…" : "Explain last run"}
              </Button>
              {IS_DEV && isDemoMode() && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRunSupervisorDemo}
                    disabled={demoLoading}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    {demoLoading ? "Starting…" : "Run Supervisor Demo"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleProofTowerLoop}
                    disabled={proofLoading}
                    className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    {proofLoading ? "Starting…" : "Proof: Tower Loop"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleProofTowerLoopV2}
                    disabled={proofV2Loading}
                    className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    {proofV2Loading ? "Starting…" : "Proof: Tower Loop v2 (REAL)"}
                  </Button>
                </>
              )}
            </div>
            {IS_DEV && isDemoMode() && demoStatus && (
              <p className="text-xs text-muted-foreground mt-2">{demoStatus}</p>
            )}
            {IS_DEV && isDemoMode() && proofV2Ids && (
              <div className="mt-2 text-[10px] font-mono bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1">
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">v2 IDs</span>
                {" "}crid=<span className="select-all">{proofV2Ids.crid}</span>
                {" "}runId=<span className="select-all">{proofV2Ids.runId}</span>
              </div>
            )}
            {IS_DEV && isDemoMode() && (
              <div className="mt-3">
                <InjectionMouldingDemo onRun={(scenario, factory) => {
                  window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", {
                    detail: {
                      message: "run the injection moulding demo",
                      metadata: {
                        demo: "injection_moulding",
                        scenario,
                        constraints: {
                          max_scrap_percent: Number(factory.constraints.max_scrap_percent),
                        },
                        factory,
                      },
                      autoSend: true,
                    },
                  }));
                }} />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Live Activity Panel - fills available height, scrolls internally */}
      <div className="flex-1 min-h-0 flex flex-col p-6 pb-3">
        {(() => {
          return <LiveActivityPanel key={resolvedClientRequestId ?? 'none'} activeClientRequestId={resolvedClientRequestId} />;
        })()}
      </div>

      {/* Activity Metrics - fixed height footer section */}
      <div className="flex-shrink-0 overflow-x-auto px-6 pb-6">
          {/* Activity Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.leadsFound}
                    </div>
                    <div className="text-xs text-muted-foreground">Leads Found</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border-chart-2/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-2/20">
                    <Mail className="w-5 h-5 text-chart-2" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.emailsSent}
                    </div>
                    <div className="text-xs text-muted-foreground">Emails Sent</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border-chart-3/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-3/20">
                    <Calendar className="w-5 h-5 text-chart-3" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.meetingsBooked}
                    </div>
                    <div className="text-xs text-muted-foreground">Meetings Booked</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-4/20">
                    <TrendingUp className="w-5 h-5 text-chart-4" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.successRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
      </div>

      {/* Explain Run Modal */}
      <ExplainRunModal
        open={explainOpen}
        onOpenChange={setExplainOpen}
        loading={explainLoading}
        error={explainError}
        report={explainReport}
        runId={explainRunId}
        onCopy={handleCopy}
        copied={copied}
      />
    </div>
  );
}

function ExplainRunModal({
  open,
  onOpenChange,
  loading,
  error,
  report,
  runId,
  onCopy,
  copied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  report: string | null;
  runId: string | null;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Run Explanation
          </DialogTitle>
          <DialogDescription>
            {runId ? (
              <span className="font-mono text-[10px]">runId: {runId}</span>
            ) : (
              "Generating explanation..."
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-muted-foreground">Analysing run data and generating report...</p>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
            <div className="flex items-start gap-2">
              <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Failed to generate explanation</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {report && !loading && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <MarkdownReport content={report} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MarkdownReport({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-base font-semibold text-foreground mt-4 mb-2 first:mt-0">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-lg font-bold text-foreground mt-4 mb-2 first:mt-0">
          {trimmed.slice(2)}
        </h1>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-1 my-0.5">
          <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0 w-5 text-right">{trimmed.match(/^(\d+)\./)?.[1]}.</span>
          <span className="text-sm text-foreground/90">{renderInlineMarkdown(trimmed.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-muted-foreground mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-current" />
          <span className="text-sm text-foreground/90">{renderInlineMarkdown(trimmed.slice(2))}</span>
        </div>
      );
    } else if (trimmed === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-foreground/90 my-0.5">{renderInlineMarkdown(trimmed)}</p>
      );
    }
  }

  return <div className="space-y-0">{elements}</div>;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<code key={match.index} className="text-[11px] font-mono bg-muted px-1 py-0.5 rounded">{match[2]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

export default AgentWorkspace;
