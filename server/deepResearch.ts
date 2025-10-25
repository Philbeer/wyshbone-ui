import type { DeepResearchRun, DeepResearchCreateRequest, DeepResearchRunSummary } from "@shared/schema";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";
const POLL_INTERVAL_MS = 25000;

const runs = new Map<string, DeepResearchRun>();

function generateRunId(): string {
  return "run_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function suggestDefaultLabel(prompt: string): string {
  const p = (prompt || "").trim();
  if (p.length <= 60) return p || "Deep Research";
  return p.slice(0, 57) + "…";
}

export function stripLargeOutput(run: DeepResearchRun): DeepResearchRunSummary {
  const { outputText, ...rest } = run;
  return {
    ...rest,
    hasOutput: Boolean(outputText && outputText.length),
    outputPreview:
      outputText?.slice(0, 240) + (outputText && outputText.length > 240 ? "…" : ""),
  };
}

export async function startBackgroundResponsesJob(
  params: DeepResearchCreateRequest
): Promise<DeepResearchRun> {
  const {
    prompt,
    label,
    mode = "report",
    counties,
    windowMonths,
    schemaName,
    schema,
  } = params;

  const id = generateRunId();
  const run: DeepResearchRun = {
    id,
    label: label || suggestDefaultLabel(prompt),
    prompt,
    mode,
    counties,
    windowMonths,
    schemaName,
    schema,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  runs.set(id, run);

  const scopeHints: string[] = [];
  if (Array.isArray(counties) && counties.length) {
    scopeHints.push(`Restrict focus to these regions: ${counties.join(", ")}.`);
  }
  if (typeof windowMonths === "number") {
    scopeHints.push(
      `Only include items with dated public evidence within the last ${windowMonths} months.`
    );
  }

  const baseInstructions = [
    "You are Wyshbone Deep Research.",
    "Use the web_search tool to browse thoroughly, follow leads, cross-check facts, and collect dated evidence.",
    "Prefer authoritative sources; include citations and dates.",
    ...scopeHints,
    "Be exhaustive within reasonable limits.",
  ].join(" ");

  const body: any = {
    model: OPENAI_MODEL,
    background: true,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    instructions: baseInstructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ],
    max_output_tokens: 8000,
  };

  if (mode === "json" && schema && schemaName) {
    body.text = {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: false,
        schema,
      },
    };
  } else {
    body.text = { format: { type: "text" } };
    body.instructions += " Return a clean markdown-formatted research report with sections, bullet points, and a 'Sources' list of URLs with short rationales.";
  }

  try {
    console.log("🔬 Starting deep research job:", id, "prompt:", prompt.slice(0, 100));
    const response = await fetch(`${OPENAI_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("❌ OpenAI Responses API error:", data);
      throw new Error(data?.error?.message || "Failed to create research job");
    }
    
    console.log("✅ Research job created:", data.id, "status:", data.status);
    run.responseId = data.id;
    run.status = data.status ?? "in_progress";
    run.updatedAt = Date.now();
    runs.set(id, run);
    return run;
  } catch (err: any) {
    console.error("❌ Deep research error:", err.message);
    run.status = "failed";
    run.error = err.message || String(err);
    run.updatedAt = Date.now();
    runs.set(id, run);
    return run;
  }
}

export async function pollOneRun(run: DeepResearchRun): Promise<void> {
  if (!run.responseId || ["completed", "failed", "stopped"].includes(run.status)) return;
  
  try {
    const response = await fetch(`${OPENAI_BASE}/responses/${run.responseId}`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    
    const data = await response.json();
    const status = data.status || "in_progress";
    run.status = status;
    run.updatedAt = Date.now();

    if (status === "completed") {
      const outputText =
        data.output_text ??
        (data.output && data.output[0] && data.output[0].content && data.output[0].content[0] && data.output[0].content[0].text) ??
        JSON.stringify(data.output ?? data, null, 2);
      run.outputText = outputText;
    } else if (status === "failed") {
      run.error = data?.error?.message || "Unknown error";
    }
  } catch (err: any) {
    run.error = err.message || String(err);
  } finally {
    runs.set(run.id, run);
  }
}

export function getAllRuns(): DeepResearchRun[] {
  return Array.from(runs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getRun(id: string): DeepResearchRun | undefined {
  return runs.get(id);
}

export function stopRun(id: string): DeepResearchRun | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  
  run.status = "stopped";
  run.updatedAt = Date.now();
  runs.set(id, run);
  return run;
}

export async function duplicateRun(id: string): Promise<DeepResearchRun | undefined> {
  const prev = runs.get(id);
  if (!prev) return undefined;
  
  return await startBackgroundResponsesJob({
    prompt: prev.prompt,
    label: prev.label + " (copy)",
    mode: prev.mode,
    counties: prev.counties,
    windowMonths: prev.windowMonths,
    schemaName: prev.schemaName,
    schema: prev.schema,
  });
}

async function pollAllPendingRuns(): Promise<void> {
  const pending = Array.from(runs.values()).filter(
    r => r.status === "queued" || r.status === "in_progress"
  );
  for (const r of pending) {
    if (r.status === "stopped") continue;
    await pollOneRun(r);
  }
}

setInterval(pollAllPendingRuns, POLL_INTERVAL_MS);

console.log(`🔬 Deep Research module initialized (polling every ${POLL_INTERVAL_MS}ms)`);
