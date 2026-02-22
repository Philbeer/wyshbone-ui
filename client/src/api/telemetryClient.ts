export type TelemetryEventType =
  | "accept_results"
  | "retry_same_constraints"
  | "widen_area_clicked"
  | "best_effort_clicked"
  | "export_csv"
  | "copy_contact"
  | "mark_wrong";

export function emitTelemetry(
  runId: string,
  eventType: TelemetryEventType,
  payload?: Record<string, unknown>
): void {
  try {
    const sessionId = localStorage.getItem("wyshbone_sid");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionId) headers["x-session-id"] = sessionId;

    void fetch("/api/telemetry", {
      method: "POST",
      headers,
      body: JSON.stringify({ run_id: runId, event_type: eventType, payload }),
    }).catch(() => {});
  } catch {
    // fire-and-forget
  }
}
