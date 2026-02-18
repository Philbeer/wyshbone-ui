import { getDrizzleDb } from '../storage';
import { sql } from 'drizzle-orm';
import { getSupabaseUrlForLogging } from '../supabase-client';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export interface ArtefactInput {
  runId: string;
  type: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function persistArtefact(input: ArtefactInput): Promise<{ id: string | null; ok: boolean; error?: string }> {
  const supabaseRef = getSupabaseUrlForLogging();
  const ts = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ARTEFACT_PERSIST] attempt=${attempt}/${MAX_RETRIES} type=${input.type} runId=${input.runId} target=${supabaseRef}`);

      const db = getDrizzleDb();
      const result = await db.execute(
        sql`INSERT INTO artefacts (run_id, type, title, summary, payload_json, created_at)
            VALUES (${input.runId}, ${input.type}, ${input.title}, ${input.summary}, ${JSON.stringify(input.payload)}::jsonb, ${ts}::timestamptz)
            RETURNING id`
      );
      const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
      const artefactId = rows[0]?.id ?? null;

      console.log(`[ARTEFACT_PERSIST] OK type=${input.type} runId=${input.runId} artefactId=${artefactId} supabase=${supabaseRef}`);
      return { id: artefactId, ok: true };
    } catch (err: any) {
      const isLast = attempt === MAX_RETRIES;
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.error(`[ARTEFACT_PERSIST] FAIL attempt=${attempt}/${MAX_RETRIES} type=${input.type} runId=${input.runId} error=${err.message}`);

      if (isLast) {
        return { id: null, ok: false, error: err.message };
      }
      await delay(delayMs);
    }
  }

  return { id: null, ok: false, error: 'exhausted retries' };
}

export async function persistArtefactBatch(artefacts: ArtefactInput[]): Promise<{ ok: boolean; persisted: number; failed: string[] }> {
  const results = { ok: true, persisted: 0, failed: [] as string[] };

  for (const art of artefacts) {
    const r = await persistArtefact(art);
    if (r.ok) {
      results.persisted++;
    } else {
      results.ok = false;
      results.failed.push(`${art.type}: ${r.error}`);
    }
  }

  console.log(`[ARTEFACT_PERSIST_BATCH] persisted=${results.persisted}/${artefacts.length} failed=${results.failed.length} supabase=${getSupabaseUrlForLogging()}`);
  return results;
}
