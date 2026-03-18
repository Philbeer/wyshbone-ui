/* PHASE_6: Updated status model — honest status labels, COMPLETED→PARTIAL, new CHANGE_PLAN/ERROR statuses */
export type CanonicalStatus = "PASS" | "PARTIAL" | "STOP" | "FAIL" | "UNAVAILABLE" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "ERROR";

export interface StopReason {
  message: string;
  code?: string;
}

export interface CanonicalDeliveryStatus {
  status: CanonicalStatus;
  stop_reason?: StopReason | null;
}

export interface DeliveryStatusInput {
  status?: string | null;
  stop_reason?: StopReason | { message?: string; code?: string } | string | null;
  delivered_count?: number | null;
  requested_count?: number | null;
  verified_exact_count?: number | null;
}

export function resolveCanonicalStatus(input: DeliveryStatusInput): CanonicalDeliveryStatus {
  const raw = (input.status || "").toUpperCase().trim().replace(/[\s-]/g, '_');

  if (raw === "ACCEPT_WITH_UNVERIFIED") {
    return { status: "ACCEPT_WITH_UNVERIFIED", stop_reason: null };
  }

  /* PHASE_6: COMPLETED no longer maps to PASS — treat as PARTIAL since verification wasn't confirmed */
  if (raw === "COMPLETED") {
    return { status: "PARTIAL", stop_reason: null };
  }

  /* PHASE_6: New statuses */
  if (raw === "CHANGE_PLAN" || raw === "REPLANNING") {
    return { status: "CHANGE_PLAN", stop_reason: null };
  }
  if (raw === "ERROR") {
    let stopReason: StopReason | null = null;
    if (input.stop_reason) {
      if (typeof input.stop_reason === "string") {
        stopReason = { message: input.stop_reason };
      } else if (typeof input.stop_reason === "object" && input.stop_reason !== null) {
        stopReason = {
          message: (input.stop_reason as any).message || "An error occurred.",
          code: (input.stop_reason as any).code,
        };
      }
    }
    return { status: "ERROR", stop_reason: stopReason };
  }

  const accepted = raw === "ACCEPT" ? "PASS" : raw;
  if (accepted === "PASS" || accepted === "PARTIAL" || accepted === "STOP" || accepted === "FAIL") {
    const effectiveStatus = accepted as CanonicalStatus;
    let stopReason: StopReason | null = null;
    if ((effectiveStatus === "STOP" || effectiveStatus === "FAIL") && input.stop_reason) {
      if (typeof input.stop_reason === "string") {
        stopReason = { message: input.stop_reason };
      } else if (typeof input.stop_reason === "object" && input.stop_reason !== null) {
        stopReason = {
          message: (input.stop_reason as any).message || "Search was stopped.",
          code: (input.stop_reason as any).code,
        };
      }
    }
    return { status: effectiveStatus, stop_reason: stopReason };
  }

  return { status: "UNAVAILABLE", stop_reason: null };
}

/* PHASE_6: Updated labels to reflect honest status */
export const STATUS_CONFIG: Record<CanonicalStatus, { label: string; badge: string; description: string }> = {
  PASS: {
    label: "Verified",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
    description: "Results verified against requirements.",
  },
  PARTIAL: {
    label: "Partially verified",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    description: "Some results returned. Verification may be incomplete.",
  },
  STOP: {
    label: "Search stopped",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    description: "Search was stopped before completing.",
  },
  FAIL: {
    label: "Verification failed",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    description: "Results could not be verified.",
  },
  ACCEPT_WITH_UNVERIFIED: {
    label: "Results returned — not all verified",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    description: "Results delivered but some constraints could not be verified.",
  },
  CHANGE_PLAN: {
    label: "Replanning",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    description: "Search plan is being revised.",
  },
  ERROR: {
    label: "Error",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    description: "An error occurred during the search.",
  },
  UNAVAILABLE: {
    label: "Status unavailable",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
    description: "Results are still being processed.",
  },
};
