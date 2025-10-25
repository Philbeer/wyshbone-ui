import type { DeepResearchRun, DeepResearchCreateRequest, DeepResearchRunSummary } from "@shared/schema";
import { storage } from "./storage";
import { appendMessage } from "./memory";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds for faster status updates

// Post-process research output to ensure beautiful formatting
async function reformatResearchOutput(rawOutput: string, researchTopic: string): Promise<string> {
  try {
    // Check if output already has good structure with emojis - if so, skip reformatting
    const hasGoodStructure = (
      (rawOutput.includes("## 🧭 Executive Summary") || rawOutput.includes("## Executive Summary")) &&
      (rawOutput.includes("## ⭐ Key Findings") || rawOutput.includes("## Key Findings")) &&
      (rawOutput.includes("## 📚 Sources") || rawOutput.includes("## Sources"))
    );
    
    if (hasGoodStructure) {
      console.log("✅ Output already has good structure - skipping reformatting");
      return rawOutput;
    }
    
    console.log("🎨 Reformatting research output for better presentation...");
    
    const reformatPrompt = `You are a professional research formatter. Take the following research output and reformat it into a beautiful, human-readable markdown document with visual appeal.

ORIGINAL RESEARCH OUTPUT:
${rawOutput}

RESEARCH TOPIC: ${researchTopic}

Transform this into a polished, visually engaging report using this EXACT format:

# 📊 ${researchTopic}

## 🧭 Executive Summary
- 3-5 key findings as clear, actionable bullet points
- Each bullet should be concise and insightful

## 🔍 Overview
A brief introduction (2-3 paragraphs) covering what was researched and key areas investigated.

## ⭐ Key Findings
Present the most important findings. Use **markdown tables** when presenting lists of items with multiple attributes:

| Name | Description | Location | Source |
|------|-------------|----------|--------|
| Item 1 | Details... | Area | Source link |
| Item 2 | Details... | Area | Source link |

For non-tabular findings, use subsections with descriptive titles and bullet points.

## 📍 Detailed Analysis
Break down insights by category or theme. Use tables when comparing multiple items or presenting structured data.

Example table format:
| Category | Details | Notes |
|----------|---------|-------|
| Topic A | Info | Context |
| Topic B | Info | Context |

## 💡 Market Insights
Relevant trends and patterns. Use bullet points with emoji bullets for visual appeal:
• Point 1
• Point 2

## ✅ Recommendations
Actionable next steps or suggestions. Use bullet points clearly labeled:
• For X: Do Y
• For Z: Do A

## 📚 Sources
List all sources as clean bullet points:
• Source Name, Additional context, URL (if available)

CRITICAL FORMATTING RULES:
1. **Use emojis in ALL section headers** (🧭 🔍 ⭐ 📍 💡 ✅ 📚 etc.)
2. **Create markdown tables** for lists of items with 3+ attributes (pubs, businesses, locations, etc.)
3. **Use bullet points** (•) for regular lists, not just dashes
4. **Preserve ALL factual data** from the original
5. **Make tables clean and aligned** - use | separators properly
6. **Keep descriptions concise** in table cells
7. **Add visual hierarchy** with proper spacing between sections
8. **Use bold** for emphasis on important terms
9. **Make sources clickable** when URLs are available: [Source](URL)

EXAMPLE OF GOOD TABLE FORMATTING:
| Business | Type | Location | Rating | Notes |
|----------|------|----------|--------|-------|
| The Skellig | Irish Pub | Knox-Henderson | 4.5★ | Live music, food nights |
| Sue Ellen's | LGBTQ+ Bar | Oak Lawn | Historic | Opened 1989 |

Return ONLY the reformatted markdown report with no meta-commentary.`;

    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: reformatPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("❌ Reformatting failed:", data);
      return rawOutput; // Return original if reformatting fails
    }

    const reformattedOutput = data.choices?.[0]?.message?.content || rawOutput;
    console.log("✅ Research output successfully reformatted");
    return reformattedOutput;
    
  } catch (err: any) {
    console.error("❌ Error reformatting output:", err.message);
    return rawOutput; // Return original on error
  }
}

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
    "You are Wyshbone Deep Research, a professional research analyst.",
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
    body.instructions += `

Return a visually appealing markdown research report with emojis and tables:

# 📊 [Research Topic]

## 🧭 Executive Summary
- 3-5 key findings as clear, actionable bullet points
- Concise and insightful

## 🔍 Overview
Brief introduction (2-3 paragraphs) covering what was researched and key areas investigated.

## ⭐ Key Findings
When presenting lists of businesses, locations, or items with multiple attributes, use markdown tables:

| Name | Description | Location | Source |
|------|-------------|----------|--------|
| Item 1 | Details | Area | Link |

For other findings, use subsections with bullet points.

## 📍 Detailed Analysis
Break down by theme/category. Use tables for structured comparisons.

## 💡 Market Insights
Relevant trends and patterns with bullet points (• not -)

## ✅ Recommendations
Actionable suggestions as bullet points

## 📚 Sources
• Source Name - Context ([URL])

FORMATTING REQUIREMENTS:
- Use emojis in section headers (🧭 🔍 ⭐ 📍 💡 ✅ 📚)
- Create tables for lists of 3+ items with multiple attributes
- Use • for bullet points
- Make URLs clickable: [Text](URL)
- Keep tables clean and aligned
`;
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
      
      // Post-process the output for better formatting
      const reformattedOutput = await reformatResearchOutput(outputText, run.label || run.prompt);
      
      // Always prepend the header for markdown rendering if not present
      let finalOutput = reformattedOutput;
      if (!finalOutput.includes("# 📊")) {
        finalOutput = "# 📊 Deep Research Report\n\n" + finalOutput;
      }
      
      await storage.updateDeepResearchRun(run.id, {
        status,
        outputText: finalOutput,
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
