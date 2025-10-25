import type { DeepResearchRun, DeepResearchCreateRequest, DeepResearchRunSummary } from "@shared/schema";
import { storage } from "./storage";
import { appendMessage } from "./memory";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds for faster status updates

// Send a completion notification to the chat
async function sendCompletionNotification(sessionId: string, run: DeepResearchRun): Promise<void> {
  try {
    const message = `✅ **Deep Research Complete!**\n\n` +
      `Your research on "${run.label}" has finished.\n\n` +
      `Click on the research run in the sidebar to view the full report.`;
    
    appendMessage(sessionId, {
      role: "assistant",
      content: message
    });
    
    console.log(`📬 Sent completion notification for ${run.id} to session ${sessionId}`);
  } catch (err: any) {
    console.error(`❌ Failed to send completion notification:`, err.message);
  }
}

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
  params: DeepResearchCreateRequest,
  sessionId?: string
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
  const runData = {
    id,
    sessionId,
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
  const run = await storage.createDeepResearchRun(runData);

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
    // Map OpenAI statuses to our statuses
    const apiStatus = data.status ?? "in_progress";
    const updatedRun = await storage.updateDeepResearchRun(id, {
      responseId: data.id,
      status: apiStatus === "in_progress" ? "running" : apiStatus,
    });
    return updatedRun as DeepResearchRun;
  } catch (err: any) {
    console.error("❌ Deep research error:", err.message);
    const updatedRun = await storage.updateDeepResearchRun(id, {
      status: "failed",
      error: err.message || String(err),
    });
    return updatedRun as DeepResearchRun;
  }
}

export async function pollOneRun(run: DeepResearchRun): Promise<void> {
  if (!run.responseId || ["completed", "failed", "stopped"].includes(run.status)) return;
  
  const previousStatus = run.status; // Track previous status for notifications
  
  try {
    console.log(`📊 Polling research job ${run.id} (responseId: ${run.responseId})`);
    const response = await fetch(`${OPENAI_BASE}/responses/${run.responseId}`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    
    const data = await response.json();
    const apiStatus = data.status || "in_progress";
    console.log(`📊 Poll result for ${run.id}: status=${apiStatus}`);
    
    // Map OpenAI statuses to our statuses
    let status = apiStatus;
    if (apiStatus === "in_progress") {
      status = "running";
    }

    if (status === "completed") {
      // Extract the actual text from the response - try multiple paths
      let outputText = "";
      
      // Debug: save response to file for inspection
      try {
        await import('fs/promises').then(fs => 
          fs.writeFile('/tmp/debug-response.json', JSON.stringify(data, null, 2))
        );
      } catch (e) {
        console.error('Failed to write debug file:', e);
      }
      
      // Path 1: data.output_text
      if (data.output_text && typeof data.output_text === 'string') {
        outputText = data.output_text;
        console.log(`🎯 Found output via path 1: output_text`);
      }
      // Path 2: data.output[0].content[0].text (Assistants API format)
      else if (data.output && Array.isArray(data.output) && data.output[0]) {
        const output = data.output[0];
        if (output.content && Array.isArray(output.content) && output.content[0]) {
          if (output.content[0].text) {
            outputText = output.content[0].text;
            console.log(`🎯 Found output via path 2a: output[0].content[0].text`);
          } else if (typeof output.content[0] === 'string') {
            outputText = output.content[0];
            console.log(`🎯 Found output via path 2b: output[0].content[0] (string)`);
          }
        } else if (typeof output === 'string') {
          outputText = output;
          console.log(`🎯 Found output via path 2c: output[0] (string)`);
        }
      }
      // Path 3: data.text
      else if (data.text && typeof data.text === 'string') {
        outputText = data.text;
        console.log(`🎯 Found output via path 3: text`);
      }
      // Path 4: data.content (direct content)
      else if (data.content && typeof data.content === 'string') {
        outputText = data.content;
        console.log(`🎯 Found output via path 4: content`);
      }
      // Path 5: data.result
      else if (data.result && typeof data.result === 'string') {
        outputText = data.result;
        console.log(`🎯 Found output via path 5: result`);
      }
      
      // If still no text, stringify the output object
      if (!outputText) {
        console.log(`⚠️ No text found in standard paths for ${run.id}, data keys:`, Object.keys(data));
        outputText = JSON.stringify(data.output ?? data, null, 2);
      }
      
      // Final safety check to ensure outputText is a string
      if (typeof outputText !== 'string') {
        outputText = String(outputText || 'No output available');
      }
      
      // Always prepend the header for markdown rendering
      if (!outputText.includes("# 📊")) {
        outputText = "# 📊 Deep Research Report\n\n" + outputText;
      }
      
      await storage.updateDeepResearchRun(run.id, {
        status,
        outputText,
      });
      console.log(`✅ Research job ${run.id} completed, output length: ${outputText?.length || 0}`);
      
      // Send chat notification if status changed to completed and we have a sessionId
      if (previousStatus !== "completed" && run.sessionId) {
        await sendCompletionNotification(run.sessionId, run);
      }
    } else if (status === "failed") {
      const error = data?.error?.message || "Unknown error";
      await storage.updateDeepResearchRun(run.id, {
        status,
        error,
      });
      console.log(`❌ Research job ${run.id} failed: ${error}`);
    } else {
      await storage.updateDeepResearchRun(run.id, { status });
    }
  } catch (err: any) {
    console.error(`❌ Error polling job ${run.id}:`, err.message);
    await storage.updateDeepResearchRun(run.id, {
      error: err.message || String(err),
    });
  }
}

export async function getAllRuns(): Promise<DeepResearchRun[]> {
  return await storage.listDeepResearchRuns() as DeepResearchRun[];
}

export async function getRun(id: string): Promise<DeepResearchRun | null> {
  return await storage.getDeepResearchRun(id) as DeepResearchRun | null;
}

export async function stopRun(id: string): Promise<DeepResearchRun | null> {
  return await storage.updateDeepResearchRun(id, {
    status: "stopped",
  }) as DeepResearchRun | null;
}

export async function duplicateRun(id: string): Promise<DeepResearchRun | undefined> {
  const prev = await storage.getDeepResearchRun(id);
  if (!prev) return undefined;
  
  return await startBackgroundResponsesJob({
    prompt: prev.prompt,
    label: prev.label + " (copy)",
    mode: (prev.mode as "report" | "json") || "report",
    counties: prev.counties || undefined,
    windowMonths: prev.windowMonths || undefined,
    schemaName: prev.schemaName || undefined,
    schema: prev.schema || undefined,
  });
}

async function pollAllPendingRuns(): Promise<void> {
  const pending = await storage.listPendingDeepResearchRuns();
  for (const r of pending) {
    if (r.status === "stopped") continue;
    await pollOneRun(r as DeepResearchRun);
  }
}

setInterval(pollAllPendingRuns, POLL_INTERVAL_MS);

console.log(`🔬 Deep Research module initialized (polling every ${POLL_INTERVAL_MS}ms)`);
