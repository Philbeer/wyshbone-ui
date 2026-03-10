import { Router } from "express";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface BehaviourEvalPacket {
  benchmark_test_id: string;
  original_query: string;
  expected_outcome_text: string;
  expected_behaviour_text: string;
  actual_run_state: string;
  clarified: boolean;
  clarify_question?: string;
  clarify_answer?: string;
  tower_result: string;
  delivered_count: number;
  delivered_entities: Array<{
    name: string;
    location?: string;
    website?: string;
    key_evidence?: string[];
    verification_flags?: Record<string, boolean>;
  }>;
  evidence_summary: Array<{
    entity_name: string;
    matched_quote?: string;
    source_url?: string;
    constraint_type?: string;
    confidence?: number;
  }>;
  behaviour_observed_summary: string;
}

export interface BehaviourLLMJudgement {
  behaviour_result: "pass" | "fail";
  behaviour_reason: string;
  expected_outcome_check: string;
  observed_outcome_check: string;
  key_failure_type:
    | "missing_count"
    | "missing_relationship_evidence"
    | "weak_name_match"
    | "unnecessary_clarification"
    | "missing_location"
    | "correct_refusal"
    | "weak_evidence"
    | "missing_website_evidence"
    | "correct_clarification"
    | "correct_delivery"
    | "other";
  confidence: number;
}

const BEHAVIOUR_EVAL_SYSTEM_PROMPT = `You are a strict benchmark evaluator for a business discovery system.
You are judging whether a benchmark run genuinely satisfied the original user request.

Be strict. Be harsh. Do not reward plausible guesses. Do not infer missing evidence.
Only pass if the returned result and evidence actually satisfy the benchmark expectation.
If the result looks superficially reasonable but does not prove the requested predicate, fail.

Rules:
- Judge against the ORIGINAL QUERY, not just the returned list.
- Judge against the EXPECTED BENCHMARK OUTCOME.
- Do not reward vague or plausible results if the evidence does not satisfy the actual predicate.
- If the benchmark required a relationship, attribute, name match, website claim, date constraint, or count, verify that specifically.
- If the system should have clarified and did not, fail.
- If the system correctly clarified or correctly refused because proof was not possible, that can pass when consistent with the expected outcome.
- If evidence is missing, weak, generic, or unrelated, fail.
- If count was required and not met, fail.
- If a known exact constraint like "name contains Swan" is satisfied in the returned entities/evidence, that should pass.
- If the benchmark expected explicit relationship evidence (e.g. works with the local authority), plausible entities alone must fail.

Examples of correct judgement:

1. "Find pubs in Arundel with Swan in the name"
   Pass ONLY if returned pubs actually contain "Swan" in their name.

2. "Find organisations that work with the local authority in Blackpool"
   Pass ONLY if returned organisations have evidence showing that relationship.
   Plausible Blackpool organisations WITHOUT that relationship evidence must FAIL.

3. "Find 10 cafes in York"
   Pass if at least 10 relevant cafes in York were returned and the count requirement was met.

4. "Find breweries" (when location is missing)
   If benchmark expects clarification because location is missing, correct clarification can pass.

5. "Find pubs in Narnia"
   If the system correctly refused or clarified because the location is fictional, that is a pass.

You must respond with a JSON object matching this exact schema:
{
  "behaviour_result": "pass" or "fail",
  "behaviour_reason": "short human-readable explanation",
  "expected_outcome_check": "what the benchmark required",
  "observed_outcome_check": "what the run actually did",
  "key_failure_type": one of: "missing_count", "missing_relationship_evidence", "weak_name_match", "unnecessary_clarification", "missing_location", "correct_refusal", "weak_evidence", "missing_website_evidence", "correct_clarification", "correct_delivery", "other",
  "confidence": 0.0 to 1.0
}

Respond ONLY with the JSON object. No markdown, no explanation outside the JSON.`;

function buildUserPrompt(packet: BehaviourEvalPacket): string {
  const entityList =
    packet.delivered_entities.length > 0
      ? packet.delivered_entities
          .slice(0, 20)
          .map((e, i) => {
            const parts = [`  ${i + 1}. ${e.name}`];
            if (e.location) parts.push(`     Location: ${e.location}`);
            if (e.website) parts.push(`     Website: ${e.website}`);
            if (e.key_evidence && e.key_evidence.length > 0)
              parts.push(`     Evidence: ${e.key_evidence.join("; ")}`);
            return parts.join("\n");
          })
          .join("\n")
      : "  (none)";

  const evidenceList =
    packet.evidence_summary.length > 0
      ? packet.evidence_summary
          .slice(0, 15)
          .map((e, i) => {
            const parts = [`  ${i + 1}. ${e.entity_name}`];
            if (e.matched_quote) parts.push(`     Quote: "${e.matched_quote}"`);
            if (e.source_url) parts.push(`     Source: ${e.source_url}`);
            if (e.constraint_type)
              parts.push(`     Constraint: ${e.constraint_type}`);
            if (e.confidence != null)
              parts.push(`     Confidence: ${e.confidence}`);
            return parts.join("\n");
          })
          .join("\n")
      : "  (none)";

  return `BENCHMARK TEST: ${packet.benchmark_test_id}

ORIGINAL QUERY:
${packet.original_query}

EXPECTED OUTCOME:
${packet.expected_outcome_text}

EXPECTED BEHAVIOUR:
${packet.expected_behaviour_text}

ACTUAL RUN STATE: ${packet.actual_run_state}
CLARIFIED: ${packet.clarified}${packet.clarify_question ? `\nCLARIFY QUESTION: ${packet.clarify_question}` : ""}${packet.clarify_answer ? `\nCLARIFY ANSWER: ${packet.clarify_answer}` : ""}
TOWER RESULT: ${packet.tower_result}
DELIVERED COUNT: ${packet.delivered_count}

DELIVERED ENTITIES:
${entityList}

EVIDENCE SUMMARY:
${evidenceList}

BEHAVIOUR OBSERVED:
${packet.behaviour_observed_summary}

Judge this run strictly. Return the JSON judgement.`;
}

export function createBehaviourEvaluatorRouter(): Router {
  const router = Router();

  router.use((req, res, next) => {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) return next();
    return res.status(403).json({ ok: false, error: "Forbidden — dev only" });
  });

  router.post("/evaluate", async (req, res) => {
    try {
      const packet = req.body as BehaviourEvalPacket;

      if (!packet.benchmark_test_id || !packet.original_query) {
        return res
          .status(400)
          .json({ ok: false, error: "Missing required fields" });
      }

      const userPrompt = buildUserPrompt(packet);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: BEHAVIOUR_EVAL_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }, { timeout: 25000 });

      const raw = response.choices[0]?.message?.content || "";

      let judgement: BehaviourLLMJudgement;
      try {
        const parsed = JSON.parse(raw);
        judgement = {
          behaviour_result:
            parsed.behaviour_result === "pass" ? "pass" : "fail",
          behaviour_reason: String(parsed.behaviour_reason || "No reason given"),
          expected_outcome_check: String(
            parsed.expected_outcome_check || "Unknown"
          ),
          observed_outcome_check: String(
            parsed.observed_outcome_check || "Unknown"
          ),
          key_failure_type: parsed.key_failure_type || "other",
          confidence: Math.min(
            1,
            Math.max(0, Number(parsed.confidence) || 0.5)
          ),
        };
      } catch {
        return res.json({
          ok: true,
          eval_mode: "llm_v1_parse_error",
          judgement: null,
          raw_response: raw,
          parse_ok: false,
        });
      }

      return res.json({
        ok: true,
        eval_mode: "llm_v1",
        judgement,
        raw_response: raw,
        parse_ok: true,
      });
    } catch (err: any) {
      console.error("[behaviour-evaluator] LLM eval error:", err.message);
      return res.json({
        ok: false,
        eval_mode: "llm_v1_error",
        error: err.message,
        judgement: null,
      });
    }
  });

  return router;
}
