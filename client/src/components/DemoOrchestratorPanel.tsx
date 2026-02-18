import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Loader2, CheckCircle2, XCircle } from "lucide-react";

type DemoCase = "clean-success" | "partial" | "stop";

interface DemoButton {
  id: DemoCase;
  label: string;
  description: string;
}

const DEMO_CASES: DemoButton[] = [
  {
    id: "clean-success",
    label: "Clean success",
    description: "All results found and verified.",
  },
  {
    id: "partial",
    label: "Partial delivery",
    description: "Some results found, shortfall reported.",
  },
  {
    id: "stop",
    label: "Intelligent stop",
    description: "Search stopped with a clear reason.",
  },
];

interface DemoRunState {
  running: boolean;
  result: "success" | "error" | null;
  runId?: string | null;
  error?: string | null;
}

export function DemoOrchestratorPanel({ onRunComplete }: { onRunComplete?: (runId: string) => void }) {
  const [states, setStates] = useState<Record<DemoCase, DemoRunState>>({
    "clean-success": { running: false, result: null },
    "partial": { running: false, result: null },
    "stop": { running: false, result: null },
  });

  const triggerDemo = async (demoCase: DemoCase) => {
    setStates(prev => ({ ...prev, [demoCase]: { running: true, result: null } }));

    try {
      const sessionId = localStorage.getItem("wyshbone_sid");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionId) headers["x-session-id"] = sessionId;

      const res = await fetch(`/api/demo/${demoCase}`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Failed");
        setStates(prev => ({ ...prev, [demoCase]: { running: false, result: "error", error: text } }));
        return;
      }

      const data = await res.json().catch(() => ({}));
      const runId = data.run_id || data.runId || null;
      setStates(prev => ({ ...prev, [demoCase]: { running: false, result: "success", runId } }));

      if (runId && onRunComplete) {
        onRunComplete(runId);
      }
    } catch (err: any) {
      setStates(prev => ({ ...prev, [demoCase]: { running: false, result: "error", error: err.message } }));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Demo Scenarios</CardTitle>
        <CardDescription className="text-xs">
          Run preset scenarios to see how results are presented.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {DEMO_CASES.map((demo) => {
          const state = states[demo.id];
          return (
            <div key={demo.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{demo.label}</p>
                <p className="text-xs text-muted-foreground">{demo.description}</p>
                {state.result === "error" && state.error && (
                  <p className="text-[10px] text-red-500 mt-0.5">{state.error}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={state.running}
                onClick={() => triggerDemo(demo.id)}
              >
                {state.running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : state.result === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : state.result === "error" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
