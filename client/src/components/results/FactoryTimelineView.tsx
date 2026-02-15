import { cn } from "@/lib/utils";
import { Thermometer, Zap, Wrench, Droplets, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface FactoryStatePayload {
  step_index?: number;
  scrap_rate_now?: number;
  defect_type?: string;
  energy_kwh_per_good_part?: number;
  tool_id?: string;
  resin_moisture?: string;
  ambient_temp?: number;
  [key: string]: any;
}

interface FactoryDecisionPayload {
  decision?: string;
  reason?: string;
  [key: string]: any;
}

interface TowerJudgementPayload {
  verdict?: string;
  reason?: string;
  [key: string]: any;
}

interface TimelineStep {
  step_index: number;
  factory_state?: FactoryStatePayload;
  factory_decision?: FactoryDecisionPayload;
  tower_judgement?: TowerJudgementPayload;
}

function parsePayload(raw: any): any {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw ?? {};
}

function FactoryStateCard({ state }: { state: FactoryStatePayload }) {
  return (
    <div className="rounded border bg-muted/30 px-3 py-2 space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Factory state</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {state.scrap_rate_now != null && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />
            <span className="text-muted-foreground">Scrap:</span>
            <span className={cn("font-mono font-semibold", state.scrap_rate_now > 10 ? "text-red-500" : state.scrap_rate_now > 5 ? "text-orange-500" : "text-green-600")}>
              {state.scrap_rate_now}%
            </span>
          </div>
        )}
        {state.defect_type && (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-muted-foreground">Defect:</span>
            <span className="font-medium">{state.defect_type}</span>
          </div>
        )}
        {state.energy_kwh_per_good_part != null && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-yellow-500 shrink-0" />
            <span className="text-muted-foreground">Energy:</span>
            <span className="font-mono">{state.energy_kwh_per_good_part} kWh/part</span>
          </div>
        )}
        {state.tool_id && (
          <div className="flex items-center gap-1.5">
            <Wrench className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="text-muted-foreground">Tool:</span>
            <span className="font-mono">{state.tool_id}</span>
          </div>
        )}
        {state.resin_moisture && (
          <div className="flex items-center gap-1.5">
            <Droplets className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="text-muted-foreground">Moisture:</span>
            <span>{state.resin_moisture}</span>
          </div>
        )}
        {state.ambient_temp != null && (
          <div className="flex items-center gap-1.5">
            <Thermometer className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-muted-foreground">Temp:</span>
            <span className="font-mono">{state.ambient_temp}°C</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FactoryDecisionCard({ decision }: { decision: FactoryDecisionPayload }) {
  return (
    <div className="rounded border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 px-3 py-2 space-y-0.5">
      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Decision</p>
      {decision.decision && (
        <p className="text-sm font-semibold text-foreground">{decision.decision}</p>
      )}
      {decision.reason && (
        <p className="text-xs text-muted-foreground">{decision.reason}</p>
      )}
    </div>
  );
}

function TowerBadge({ judgement }: { judgement: TowerJudgementPayload }) {
  const verdict = (judgement.verdict || "").toLowerCase();
  const isAccept = verdict === "accept";
  return (
    <div className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
      isAccept
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    )}>
      {isAccept ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      Tower: {judgement.verdict || "unknown"}
    </div>
  );
}

export function FactoryStateView({ payload }: { payload: any }) {
  const p = parsePayload(payload);
  return <FactoryStateCard state={p} />;
}

export function FactoryDecisionView({ payload }: { payload: any }) {
  const p = parsePayload(payload);
  return <FactoryDecisionCard decision={p} />;
}

export default function FactoryTimelineView({ artefacts }: { artefacts: Array<{ type: string; payload_json: any; created_at?: string }> }) {
  const steps = new Map<number, TimelineStep>();

  for (const a of artefacts) {
    const p = parsePayload(a.payload_json);
    const stepIdx = p.step_index ?? 0;

    if (!steps.has(stepIdx)) {
      steps.set(stepIdx, { step_index: stepIdx });
    }
    const step = steps.get(stepIdx)!;

    if (a.type === "factory_state") {
      step.factory_state = p;
    } else if (a.type === "factory_decision") {
      step.factory_decision = p;
    } else if (a.type === "tower_judgement") {
      step.tower_judgement = p;
    }
  }

  const sorted = Array.from(steps.values()).sort((a, b) => a.step_index - b.step_index);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No factory steps to display.</p>;
  }

  return (
    <div className="space-y-3">
      {sorted.map(step => (
        <div key={step.step_index} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Step {step.step_index}</p>
          {step.factory_state && <FactoryStateCard state={step.factory_state} />}
          {step.factory_decision && <FactoryDecisionCard decision={step.factory_decision} />}
          {step.tower_judgement && (
            <div className="pl-1">
              <TowerBadge judgement={step.tower_judgement} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
