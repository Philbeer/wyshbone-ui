import { Router } from "express";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface BehaviourEvalPacket {
  benchmark_test_id: string;
  original_query: string;
  expected_outcome_text: string;
  expected_behaviour_text: string;
  final_run_outcome: {
    run_state: string;
    clarified: boolean;
    clarify_question?: string;
    clarify_answer?: string;
    delivered_count: number;
  };
  delivered_results: Array<{
    name: string;
    location?: string;
    website?: string;
    delivered: boolean;
  }>;
  delivered_result_evidence: Array<{
    entity_name: string;
    source_url?: string;
    quote?: string;
    matched_phrase?: string;
    constraint_type?: string;
    confidence?: number;
  }>;
  user_visible_summary: string;
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

const BEHAVIOUR_EVAL_SYSTEM_PROMPT = `You are an independent external reviewer evaluating whether a business discovery system satisfied a benchmark query.

You are judging the FINAL OUTCOME of the run — what was actually delivered to the user — not the internal process used to get there.

Your role:
- You are the external QA judge.
- You answer: "Did the system actually do what the benchmark asked?"
- You judge from the perspective of a human reviewer looking at the final delivered results.

What you judge from:
- The original user query
- The expected benchmark outcome
- The final run state (completed / clarified / timed_out / failed)
- The delivered results (entities returned to the user)
- The evidence attached to those delivered results (quotes, URLs, matched phrases)
- The user-visible summary of what happened

What you do NOT judge from:
- Internal system verdicts or scores
- Internal verification counters or check-pass ratios
- Internal constraint-check artefacts or process steps
- Internal scoring language or diagnostic labels

Rules:
- Be strict. Be harsh. Do not reward plausible guesses. Do not infer missing evidence.
- Judge against the ORIGINAL QUERY and the EXPECTED BENCHMARK OUTCOME.
- IMPORTANT: Not every query requires attached evidence. Match your strictness to what the query actually demands:
  - Simple discovery/count queries (e.g. "Find 10 pubs in Arundel") pass if the correct number of relevant entities were delivered in the correct location. No external evidence is required for these.
  - Name-match queries (e.g. "pubs with Swan in the name") pass if the delivered entity names satisfy the constraint. No external evidence beyond the name itself is needed.
  - Website-evidence queries (e.g. "mention vegan options on their website") require attached evidence — quotes, URLs, or matched phrases — proving the website claim. Without such evidence, fail.
  - Relationship queries (e.g. "work with the local authority") require attached evidence proving the relationship. Plausible entities alone must fail.
- If the benchmark required a count and it was not met in the delivered results, fail.
- If the system should have clarified and did not, fail.
- If the system correctly clarified or correctly refused because proof was not possible, that can pass when consistent with the expected outcome.
- If the benchmark expected explicit evidence (website, relationship, date) and none is attached to delivered results, fail.
- If the benchmark only expected entities matching a type/location/count, delivered results are sufficient proof.

Examples:

1. "Find pubs in Arundel with Swan in the name"
   Pass ONLY if delivered pubs actually contain "Swan" in their name.

2. "Find organisations that work with the local authority in Blackpool"
   Pass ONLY if delivered organisations have attached evidence showing that relationship.

3. "Find restaurants in Bath that mention vegan options on their website"
   Pass ONLY if delivered restaurants have attached evidence (quotes/URLs) showing vegan options from their websites.
   Returning plausible restaurants WITHOUT website evidence must FAIL.

4. "Find 10 cafes in York"
   Pass if at least 10 relevant cafes in York were delivered.

5. "Find breweries" (when location is missing)
   If benchmark expects clarification because location is missing, correct clarification can pass.

6. "Find pubs in Narnia"
   If the system correctly refused or clarified because the location is fictional, that is a pass.

You must respond with a JSON object matching this exact schema:
{
  "behaviour_result": "pass" or "fail",
  "behaviour_reason": "short human-readable explanation of why the final outcome passed or failed",
  "expected_outcome_check": "what the benchmark required",
  "observed_outcome_check": "what the run actually delivered to the user",
  "key_failure_type": one of: "missing_count", "missing_relationship_evidence", "weak_name_match", "unnecessary_clarification", "missing_location", "correct_refusal", "weak_evidence", "missing_website_evidence", "correct_clarification", "correct_delivery", "other",
  "confidence": 0.0 to 1.0
}

Respond ONLY with the JSON object. No markdown, no explanation outside the JSON.`;

function buildUserPrompt(packet: BehaviourEvalPacket): string {
  const outcome = packet.final_run_outcome;

  const resultList =
    packet.delivered_results.length > 0
      ? packet.delivered_results
          .slice(0, 20)
          .map((e, i) => {
            const parts = [`  ${i + 1}. ${e.name}`];
            if (e.location) parts.push(`     Location: ${e.location}`);
            if (e.website) parts.push(`     Website: ${e.website}`);
            return parts.join("\n");
          })
          .join("\n")
      : "  (none delivered)";

  const evidenceList =
    packet.delivered_result_evidence.length > 0
      ? packet.delivered_result_evidence
          .slice(0, 15)
          .map((e, i) => {
            const parts = [`  ${i + 1}. ${e.entity_name}`];
            if (e.quote) parts.push(`     Quote: "${e.quote}"`);
            if (e.matched_phrase) parts.push(`     Matched phrase: "${e.matched_phrase}"`);
            if (e.source_url) parts.push(`     Source URL: ${e.source_url}`);
            if (e.constraint_type)
              parts.push(`     Constraint type: ${e.constraint_type}`);
            if (e.confidence != null)
              parts.push(`     Confidence: ${e.confidence}`);
            return parts.join("\n");
          })
          .join("\n")
      : "  (no evidence attached to delivered results)";

  const clarifyBlock = outcome.clarified
    ? `\nCLARIFIED: yes${outcome.clarify_question ? `\nCLARIFY QUESTION: ${outcome.clarify_question}` : ""}${outcome.clarify_answer ? `\nCLARIFY ANSWER: ${outcome.clarify_answer}` : ""}`
    : "\nCLARIFIED: no";

  return `BENCHMARK TEST: ${packet.benchmark_test_id}

ORIGINAL QUERY:
${packet.original_query}

EXPECTED OUTCOME:
${packet.expected_outcome_text}

EXPECTED BEHAVIOUR:
${packet.expected_behaviour_text}

FINAL RUN STATE: ${outcome.run_state}${clarifyBlock}
DELIVERED COUNT: ${outcome.delivered_count}

DELIVERED RESULTS:
${resultList}

EVIDENCE ATTACHED TO DELIVERED RESULTS:
${evidenceList}

USER-VISIBLE SUMMARY:
${packet.user_visible_summary}

Judge this run strictly based on the final outcome. Return the JSON judgement.`;
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
