export interface PolicyApplied {
  learned_used: boolean;
  final_policy: {
    result_count?: number;
    verification_level?: string;
    search_budget_pages?: number;
    radius_escalation?: boolean | string;
    [key: string]: any;
  };
  knob_sources?: Record<string, "default" | "user_override" | "learned">;
  source_run_ids?: string[];
}

export interface LearningDelta {
  field: string;
  before: string | number | boolean;
  after: string | number | boolean;
}

export interface LearningUpdate {
  query_shape_key: string;
  changed_fields: LearningDelta[];
  tower_reason: string;
  metrics_trigger?: {
    metric: string;
    threshold?: number;
    actual?: number;
    direction?: string;
    [key: string]: any;
  };
}

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  default: {
    label: "default",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  user_override: {
    label: "user override",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  learned: {
    label: "learned",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

export function getSourceBadge(source: string) {
  return SOURCE_LABELS[source] || SOURCE_LABELS.default;
}

const POLICY_KNOB_LABELS: Record<string, string> = {
  result_count: "Result count",
  verification_level: "Verification level",
  search_budget_pages: "Search budget (pages)",
  radius_escalation: "Radius escalation",
};

export function getPolicyKnobLabel(key: string): string {
  return POLICY_KNOB_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function formatPolicyValue(value: any): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null) return "—";
  return String(value);
}

export function formatMetricsTrigger(trigger: LearningUpdate["metrics_trigger"]): string {
  if (!trigger) return "";
  const parts: string[] = [];
  if (trigger.metric) parts.push(trigger.metric.replace(/_/g, " "));
  if (trigger.actual != null && trigger.threshold != null) {
    const dir = trigger.direction === "above" ? ">" : trigger.direction === "below" ? "<" : "→";
    parts.push(`${trigger.actual} ${dir} ${trigger.threshold}`);
  } else if (trigger.actual != null) {
    parts.push(`actual: ${trigger.actual}`);
  }
  return parts.join(" · ");
}

export function parsePolicyApplied(payload: any): PolicyApplied | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.learned_used !== "boolean") return null;
  return {
    learned_used: payload.learned_used,
    final_policy: payload.final_policy || {},
    knob_sources: payload.knob_sources || {},
    source_run_ids: Array.isArray(payload.source_run_ids) ? payload.source_run_ids : [],
  };
}

export interface SearchQueryCompiled {
  interpreted_query: string;
  interpreted_location: string;
  requested_count: number | null;
  final_returned_count: number | null;
  radius_escalated: boolean;
  pages_budget_used: number | null;
  query_broadened?: boolean;
  stop_reason: string | null;
}

export function parseSearchQueryCompiled(payload: any): SearchQueryCompiled | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.interpreted_query !== "string" && typeof payload.interpreted_location !== "string") return null;
  return {
    interpreted_query: payload.interpreted_query || "",
    interpreted_location: payload.interpreted_location || "",
    requested_count: typeof payload.requested_count === "number" ? payload.requested_count : null,
    final_returned_count: typeof payload.final_returned_count === "number" ? payload.final_returned_count : null,
    radius_escalated: !!payload.radius_escalated,
    pages_budget_used: typeof payload.pages_budget_used === "number" ? payload.pages_budget_used : null,
    query_broadened: !!payload.query_broadened,
    stop_reason: typeof payload.stop_reason === "string" ? payload.stop_reason : null,
  };
}

export function buildCleanConfidenceText(sqc: SearchQueryCompiled): string {
  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const parts: string[] = ["Searching for"];
  if (sqc.requested_count) parts.push(String(sqc.requested_count));
  parts.push(sqc.interpreted_query || "businesses");
  if (sqc.interpreted_location) parts.push(`in ${titleCase(sqc.interpreted_location)}`);
  return parts.join(" ") + ".";
}

export function parseLearningUpdate(payload: any): LearningUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  if (!payload.query_shape_key || !Array.isArray(payload.changed_fields)) return null;
  return {
    query_shape_key: payload.query_shape_key,
    changed_fields: payload.changed_fields.map((f: any) => ({
      field: f.field || f.name || "unknown",
      before: f.before ?? f.old ?? "—",
      after: f.after ?? f.new ?? "—",
    })),
    tower_reason: payload.tower_reason || "",
    metrics_trigger: payload.metrics_trigger || undefined,
  };
}
