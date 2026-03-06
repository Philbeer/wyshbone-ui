import { cn } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion, FileText, ExternalLink, AlertCircle } from "lucide-react";

export interface CvlConstraint {
  id: string;
  kind: string;
  hardness?: "hard" | "soft" | string;
  field: string;
  op: string;
  value: any;
  label?: string;
}

export interface ConstraintsExtractedPayload {
  requested_count_user?: number | null;
  constraints?: CvlConstraint[];
}

export interface ConstraintResult {
  constraint_id: string;
  status: "yes" | "no" | "unknown";
}

export interface VerificationSummaryPayload {
  verified_exact_count?: number | null;
  requested_count_user?: number | null;
  constraint_results?: ConstraintResult[];
  budget_used?: number | null;
  budget_total?: number | null;
}

export interface VerificationEvidenceItem {
  id: string;
  lead_id?: string;
  constraint_id: string;
  snippet: string;
  source_type?: string;
  source_ref?: string;
}

export interface VerificationEvidencePayload {
  evidence?: VerificationEvidenceItem[];
}

export interface LeadConstraintCheck {
  constraint_id: string;
  status: "yes" | "no" | "unknown";
  evidence_ids?: string[];
}

export interface LeadVerificationEntry {
  lead_id: string;
  constraint_checks?: LeadConstraintCheck[];
}

export interface LeadVerificationPayload {
  leads?: LeadVerificationEntry[];
}

export interface SemanticJudgementEntry {
  lead_id: string;
  lead_name?: string;
  tower_status: string;
  confidence: number;
  attribute_evidence?: {
    verdict: string;
    snippets?: string[];
  };
}

function parsePayload(payload: any): any {
  if (typeof payload === "string") {
    try { return JSON.parse(payload); } catch { return payload; }
  }
  return payload;
}

function formatConstraintLabel(c: CvlConstraint): string {
  const fieldLabels: Record<string, string> = {
    count: 'Count',
    location: 'Location',
    entity_type: 'Business type',
    business_type: 'Business type',
    attribute: 'Attribute',
    radius: 'Radius',
    category: 'Category',
  };
  const fieldLabel = fieldLabels[(c.field || '').toLowerCase()] || (c.field ? c.field.charAt(0).toUpperCase() + c.field.slice(1) : c.kind || 'Constraint');
  if (c.value != null && c.value !== '') {
    return `${fieldLabel}: ${c.value}`;
  }
  return fieldLabel;
}

function StatusBadge({ status }: { status: "yes" | "no" | "unknown" | string }) {
  const config: Record<string, { label: string; className: string; icon: typeof ShieldCheck }> = {
    yes: { label: "Verified", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200", icon: ShieldCheck },
    search_bounded: { label: "Verified (search bounded)", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200", icon: ShieldCheck },
    exact: { label: "Verified (exact)", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200", icon: ShieldCheck },
    no: { label: "Not met", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200", icon: ShieldAlert },
    unknown: { label: "Not verified", className: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400", icon: ShieldQuestion },
  };
  const c = config[status] || config.unknown;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// Constraint hardness must come from backend artefacts — do not default.
function HardnessBadge({ hardness }: { hardness?: "hard" | "soft" | string }) {
  const normalized = (hardness || '').toLowerCase().trim();
  const isHard = normalized === 'hard';
  const isSoft = normalized === 'soft';
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
      isHard
        ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
        : isSoft
          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          : "bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400"
    )}>
      {isHard ? "Hard" : isSoft ? "Soft" : (hardness || "Unknown")}
    </span>
  );
}

export function ConstraintsExtractedView({ payload }: { payload: any }) {
  const parsed: ConstraintsExtractedPayload = parsePayload(payload) || {};
  const constraints = Array.isArray(parsed.constraints) ? parsed.constraints : [];

  if (constraints.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No constraints extracted.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {parsed.requested_count_user != null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>User requested: <span className="font-semibold text-foreground">{parsed.requested_count_user}</span></span>
        </div>
      )}
      <div className="rounded border divide-y">
        {constraints.map((c) => (
          <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-xs">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {c.label || formatConstraintLabel(c)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {c.kind}{c.field ? ` · ${c.field}` : ''}{c.op ? ` ${c.op}` : ''} {String(c.value)}
              </p>
            </div>
            <HardnessBadge hardness={c.hardness} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConstraintCapabilityCheckView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload) || {};
  const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
  const summary = parsed.summary || null;

  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
      )}
      {checks.length > 0 ? (
        <div className="rounded border divide-y">
          {checks.map((check: any, i: number) => (
            <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{check.constraint_id || check.label || `Check ${i + 1}`}</p>
                {check.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{check.reason}</p>}
              </div>
              <StatusBadge status={check.capable ? "yes" : check.capable === false ? "no" : "unknown"} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground py-4 text-center">
          No capability checks available.
        </div>
      )}
    </div>
  );
}

export function VerificationSummaryView({ payload }: { payload: any }) {
  const parsed: VerificationSummaryPayload = parsePayload(payload) || {};
  const results = Array.isArray(parsed.constraint_results) ? parsed.constraint_results : [];

  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        {parsed.verified_exact_count != null && (
          <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Verified</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5">{parsed.verified_exact_count}</p>
          </div>
        )}
        {parsed.requested_count_user != null && (
          <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Requested</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{parsed.requested_count_user}</p>
          </div>
        )}
      </div>

      {parsed.budget_used != null && parsed.budget_total != null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Verification budget: {parsed.budget_used} / {parsed.budget_total} used</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Per-constraint status</p>
          <div className="rounded border divide-y">
            {results.map((r) => (
              <div key={r.constraint_id} className="px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{r.constraint_id}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function VerificationEvidenceView({ payload }: { payload: any }) {
  const parsed: VerificationEvidencePayload = parsePayload(payload) || {};
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];

  if (evidence.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No verification evidence available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {evidence.map((e) => (
        <div key={e.id} className="rounded border px-3 py-2 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground truncate">
              Constraint: {e.constraint_id}
            </span>
            {e.source_type && (
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                {e.source_type}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed pl-5">
            &ldquo;{e.snippet}&rdquo;
          </p>
          {e.source_ref && (
            <div className="flex items-center gap-1 pl-5 text-[10px] text-muted-foreground">
              <ExternalLink className="h-2.5 w-2.5" />
              <span className="truncate max-w-[300px]">{e.source_ref}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function LeadVerificationView({ payload }: { payload: any }) {
  const parsed: LeadVerificationPayload = parsePayload(payload) || {};
  const leads = Array.isArray(parsed.leads) ? parsed.leads : [];

  if (leads.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No per-lead verification data available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => {
        const checks = Array.isArray(lead.constraint_checks) ? lead.constraint_checks : [];
        return (
          <div key={lead.lead_id} className="rounded border px-3 py-2 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{lead.lead_id}</p>
            {checks.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {checks.map((ck) => (
                  <div key={ck.constraint_id} className="flex items-center gap-1 text-[10px]">
                    <span className="text-muted-foreground">{ck.constraint_id}:</span>
                    <StatusBadge status={ck.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">No constraint checks</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ConstraintsSectionInline({
  constraintsPayload,
  verificationPayload,
}: {
  constraintsPayload: any;
  verificationPayload?: any;
}) {
  const parsed: ConstraintsExtractedPayload = parsePayload(constraintsPayload) || {};
  const vParsed: VerificationSummaryPayload | null = verificationPayload ? parsePayload(verificationPayload) : null;
  const constraints = Array.isArray(parsed.constraints) ? parsed.constraints : [];

  if (constraints.length === 0) return null;

  const statusMap = new Map<string, string>();
  if (vParsed?.constraint_results) {
    for (const r of vParsed.constraint_results) {
      statusMap.set(r.constraint_id, r.status);
    }
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Constraints
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Requirements extracted from your request.
        </p>
      </div>
      <div className="rounded-lg border divide-y">
        {constraints.map((c) => {
          const status = statusMap.get(c.id);
          return (
            <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">
                  {c.label || formatConstraintLabel(c)}
                </p>
              </div>
              <HardnessBadge hardness={c.hardness} />
              {status ? <StatusBadge status={status} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function VerificationSectionInline({
  verificationPayload,
  evidencePayload,
}: {
  verificationPayload: any;
  evidencePayload?: any;
}) {
  const parsed: VerificationSummaryPayload = parsePayload(verificationPayload) || {};
  const eParsed: VerificationEvidencePayload | null = evidencePayload ? parsePayload(evidencePayload) : null;
  const results = Array.isArray(parsed.constraint_results) ? parsed.constraint_results : [];
  const evidence = eParsed && Array.isArray(eParsed.evidence) ? eParsed.evidence : [];

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verification
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          How results were checked against your constraints.
        </p>
      </div>

      <div className="flex gap-4">
        {parsed.verified_exact_count != null && (
          <div className="flex-1 rounded-lg border bg-green-50/50 dark:bg-green-900/10 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Verified</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-0.5">{parsed.verified_exact_count}</p>
          </div>
        )}
        {parsed.requested_count_user != null && (
          <div className="flex-1 rounded-lg border bg-muted/30 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Requested</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{parsed.requested_count_user}</p>
          </div>
        )}
      </div>

      {parsed.budget_used != null && parsed.budget_total != null && (
        <p className="text-xs text-muted-foreground">
          Verification budget: {parsed.budget_used} / {parsed.budget_total} used
        </p>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border divide-y">
          {results.map((r) => {
            const matchingEvidence = evidence.filter(e => e.constraint_id === r.constraint_id);
            return (
              <div key={r.constraint_id} className="px-3 py-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{r.constraint_id}</span>
                  <StatusBadge status={r.status} />
                </div>
                {matchingEvidence.length > 0 ? (
                  <div className="pl-2 space-y-1">
                    {matchingEvidence.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <FileText className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                        <span>&ldquo;{ev.snippet}&rdquo;</span>
                        {ev.source_type && (
                          <span className="px-1 py-0.5 bg-muted rounded shrink-0">{ev.source_type}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 pl-2">Not verified</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
