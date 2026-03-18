import { useState } from "react";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitTelemetry } from "@/api/telemetryClient";

export interface FeedbackButtonsProps {
  runId?: string | null;
}

const NOT_HELPFUL_REASONS = [
  { value: "wrong_businesses", label: "Wrong businesses" },
  { value: "constraint_misunderstood", label: "Constraint misunderstood" },
  { value: "missing_results", label: "Missing results" },
  { value: "evidence_wrong", label: "Evidence wrong" },
] as const;

type NotHelpfulReason = typeof NOT_HELPFUL_REASONS[number]["value"];

export function FeedbackButtons({ runId }: FeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<"helpful" | "not_helpful" | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [selectedReason, setSelectedReason] = useState<NotHelpfulReason | null>(null);

  const postFeedback = (helpful: boolean, reason?: string) => {
    const payload: Record<string, unknown> = { helpful };
    if (reason) payload.reason = reason;

    if (runId) {
      emitTelemetry(runId, helpful ? "accept_results" : "mark_wrong", payload);
    }
    // TODO: When a dedicated /api/feedback endpoint exists, POST feedback there.
  };

  if (submitted === "helpful") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <ThumbsUp className="h-3 w-3" />
        <span>Thanks for the feedback</span>
      </div>
    );
  }

  if (submitted === "not_helpful") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ThumbsDown className="h-3 w-3" />
        <span>
          Feedback recorded
          {selectedReason && (
            <> - {NOT_HELPFUL_REASONS.find(r => r.value === selectedReason)?.label}</>
          )}
        </span>
      </div>
    );
  }

  if (showReasons) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">What was wrong?</span>
          <button
            onClick={() => setShowReasons(false)}
            className="p-0.5 rounded hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {NOT_HELPFUL_REASONS.map((reason) => (
            <Button
              key={reason.value}
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                setSelectedReason(reason.value);
                setSubmitted("not_helpful");
                postFeedback(false, reason.value);
              }}
            >
              {reason.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <span className="text-[11px] text-muted-foreground mr-1">Was this helpful?</span>
      <button
        onClick={() => {
          setSubmitted("helpful");
          postFeedback(true);
        }}
        className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors group"
        title="Helpful"
      >
        <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground group-hover:text-green-600 dark:group-hover:text-green-400" />
      </button>
      <button
        onClick={() => setShowReasons(true)}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors group"
        title="Not helpful"
      >
        <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400" />
      </button>
    </div>
  );
}
