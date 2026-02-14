import { MapPin, Phone, Globe, AlertTriangle, MessageCircleQuestion } from "lucide-react";

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
  suggested_next_question?: string | null;
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
        <p className="text-[11px] text-muted-foreground/70 leading-snug pt-0.5">
          {violations.join(" · ")}
        </p>
      )}
    </div>
  );
}

export default function UserResultsView({ deliverySummary }: { deliverySummary: DeliverySummary }) {
  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const shortfall = deliverySummary.shortfall ?? null;
  const suggestedQuestion = deliverySummary.suggested_next_question ?? null;
  const hasResults = exact.length > 0 || closest.length > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Results</h2>

      {!hasResults && shortfall == null && (
        <p className="text-sm text-muted-foreground">No results to display.</p>
      )}

      {exact.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Exact matches ({exact.length})
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
              Closest matches ({closest.length})
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
        <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/90 leading-relaxed">
            <p>I found {exact.length} exact match{exact.length !== 1 ? "es" : ""}.</p>
            <p>I couldn't find {shortfall} more that meet all your requirements.</p>
          </div>
        </div>
      )}

      {suggestedQuestion && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-2.5">
          <MessageCircleQuestion className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-foreground/80 leading-relaxed">
            {suggestedQuestion}
          </p>
        </div>
      )}
    </div>
  );
}
