import { Router } from "express";
import OpenAI from "openai";
import { getDrizzleDb } from "../storage";
import { eq } from "drizzle-orm";
import { groundTruthRecords } from "../../shared/schema";
import {
  isSupabaseConfigured,
  getEnrichmentQueueByRunId,
  updateEnrichmentItem,
  getEnrichmentHistoryForQuery,
  insertEnrichmentQueueItem,
  type GtEnrichmentInsertItem,
} from "../supabase-client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildEnrichmentPrompt(
  candidateName: string,
  candidateLocation: string | null | undefined,
  constraintsToVerify: string | null | undefined,
  towerEvidence: string | null | undefined,
): string {
  const locationPart = candidateLocation ? ` in ${candidateLocation}` : "";
  const constraintPart = constraintsToVerify
    ? `The specific constraint(s) to verify: ${constraintsToVerify}`
    : "Verify whether this business genuinely exists and meets the described criteria.";
  const evidencePart = towerEvidence
    ? `\n\nExisting evidence from prior search: ${towerEvidence}`
    : "";

  return `You are a precise research assistant verifying whether a specific business meets a set of criteria.

Search for "${candidateName}"${locationPart}. Visit their website if possible. ${constraintPart}${evidencePart}

Based on your research, respond with EXACTLY one of the following verdicts on the first line:
CONFIRMED - if you found genuine evidence that this business meets the constraint(s)
DENIED - if you specifically searched and found no evidence (or counter-evidence)
INCONCLUSIVE - if you could not determine either way (e.g. site down, ambiguous)

Then on subsequent lines explain your reasoning and what you found (or didn't find). Be specific about sources.`;
}

function parseEnrichmentResponse(text: string): {
  verdict: "CONFIRMED" | "DENIED" | "INCONCLUSIVE";
  evidence: string;
} {
  const firstLine = (text.split("\n")[0] || "").trim().toUpperCase();
  let verdict: "CONFIRMED" | "DENIED" | "INCONCLUSIVE" = "INCONCLUSIVE";
  if (firstLine.startsWith("CONFIRMED")) verdict = "CONFIRMED";
  else if (firstLine.startsWith("DENIED")) verdict = "DENIED";
  return { verdict, evidence: text.trim() };
}

function verdictToStatus(
  verdict: "CONFIRMED" | "DENIED" | "INCONCLUSIVE",
): "confirmed_positive" | "confirmed_false_positive" | "inconclusive" {
  if (verdict === "CONFIRMED") return "confirmed_positive";
  if (verdict === "DENIED") return "confirmed_false_positive";
  return "inconclusive";
}

async function appendToTrueUniverse(queryId: string, candidateName: string): Promise<void> {
  try {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(groundTruthRecords)
      .where(eq(groundTruthRecords.queryId, queryId));
    if (rows.length === 0) {
      console.warn(`[gt-enrichment] No GT record found for queryId=${queryId}, skipping true_universe update`);
      return;
    }
    const record = rows[0];
    const existing = (record.trueUniverse as string[]) || [];
    const nameLower = candidateName.toLowerCase().trim();
    if (existing.some((e: string) => e.toLowerCase().trim() === nameLower)) {
      console.log(`[gt-enrichment] ${candidateName} already in true_universe for ${queryId}, skipping`);
      return;
    }
    const updated = [...existing, candidateName];
    await db
      .update(groundTruthRecords)
      .set({ trueUniverse: updated })
      .where(eq(groundTruthRecords.queryId, queryId));
    console.log(`[gt-enrichment] Added "${candidateName}" to true_universe for ${queryId}`);
  } catch (err: any) {
    console.error("[gt-enrichment] true_universe update error:", err?.message || err);
  }
}

export function createGtEnrichmentRouter(): Router {
  const router = Router();

  router.use((_req, res, next) => {
    const isDev = process.env.NODE_ENV !== "production";
    const hasDemoAuth = !!((_req as any).query?.user_id || (_req as any).headers?.["x-user-id"]);
    if (isDev || hasDemoAuth) return next();
    return res.status(403).json({ ok: false, error: "Forbidden" });
  });

  router.post("/enqueue", async (req, res) => {
    const body = req.body as Partial<GtEnrichmentInsertItem>;

    if (!body.query_id || !body.run_id || !body.candidate_name) {
      return res.status(400).json({ ok: false, error: "query_id, run_id, and candidate_name are required" });
    }

    const result = await insertEnrichmentQueueItem({
      query_id: body.query_id,
      run_id: body.run_id,
      candidate_name: body.candidate_name,
      candidate_location: body.candidate_location ?? null,
      constraints_to_verify: body.constraints_to_verify ?? null,
      tower_verdict: body.tower_verdict ?? null,
      tower_evidence: body.tower_evidence ?? null,
    });

    if (!result.ok) {
      return res.status(422).json({ ok: false, reason: result.reason });
    }
    return res.json({ ok: true });
  });

  router.post("/run", async (req, res) => {
    const { run_id, query_id } = req.body as { run_id?: string; query_id?: string };

    if (!run_id || !query_id) {
      return res.status(400).json({ ok: false, error: "run_id and query_id are required" });
    }

    if (!isSupabaseConfigured()) {
      return res.json({ ok: true, skipped: true, reason: "Supabase not configured" });
    }

    const pending = await getEnrichmentQueueByRunId(run_id);
    if (pending.length === 0) {
      console.log(`[gt-enrichment] No pending items for run_id=${run_id}`);
      return res.json({ ok: true, processed: 0 });
    }

    console.log(`[gt-enrichment] Processing ${pending.length} pending items for run_id=${run_id}, query_id=${query_id}`);
    res.json({ ok: true, processing: pending.length });

    setImmediate(async () => {
      let confirmed = 0;
      let denied = 0;
      let inconclusive = 0;
      let errors = 0;
      const total = pending.length;

      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        console.log(`[gt-enrichment] Processing ${i + 1} of ${total}: "${item.candidate_name}" (id=${item.id})`);

        try {
          const prompt = buildEnrichmentPrompt(
            item.candidate_name,
            item.candidate_location,
            item.constraints_to_verify,
            item.tower_evidence,
          );

          let responseText = "";
          try {
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-search-preview",
              messages: [{ role: "user", content: prompt }],
            } as any);
            responseText = completion.choices?.[0]?.message?.content || "";
          } catch (modelErr: any) {
            if (
              modelErr?.status === 404 ||
              modelErr?.code === "model_not_found" ||
              String(modelErr?.message).includes("model")
            ) {
              console.warn("[gt-enrichment] gpt-4o-search-preview unavailable, falling back to gpt-4o-mini");
              const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
              });
              responseText = completion.choices?.[0]?.message?.content || "";
            } else {
              throw modelErr;
            }
          }

          const { verdict, evidence } = parseEnrichmentResponse(responseText);
          const status = verdictToStatus(verdict);
          const enrichedAt = new Date().toISOString();

          await updateEnrichmentItem(item.id, {
            status,
            enrichment_result: verdict,
            enrichment_evidence: evidence.slice(0, 2000),
            enriched_at: enrichedAt,
          });

          if (status === "confirmed_positive") {
            confirmed++;
            await appendToTrueUniverse(query_id, item.candidate_name);
            console.log(`[gt-enrichment] "${item.candidate_name}" → CONFIRMED POSITIVE — added to true_universe`);
          } else if (status === "confirmed_false_positive") {
            denied++;
            console.log(`[gt-enrichment] "${item.candidate_name}" → CONFIRMED FALSE POSITIVE`);
          } else {
            inconclusive++;
            console.log(`[gt-enrichment] "${item.candidate_name}" → INCONCLUSIVE`);
          }
        } catch (err: any) {
          errors++;
          console.error(`[gt-enrichment] Error processing item ${item.id} ("${item.candidate_name}"):`, err?.message || err);
          try {
            await updateEnrichmentItem(item.id, {
              status: "inconclusive",
              enrichment_result: "INCONCLUSIVE",
              enrichment_evidence: `Processing error: ${err?.message || "unknown error"}`,
              enriched_at: new Date().toISOString(),
            });
          } catch (updateErr: any) {
            console.error(`[gt-enrichment] Failed to update error status for item ${item.id}:`, updateErr?.message || updateErr);
          }
        }
      }

      console.log(
        `[gt-enrichment] Complete — ${total} processed: ${confirmed} confirmed, ${denied} denied, ${inconclusive} inconclusive, ${errors} errors`,
      );
    });
  });

  router.get("/history/:queryId", async (req, res) => {
    const { queryId } = req.params;
    if (!queryId) return res.status(400).json({ ok: false, error: "queryId required" });

    const items = await getEnrichmentHistoryForQuery(queryId);
    return res.json({ ok: true, items });
  });

  return router;
}
