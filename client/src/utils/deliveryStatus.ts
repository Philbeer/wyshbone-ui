export type CanonicalStatus = "PASS" | "PARTIAL" | "STOP" | "UNAVAILABLE";

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
  const raw = (input.status || "").toUpperCase().trim();

  if (raw === "PASS" || raw === "PARTIAL" || raw === "STOP") {
    let stopReason: StopReason | null = null;
    if (raw === "STOP" && input.stop_reason) {
      if (typeof input.stop_reason === "string") {
        stopReason = { message: input.stop_reason };
      } else if (typeof input.stop_reason === "object" && input.stop_reason !== null) {
        stopReason = {
          message: (input.stop_reason as any).message || "Search was stopped.",
          code: (input.stop_reason as any).code,
        };
      }
    }
    return { status: raw as CanonicalStatus, stop_reason: stopReason };
  }

  return { status: "UNAVAILABLE", stop_reason: null };
}

export const STATUS_CONFIG: Record<CanonicalStatus, { label: string; badge: string; description: string }> = {
  PASS: {
    label: "Complete",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
    description: "All requested results were found and verified.",
  },
  PARTIAL: {
    label: "Partial",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
    description: "Some results were found but not everything requested.",
  },
  STOP: {
    label: "Stopped",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    description: "The search was stopped before completing.",
  },
  UNAVAILABLE: {
    label: "Status unavailable",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
    description: "Results are still being processed.",
  },
};
