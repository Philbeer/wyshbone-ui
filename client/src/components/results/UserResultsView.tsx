import { MapPin, Phone, Globe, Info, CheckCircle2, CircleDot, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConstraintsSectionInline, VerificationSectionInline } from "@/components/results/CvlArtefactViews";

interface DeliveryLead {
  name?: string;
  location?: string;
  phone?: string;
  website?: string;
  soft_violations?: string[];
  [key: string]: any;
}

export interface DeliverySummary {
  delivered_exact?: DeliveryLead[];
  delivered_closest?: DeliveryLead[];
  shortfall?: number;
  requested_count?: number;
  delivered_count?: number;
  suggested_next_question?: string | null;
  relaxations?: string[];
}

type OutcomeKind = "complete" | "partial" | "no_exact" | "no_matches";

function deriveOutcome(shortfall: number | null, hasExact: boolean, hasClosest: boolean): { kind: OutcomeKind; label: string; subtext: string } {
  if (shortfall === 0) {
    return { kind: "complete", label: "Complete", subtext: "You got everything you asked for." };
  }
  if (shortfall != null && shortfall > 0 && hasExact) {
    return { kind: "partial", label: "Partial", subtext: "Some exact matches were found." };
  }
  if (!hasExact && hasClosest) {
    return { kind: "no_exact", label: "No exact matches", subtext: "Closest alternatives are available." };
  }
  if (!hasExact && !hasClosest) {
    return { kind: "no_matches", label: "No matches", subtext: "Nothing matched your requirements." };
  }
  return { kind: "partial", label: "Partial", subtext: "Some results were found." };
}

const OUTCOME_STYLES: Record<OutcomeKind, { badge: string; icon: typeof CheckCircle2 }> = {
  complete: { badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200", icon: CheckCircle2 },
  partial: { badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200", icon: CircleDot },
  no_exact: { badge: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300", icon: CircleSlash },
  no_matches: { badge: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400", icon: CircleSlash },
};

function prefillChat(message: string) {
  window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", { detail: message }));
}

function LeadCard({ lead, showViolations }: { lead: DeliveryLead; showViolations?: boolean }) {
  const violations = showViolations && Array.isArray(lead.soft_violations) && lead.soft_violations.length > 0
    ? lead.soft_violations
    : null;

  return (
    <div className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
      {lead.name && (
        <p className="text-sm font-semibold text-foreground leading-tight">{lead.name}</p>
      )}

      {lead.location && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>{lead.location}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="font-mono">{lead.phone}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <Globe className="h-3 w-3 shrink-0" />
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline truncate max-w-[220px]"
            >
              {lead.website}
            </a>
          </div>
        )}
      </div>

      {violations && (
        <p className="text-[11px] text-muted-foreground/50 leading-snug pt-0.5">
          {violations.join(" · ")}
        </p>
      )}
    </div>
  );
}

function NextActionsSection({ suggestedQuestion, shortfall, requestedCount, onClose }: { suggestedQuestion: string | null; shortfall: number | null; requestedCount: number | null; onClose?: () => void }) {
  const target = requestedCount ?? "the original number";
  const q = (suggestedQuestion || "").toLowerCase();

  const actions: Array<{ label: string; message: string; variant?: "default" | "outline" }> = [];

  if (q.includes("nearby")) {
    actions.push({ label: "Include nearby", message: `Ok, include nearby results. Try to reach ${target}.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (q.includes("similar")) {
    actions.push({ label: "Include similar", message: `Ok, include similar matches. Try to reach ${target}.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (q.includes("broaden")) {
    actions.push({ label: "Broaden criteria", message: `Ok, broaden the criteria sensibly and try to reach ${target}. Tell me what you relaxed.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (shortfall != null && shortfall > 0) {
    actions.push({ label: "Broaden criteria", message: `Ok, broaden the criteria sensibly and try to reach ${target}. Tell me what you relaxed.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  }

  actions.push({ label: "Try a different search", message: `Try a different approach to find ${target} while keeping the original constraints.`, variant: "outline" });

  if (actions.length === 1 && shortfall == null) return null;

  const handleClick = (message: string) => {
    prefillChat(message);
    onClose?.();
  };

  return (
    <section className="space-y-3 pt-1">
      <h3 className="text-sm font-semibold text-foreground">Next actions</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <Button
            key={i}
            variant={action.variant || "outline"}
            size="sm"
            className="text-xs"
            onClick={() => handleClick(action.message)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export default function UserResultsView({ deliverySummary, onClose, constraintsPayload, verificationPayload, evidencePayload }: { deliverySummary: DeliverySummary; onClose?: () => void; constraintsPayload?: any; verificationPayload?: any; evidencePayload?: any }) {
  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const shortfall = deliverySummary.shortfall ?? null;
  const hasCvl = !!constraintsPayload;
  const requestedCount = deliverySummary.requested_count ?? null;
  const deliveredCount = deliverySummary.delivered_count ?? null;
  const suggestedQuestion = deliverySummary.suggested_next_question ?? null;

  const outcome = deriveOutcome(shortfall, exact.length > 0, closest.length > 0);
  const style = OUTCOME_STYLES[outcome.kind];
  const OutcomeIcon = style.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", style.badge)}>
          <OutcomeIcon className="h-3.5 w-3.5" />
          {outcome.label}
        </span>
        <p className="text-sm text-muted-foreground">{outcome.subtext}</p>
      </div>

      {constraintsPayload && (
        <ConstraintsSectionInline
          constraintsPayload={constraintsPayload}
          verificationPayload={verificationPayload}
        />
      )}

      {verificationPayload && (
        <VerificationSectionInline
          verificationPayload={verificationPayload}
          evidencePayload={evidencePayload}
        />
      )}

      {exact.length === 0 && closest.length === 0 && shortfall == null && (
        <p className="text-sm text-muted-foreground">No results to display.</p>
      )}

      {exact.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Exact matches
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These meet all your stated requirements.
            </p>
          </div>
          <div className="space-y-2">
            {exact.map((lead, i) => (
              <LeadCard key={i} lead={lead} />
            ))}
          </div>
        </section>
      )}

      {closest.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Closest matches
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These are the nearest alternatives once soft constraints were relaxed.
            </p>
          </div>
          <div className="space-y-2">
            {closest.map((lead, i) => (
              <LeadCard key={i} lead={lead} showViolations />
            ))}
          </div>
        </section>
      )}

      {shortfall != null && shortfall > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/80 leading-relaxed">
            <p className="font-medium text-foreground mb-0.5">What's missing</p>
            {requestedCount != null && deliveredCount != null && (
              <p>{hasCvl ? 'Requested' : 'Target (system)'} {requestedCount}, delivered {deliveredCount}.</p>
            )}
            <p>{shortfall} more could not be found that meet all your requirements.</p>
          </div>
        </div>
      )}

      {(suggestedQuestion || (shortfall != null && shortfall > 0)) && (
        <NextActionsSection
          suggestedQuestion={suggestedQuestion}
          shortfall={shortfall}
          requestedCount={requestedCount}
          onClose={onClose}
        />
      )}
    </div>
  );
}
