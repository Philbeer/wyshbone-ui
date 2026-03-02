export interface FriendlyStopReason {
  label: string;
  description: string;
  rawCode: string;
}

const STOP_REASON_MAP: Record<string, FriendlyStopReason> = {
  artefacts_unavailable: {
    label: "Results still loading",
    description: "The search completed but results are still being assembled. They should appear shortly.",
    rawCode: "artefacts_unavailable",
  },
  max_replans_reached: {
    label: "Replan limit reached",
    description: "The search tried multiple approaches but hit the maximum number of replans allowed.",
    rawCode: "max_replans_reached",
  },
  timeout: {
    label: "Search timed out",
    description: "The search took longer than expected and was stopped to avoid excessive wait time.",
    rawCode: "timeout",
  },
  no_results_found: {
    label: "No results found",
    description: "The search completed but could not find any results matching your criteria.",
    rawCode: "no_results_found",
  },
  constraint_unverifiable: {
    label: "Constraint could not be verified",
    description: "One or more of your requirements could not be checked against available data sources.",
    rawCode: "constraint_unverifiable",
  },
  budget_exhausted: {
    label: "Search budget used up",
    description: "The search used all available API calls for this query.",
    rawCode: "budget_exhausted",
  },
  tower_stop: {
    label: "Quality check stopped the search",
    description: "The quality checker determined continuing would not improve results.",
    rawCode: "tower_stop",
  },
  user_cancelled: {
    label: "Search cancelled",
    description: "The search was stopped at your request.",
    rawCode: "user_cancelled",
  },
  api_error: {
    label: "External service error",
    description: "An external data source returned an error during the search.",
    rawCode: "api_error",
  },
  rate_limited: {
    label: "Rate limit hit",
    description: "Too many requests were made in a short period. Try again in a moment.",
    rawCode: "rate_limited",
  },
};

export function mapStopReason(raw: string | { message?: string; code?: string } | null | undefined): FriendlyStopReason | null {
  if (!raw) return null;

  let code = "";
  let message = "";

  if (typeof raw === "string") {
    code = raw;
    message = raw;
  } else {
    code = raw.code || "";
    message = raw.message || "";
  }

  const codeLower = code.toLowerCase().trim().replace(/[\s-]/g, "_");

  if (STOP_REASON_MAP[codeLower]) {
    return STOP_REASON_MAP[codeLower];
  }

  for (const [key, value] of Object.entries(STOP_REASON_MAP)) {
    if (codeLower.includes(key) || message.toLowerCase().includes(key.replace(/_/g, " "))) {
      return value;
    }
  }

  if (message) {
    return {
      label: "Search stopped",
      description: message.length > 200 ? message.slice(0, 197) + "..." : message,
      rawCode: code || message,
    };
  }

  return {
    label: "Search stopped",
    description: "The search was stopped before completing.",
    rawCode: code || "unknown",
  };
}
