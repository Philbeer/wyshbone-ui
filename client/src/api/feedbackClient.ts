export interface FeedbackPayload {
  goal_id?: string | null;
  run_id?: string | null;
  payload?: Record<string, unknown>;
}

async function postFeedback(action: string, body: FeedbackPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const sessionId = localStorage.getItem("wyshbone_sid");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionId) headers["x-session-id"] = sessionId;

    const res = await fetch(`/api/feedback/${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { ok: false, error: text };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Network error" };
  }
}

export function acceptResult(goalId: string | null, runId: string | null) {
  return postFeedback("accept", { goal_id: goalId, run_id: runId });
}

export function retryGoal(goalId: string | null, runId: string | null) {
  return postFeedback("retry", { goal_id: goalId, run_id: runId });
}

export function abandonGoal(goalId: string | null, runId: string | null) {
  return postFeedback("abandon", { goal_id: goalId, run_id: runId });
}

export function exportData(goalId: string | null, runId: string | null, payload?: Record<string, unknown>) {
  return postFeedback("export", { goal_id: goalId, run_id: runId, payload });
}
