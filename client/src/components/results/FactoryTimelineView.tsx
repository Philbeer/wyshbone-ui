import { cn } from "@/lib/utils";
import { Thermometer, Zap, Wrench, Droplets, AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";

interface FactoryStatePayload {
  step_index?: number;
  scrap_rate_now?: number;
  scrap_floor_percent?: number;
  drift_detected?: boolean;
  drift_reason?: string;
  defect_signals?: string[];
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

function ScrapGauge({ measured, floor }: { measured: number; floor?: number }) {
  const gap = floor != null ? measured - floor : null;
  return (
    <div className="col-span-2 rounded bg-muted/50 px-2.5 py-1.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-orange-500" /> Scrap
        </span>
        {gap != null && gap > 0 && (
          <span className="text-[10px] font-medium text-orange-500">
            {gap.toFixed(1)}pp above floor
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3">
        <div>
          <span className="text-[10px] text-muted-foreground block">Measured</span>
          <span className={cn("font-mono text-sm font-bold", measured > 10 ? "text-red-500" : measured > 5 ? "text-orange-500" : "text-green-600")}>
            {measured}%
          </span>
        </div>
        {floor != null && (
          <div>
            <span className="text-[10px] text-muted-foreground block">Achievable floor</span>
            <span className="font-mono text-sm font-semibold text-muted-foreground">
              {floor}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DriftBanner({ detected, reason }: { detected: boolean; reason?: string }) {
  return (
    <div className={cn(
      "col-span-2 rounded px-2.5 py-1.5 flex items-start gap-2 text-xs",
      detected
        ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        : "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
    )}>
      <Activity className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", detected ? "text-amber-500" : "text-green-500")} />
      <div>
        <span className={cn("font-semibold", detected ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300")}>
          Drift {detected ? "detected" : "none"}
        </span>
        {detected && reason && (
          <p className="text-muted-foreground mt-0.5">{reason}</p>
        )}
      </div>
    </div>
  );
}

function DefectSignals({ signals, legacyType }: { signals?: string[]; legacyType?: string }) {
  const items = signals && signals.length > 0 ? signals : legacyType ? [legacyType] : [];
  if (items.length === 0) return null;
  return (
    <div className="col-span-2 flex items-start gap-1.5">
      <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
      <div>
        <span className="text-[10px] text-muted-foreground block">Defect signals</span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {items.map((s, i) => (
            <span key={i} className="inline-block rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[11px] font-medium px-1.5 py-0.5">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FactoryStateCard({ state }: { state: FactoryStatePayload }) {
  const hasScrap = state.scrap_rate_now != null;
  const hasDrift = state.drift_detected != null;
  const hasDefects = (state.defect_signals && state.defect_signals.length > 0) || !!state.defect_type;
  const hasEnergy = state.energy_kwh_per_good_part != null;

  return (
    <div className="rounded border bg-muted/30 px-3 py-2 space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">World state</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {hasScrap && (
          <ScrapGauge measured={state.scrap_rate_now!} floor={state.scrap_floor_percent} />
        )}

        {hasDrift && (
          <DriftBanner detected={!!state.drift_detected} reason={state.drift_reason} />
        )}

        {hasDefects && (
          <DefectSignals signals={state.defect_signals} legacyType={state.defect_type} />
        )}

        {hasEnergy && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-yellow-500 shrink-0" />
            <div>
              <span className="text-[10px] text-muted-foreground block">Energy per part</span>
              <span className="font-mono font-semibold">{state.energy_kwh_per_good_part} kWh</span>
            </div>
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

export function RunConfigurationView({ payload }: { payload: any }) {
  const p = parsePayload(payload);
  const scenario = p.scenario || {};
  const constraints = p.constraints || {};
  const fields = [
    { label: 'Machines', value: scenario.machines },
    { label: 'Resin type', value: scenario.resin_type },
    { label: 'Tool ID', value: scenario.tool_id },
    { label: 'Resin moisture', value: scenario.resin_moisture },
    { label: 'Ambient temp', value: scenario.ambient_temp_c != null ? `${scenario.ambient_temp_c}°C` : undefined },
    { label: 'Energy band', value: scenario.energy_price_band },
    { label: 'Max scrap %', value: constraints.max_scrap_percent != null ? `${constraints.max_scrap_percent}%` : undefined },
  ].filter(f => f.value != null);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Wrench className="h-3 w-3" /> Run Configuration
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {fields.map(f => (
          <div key={f.label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{f.label}</span>
            <span className="font-medium">{f.value}</span>
          </div>
        ))}
      </div>
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
