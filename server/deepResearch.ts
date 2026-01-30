import type { DeepResearchRun, DeepResearchCreateRequest, DeepResearchRunSummary } from "@shared/schema";
import { storage } from "./storage";
import { appendMessage, loadConversationHistory } from "./memory";
import { openai } from "./openai";
import Anthropic from "@anthropic-ai/sdk";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds for faster status updates

// Determine which AI provider to use (prefer Anthropic if key is available)
const USE_ANTHROPIC = !!ANTHROPIC_API_KEY;
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient && ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  if (!anthropicClient) {
    throw new Error("Anthropic API key not configured");
  }
  return anthropicClient;
}

// ===========================
// Depth Guidelines based on Intensity
// ===========================

interface DepthGuidelines {
  minSources: number;
  planFirst: boolean;
  requirePrimary: boolean;
  addQuotes: boolean;
  maxTokens: number;
  angles: string[];
  notes: string;
}

function getDepthGuidelines(intensity: "standard" | "ultra" = "standard"): DepthGuidelines {
  if (intensity === "ultra") {
    return {
      minSources: 3,
      planFirst: true,
      requirePrimary: true,
      addQuotes: true,
      maxTokens: 16000,
      angles: [
        "local news",
        "official websites",
        "social media (Facebook/Instagram)",
        "Google Business updates",
        "planning portals",
        "business registries",
        "local forums/Reddit",
        "review platforms"
      ],
      notes: "Be exhaustive within reasonable limits. If evidence is weak, mark confidence=low and add to 'Unverified leads'."
    };
  }
  
  // standard
  return {
    minSources: 1,
    planFirst: false,
    requirePrimary: false,
    addQuotes: false,
    maxTokens: 8000,
    angles: [],
    notes: "Be thorough and include dated evidence; prefer authoritative sources."
  };
}

// ===========================
// AFR Bundle Analysis for Agent Truth
// ===========================

interface AfrBundleData {
  goal_worth: null;
  decisions: Array<{ id: string; ts: string; choice: string; why: string }>;
  expected_signals: Array<{ id: string; text: string }>;
  stop_conditions: Array<{ id: string; text: string }>;
  verdict: "continue" | "revise" | null;
  score: number | null;
  tower_verdict: null;
}

function analyzeOutputForAfr(outputText: string, prompt: string): AfrBundleData {
  const now = new Date().toISOString();
  
  // Check for list-like structure
  const hasBulletPoints = /^[\s]*[-*•]\s/m.test(outputText) || /\n[-*•]\s/m.test(outputText);
  const hasNumberedList = /^\d+\.\s/m.test(outputText) || /\n\d+\.\s/m.test(outputText);
  const hasTableStructure = /\|.*\|.*\|/m.test(outputText);
  const hasMultipleVenues = (outputText.match(/\*\*[^*]+\*\*/g) || []).length >= 3;
  const hasListStructure = hasBulletPoints || hasNumberedList || hasTableStructure || hasMultipleVenues;
  
  // Check for obvious entity markers (venue names/addresses, evidence IDs)
  const hasPlaceIds = /place_?id|ChI[a-zA-Z0-9_-]+/i.test(outputText);
  const hasExternalLinks = /whatpub\.com|tripadvisor|google\.com\/maps|yelp\.com/i.test(outputText);
  const hasAddressPatterns = /\b[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}\b/i.test(outputText); // UK postcodes
  const hasEntityMarkers = hasPlaceIds || hasExternalLinks || hasAddressPatterns;
  
  // Simple heuristic per requirements:
  // If no list-like structure AND no obvious entity markers => revise, score=30
  // Else => continue, score=70
  let verdict: "continue" | "revise" = "continue";
  let score = 70;
  
  if (!hasListStructure && !hasEntityMarkers) {
    verdict = "revise";
    score = 30;
  }
  
  return {
    goal_worth: null,
    decisions: [
      {
        id: "d1",
        ts: now,
        choice: "Use deep research tool",
        why: "User asked for research; deep research chosen as fastest first-pass for comprehensive analysis"
      }
    ],
    expected_signals: [
      { id: "s1", text: "Outputs a structured list of venues/leads, not just narrative" },
      { id: "s2", text: "Includes evidence identifiers/links for each lead (Place ID / WhatPub / etc) OR explicitly states missing" }
    ],
    stop_conditions: [
      { id: "st1", text: "If output is only an essay with no structured entities, verdict=REVISE" },
      { id: "st2", text: "If output lacks any evidence/IDs, verdict=REVISE" }
    ],
    verdict,
    score,
    tower_verdict: null
  };
}

// ===========================
// Context Extraction for Vague Prompts
// ===========================

export interface ResearchContext {
  topic?: string;
  regions?: string[];
  windowMonths?: number;
  isInferred: boolean;
}

function isVaguePrompt(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return true;
  
  // Remove punctuation and normalize whitespace
  const normalized = t.replace(/\W+/g, " ").trim();
  
  // Curated list of genuinely vague phrases
  const vaguePhrases = [
    "deep dive", "deep research", "yes", "ok", "okay", "do it", "go ahead",
    "sure", "please do", "yep", "start it", "run it", "begin", "start",
    "please", "lets do it", "sounds good", "perfect", "great", "alright"
  ];
  
  // Only flag as vague if it exactly matches a known vague phrase
  return vaguePhrases.includes(normalized);
}

async function extractResearchContext(
  conversationId: string,
  userId: string
): Promise<ResearchContext> {
  try {
    // Load recent conversation history (last 8 messages)
    const recentMessages = await loadConversationHistory(conversationId, 8);
    
    if (recentMessages.length === 0) {
      return { isInferred: false };
    }
    
    // Build conversation context string
    const conversationText = recentMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    
    console.log("🔍 Extracting research context from conversation...");
    
    // Use GPT to extract research topic and parameters
    const extractionPrompt = `Analyze this conversation and extract the research topic that the user likely wants to investigate.

Conversation:
${conversationText}

Extract:
1. The main research topic/subject (e.g., "pubs in Texas", "micropubs in West Sussex", "coffee shops in London")
2. Any mentioned regions/locations (as an array)
3. Any time window mentioned (e.g., "last 6 months" → 6)

Return strict JSON:
{
  "topic": "the specific research topic or null if none",
  "regions": ["array", "of", "regions"] or null,
  "windowMonths": number or null
}

Rules:
- Only extract if there's a CLEAR topic in the conversation
- The topic should be something researchable (business types, subjects, locations)
- If ambiguous or unclear, return null for topic
- Be conservative - better to return null than guess`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.0,
      messages: [
        { role: "system", content: "You extract research context in strict JSON format." },
        { role: "user", content: extractionPrompt }
      ]
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    
    console.log("📊 Extracted context:", parsed);
    
    return {
      topic: parsed.topic || undefined,
      regions: Array.isArray(parsed.regions) ? parsed.regions : undefined,
      windowMonths: typeof parsed.windowMonths === 'number' ? parsed.windowMonths : undefined,
      isInferred: true
    };
  } catch (error: any) {
    console.error("❌ Error extracting research context:", error.message);
    return { isInferred: false };
  }
}

export async function enhancePromptWithContext(
  prompt: string,
  conversationId?: string,
  userId?: string
): Promise<{ 
  enhancedPrompt: string; 
  context: ResearchContext;
  needsConfirmation: boolean;
}> {
  // If prompt is not vague, return as-is
  if (!isVaguePrompt(prompt)) {
    return { 
      enhancedPrompt: prompt, 
      context: { isInferred: false },
      needsConfirmation: false
    };
  }
  
  console.log("🔍 Vague prompt detected:", prompt);
  
  // If no conversation context available, fall back to original prompt
  if (!conversationId || !userId) {
    console.log("⚠️ No conversationId/userId - falling back to original prompt");
    return { 
      enhancedPrompt: prompt, // CRITICAL: Always return original prompt as fallback
      context: { isInferred: false },
      needsConfirmation: false
    };
  }
  
  // Extract context from conversation
  const context = await extractResearchContext(conversationId, userId);
  
  // If no topic found, fall back to original prompt
  if (!context.topic) {
    console.log("⚠️ No topic extracted from conversation - falling back to original prompt");
    return { 
      enhancedPrompt: prompt, // CRITICAL: Always return original prompt as fallback
      context,
      needsConfirmation: false
    };
  }
  
  // Build enhanced prompt
  let enhanced = `Deep research on: ${context.topic}. `;
  enhanced += "Use web browsing to find dated, authoritative sources. ";
  enhanced += "Provide a comprehensive report with citations and dates.";
  
  console.log("✨ Enhanced prompt from context:", enhanced);
  
  return {
    enhancedPrompt: enhanced,
    context,
    needsConfirmation: true // Always confirm when using inferred context
  };
}

// Post-process research output to ensure beautiful formatting
async function reformatResearchOutput(rawOutput: string, researchTopic: string): Promise<string> {
  try {
    // Check if output already has the EMOJI headers we want - only skip if it does
    const hasEmojiHeaders = (
      rawOutput.includes("## 🧭") &&
      rawOutput.includes("## ⭐") &&
      rawOutput.includes("## 📚")
    );
    
    if (hasEmojiHeaders) {
      console.log("✅ Output already has emoji headers - skipping reformatting");
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

    let reformattedOutput = data.choices?.[0]?.message?.content || rawOutput;
    
    // Strip markdown code fences if present (GPT sometimes wraps output in ```markdown blocks)
    if (reformattedOutput.startsWith('```markdown')) {
      reformattedOutput = reformattedOutput.replace(/^```markdown\s*\n/, '').replace(/\n```\s*$/, '');
      console.log("🔧 Stripped markdown code fences from reformatted output");
    } else if (reformattedOutput.startsWith('```')) {
      reformattedOutput = reformattedOutput.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
      console.log("🔧 Stripped code fences from reformatted output");
    }
    
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

  // Detect if outputText contains error messages and don't show them as preview
  const isError = outputText && (
    outputText.includes('401') ||
    outputText.includes('403') ||
    outputText.includes('500') ||
    outputText.toLowerCase().includes('unauthorized') ||
    outputText.toLowerCase().includes('error:') ||
    outputText.toLowerCase().includes('failed to')
  );

  // If it's an error or no output, show appropriate status-based message
  let preview = '';
  if (!outputText || isError) {
    if (run.status === 'completed') {
      preview = 'Research completed - click to view';
    } else if (run.status === 'failed') {
      preview = 'Research failed';
    } else if (run.status === 'running' || run.status === 'in_progress') {
      preview = 'Research in progress...';
    } else if (run.status === 'queued') {
      preview = 'Waiting to start...';
    }
  } else {
    // Normal preview for actual content
    preview = outputText.slice(0, 240) + (outputText.length > 240 ? "…" : "");
  }

  return {
    ...rest,
    hasOutput: Boolean(outputText && outputText.length && !isError),
    outputPreview: preview,
  };
}

// ===========================
// ANTHROPIC-BASED DEEP RESEARCH
// ===========================

async function runAnthropicDeepResearch(
  run: DeepResearchRun,
  prompt: string,
  baseInstructions: string
): Promise<void> {
  try {
    console.log(`🤖 [Anthropic] Starting research for ${run.id}`);

    await storage.updateDeepResearchRun(run.id, { status: "running" });

    const client = getAnthropicClient();

    // Use Claude with extended thinking for deep research
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000
      },
      messages: [{
        role: "user",
        content: `${baseInstructions}\n\nRESEARCH TOPIC: ${prompt}\n\nNote: You don't have access to web_search. Use your knowledge and extended thinking to provide comprehensive analysis based on what you know. Be clear about information recency and limitations.`
      }]
    });

    // Extract text content
    let outputText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        outputText += block.text;
      }
    }

    if (!outputText) {
      throw new Error("No output generated from research");
    }

    // Reformat output
    const reformattedOutput = await reformatResearchOutput(outputText, run.label || run.prompt);

    // Ensure header is present
    let finalOutput = reformattedOutput;
    if (!finalOutput.includes("# 📊")) {
      finalOutput = "# 📊 Deep Research Report\n\n" + finalOutput;
    }

    // Add note about knowledge limitations
    finalOutput += "\n\n---\n\n*Note: This research is based on Claude's knowledge base (updated January 2025) without real-time web search. For the most current information, please verify key facts.*";

    await storage.updateDeepResearchRun(run.id, {
      status: "completed",
      outputText: finalOutput,
    });

    // Populate AFR bundle with analysis of the output
    try {
      const bundleData = analyzeOutputForAfr(finalOutput, run.prompt);
      await storage.upsertAfrRunBundle(run.id, bundleData);
      console.log(`[AFR] Updated bundle for run ${run.id}: verdict=${bundleData.verdict}, score=${bundleData.score}`);
    } catch (err) {
      console.log(`[AFR] Could not update bundle for run ${run.id}:`, (err as Error).message);
    }

    console.log(`✅ [Anthropic] Research completed for ${run.id}`);

    // Send completion notification if there's a session
    if (run.sessionId) {
      await sendCompletionNotification(run.sessionId, {
        ...run,
        status: "completed",
        outputText: finalOutput
      });
    }

  } catch (error: any) {
    console.error(`❌ [Anthropic] Research failed for ${run.id}:`, error);
    await storage.updateDeepResearchRun(run.id, {
      status: "failed",
      error: error.message || String(error),
    });
  }
}

export async function startBackgroundResponsesJob(
  params: DeepResearchCreateRequest,
  sessionId?: string,
  userId?: string
): Promise<DeepResearchRun> {
  // HARD ASSERTION: userId is REQUIRED for run creation
  // No silent fallback - callers must provide authenticated userId
  const { isDemoMode, DEMO_USER_ID } = await import("./demo-config");
  
  let resolvedUserId: string;
  if (userId) {
    resolvedUserId = userId;
    console.log(`🔐 [BGRS] Creating run for userId: ${resolvedUserId}`);
  } else if (isDemoMode()) {
    resolvedUserId = DEMO_USER_ID;
    console.log(`🎭 [BGRS] Demo mode enabled, using demo userId: ${resolvedUserId}`);
  } else {
    // FAIL LOUDLY: No silent fallback in production
    const errMsg = "userId is required for run creation. No anonymous runs allowed in production.";
    console.error(`❌ [BGRS] REJECTED: ${errMsg}`);
    throw new Error(errMsg);
  }
  
  const {
    prompt,
    label,
    mode = "report",
    counties,
    windowMonths,
    schemaName,
    schema,
    intensity = "standard",
  } = params;

  // Get depth guidelines based on intensity
  const depthConfig = getDepthGuidelines(intensity);

  const id = generateRunId();
  const finalLabel = (label || suggestDefaultLabel(prompt)) + (intensity === "ultra" ? " (Very Deep Dive)" : "");
  
  const runData = {
    id,
    userId: resolvedUserId,
    sessionId,
    label: finalLabel,
    prompt,
    mode,
    counties,
    windowMonths,
    schemaName,
    schema,
    intensity,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const run = await storage.createDeepResearchRun(runData);

  try {
    await storage.upsertAfrRunBundle(id, {
      goal_worth: null,
      decisions: [],
      expected_signals: [],
      stop_conditions: [],
      verdict: null,
      score: null,
      tower_verdict: null
    });
    console.log(`[AFR] Created starter bundle for run ${id}`);
  } catch (err) {
    console.log(`[AFR] Could not create starter bundle for run ${id}:`, (err as Error).message);
  }

  const scopeHints: string[] = [];
  if (Array.isArray(counties) && counties.length) {
    scopeHints.push(`Restrict focus to these regions: ${counties.join(", ")}.`);
  }
  if (typeof windowMonths === "number") {
    scopeHints.push(
      `Only include items with dated public evidence within the last ${windowMonths} months.`
    );
  }

  // Build coverage requirements based on depth guidelines
  const coverage = `Each item must have ≥${depthConfig.minSources} dated sources.` +
    (depthConfig.requirePrimary ? " At least one must be local/primary." : "") +
    (depthConfig.addQuotes ? " Include a short quote + date for each source." : "");

  const angles = depthConfig.angles.length ? ` Check: ${depthConfig.angles.join(", ")}.` : "";
  const plan = depthConfig.planFirst ? " PHASE 1 (PLAN): Brief bullet search plan listing sub-queries and target sources. PHASE 2 (EXECUTE): Execute iteratively with web_search." : "";

  const baseInstructions = intensity === "ultra"
    ? [
      "You are Wyshbone Deep Research, a professional research analyst conducting EXHAUSTIVE, COMPREHENSIVE research.",
      "🚨 ULTRA DEEP DIVE MODE ACTIVATED - This requires SIGNIFICANTLY MORE research than standard mode.",
      plan,
      "RESEARCH METHODOLOGY:",
      "1. Perform MULTIPLE rounds of web searches (minimum 8-12 searches)",
      "2. Cross-reference information across at least 5+ independent sources",
      "3. Dig deeper into each finding - don't stop at surface-level information",
      "4. Verify facts through multiple channels (official sites, news, social media, registries)",
      angles,
      coverage,
      "QUALITY STANDARDS:",
      "- Each claim must be backed by direct quotes with dates",
      "- Synthesize information from diverse sources, not just one or two",
      "- Include specific details: dates, numbers, names, addresses",
      "- When you think you're done, do 3-5 MORE searches to find additional insights",
      depthConfig.notes,
      ...scopeHints,
      "TARGET OUTPUT: Comprehensive report of 2000-4000+ words with extensive sourcing.",
    ].join(" ")
    : [
      "You are Wyshbone Deep Research, a professional research analyst.",
      plan,
      "Use the web_search tool to browse thoroughly, follow leads, cross-check facts, and collect dated evidence.",
      angles,
      coverage,
      depthConfig.notes,
      ...scopeHints,
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
    max_output_tokens: depthConfig.maxTokens,
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

  // Route to appropriate AI provider
  if (USE_ANTHROPIC) {
    console.log("🤖 Using Anthropic for deep research:", id);

    // Run Anthropic research in background (don't await)
    runAnthropicDeepResearch(run, prompt, baseInstructions).catch(error => {
      console.error("Background research error:", error);
    });

    return run;
  }

  // Fall back to OpenAI if Anthropic not available
  try {
    console.log("🔬 Starting deep research job (OpenAI):", id, "prompt:", prompt.slice(0, 100));
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
      // Path 2: data.output[].content[0].text (Responses API format with web_search)
      // output[0] is often the web_search_call, output[1] is the actual message
      else if (data.output && Array.isArray(data.output)) {
        // Try each output item until we find one with content
        for (let i = 0; i < data.output.length; i++) {
          const output = data.output[i];
          // Skip web_search_call items
          if (output.type === 'web_search_call') continue;
          
          if (output.content && Array.isArray(output.content) && output.content[0]) {
            if (output.content[0].text) {
              outputText = output.content[0].text;
              console.log(`🎯 Found output via path 2a: output[${i}].content[0].text`);
              break;
            } else if (typeof output.content[0] === 'string') {
              outputText = output.content[0];
              console.log(`🎯 Found output via path 2b: output[${i}].content[0] (string)`);
              break;
            }
          } else if (typeof output === 'string') {
            outputText = output;
            console.log(`🎯 Found output via path 2c: output[${i}] (string)`);
            break;
          }
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
      
      // Populate AFR bundle with analysis of the output
      try {
        const bundleData = analyzeOutputForAfr(finalOutput, run.prompt);
        await storage.upsertAfrRunBundle(run.id, bundleData);
        console.log(`[AFR] Updated bundle for run ${run.id}: verdict=${bundleData.verdict}, score=${bundleData.score}`);
      } catch (err) {
        console.log(`[AFR] Could not update bundle for run ${run.id}:`, (err as Error).message);
      }
      
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

export async function getAllRuns(userId?: string): Promise<DeepResearchRun[]> {
  return await storage.listDeepResearchRuns(userId) as DeepResearchRun[];
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

// ===========================
// Multi-Iteration Program Controller (Very Deep Dive)
// ===========================

interface VeryDeepProgram {
  id: string;
  userId?: string;
  prompt: string;
  label: string;
  sessionId?: string;
  counties?: string[];
  windowMonths?: number;
  status: "running" | "completed" | "failed";
  iteration: number;
  maxIterations: number;
  childRunIds: string[];
  aggregateOutput: string;
  createdAt: number;
  updatedAt: number;
}

const activePrograms = new Map<string, VeryDeepProgram>();

function generateProgramId(): string {
  return "prog_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function startVeryDeepProgram(
  params: DeepResearchCreateRequest,
  sessionId?: string,
  userId?: string
): Promise<VeryDeepProgram> {
  const programId = generateProgramId();
  
  const program: VeryDeepProgram = {
    id: programId,
    userId,
    prompt: params.prompt,
    label: params.label || suggestDefaultLabel(params.prompt),
    sessionId,
    counties: params.counties,
    windowMonths: params.windowMonths,
    status: "running",
    iteration: 1,
    maxIterations: 3, // Run 3 passes
    childRunIds: [],
    aggregateOutput: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  activePrograms.set(programId, program);
  
  // Start first iteration
  const firstRun = await startBackgroundResponsesJob({
    ...params,
    intensity: "ultra",
    label: `${program.label} – Pass 1/3`,
  }, sessionId, userId);
  
  program.childRunIds.push(firstRun.id);
  
  console.log(`🚀 Started Very Deep Program ${programId} with ${program.maxIterations} iterations`);
  
  return program;
}

async function advanceProgram(program: VeryDeepProgram): Promise<void> {
  if (program.status !== "running") return;
  
  // Get the latest child run
  const latestRunId = program.childRunIds[program.childRunIds.length - 1];
  const latestRun = await getRun(latestRunId);
  
  if (!latestRun) return;
  
  // Wait for current run to complete
  if (latestRun.status === "queued" || latestRun.status === "in_progress") return;
  
  // Aggregate output from completed run
  if (latestRun.status === "completed" && latestRun.outputText) {
    program.aggregateOutput += `\n\n---\n### Pass ${program.iteration} Results\n\n${latestRun.outputText}`;
    program.updatedAt = Date.now();
  }
  
  // Check if we should continue
  if (program.iteration >= program.maxIterations) {
    // Program complete - create final synthesized run
    await finalizeProgram(program);
    return;
  }
  
  // Start next iteration with context from previous passes
  program.iteration += 1;
  const continueContext = summarizeForContext(program.aggregateOutput);
  
  const nextRun = await startBackgroundResponsesJob({
    prompt: program.prompt,
    label: `${program.label} – Pass ${program.iteration}/${program.maxIterations}`,
    mode: "report",
    counties: program.counties,
    windowMonths: program.windowMonths,
    intensity: "ultra",
  }, program.sessionId, program.userId);
  
  // Modify instructions to include prior context
  const runToUpdate = await getRun(nextRun.id);
  if (runToUpdate && continueContext) {
    console.log(`📋 Pass ${program.iteration}: Carrying forward ${continueContext.length} chars of context`);
  }
  
  program.childRunIds.push(nextRun.id);
  program.updatedAt = Date.now();
  activePrograms.set(program.id, program);
}

function summarizeForContext(aggregateOutput: string): string {
  // Return last 8000 chars so next iteration knows what was already found
  const maxContext = 8000;
  if (aggregateOutput.length <= maxContext) return aggregateOutput;
  return "..." + aggregateOutput.slice(-maxContext);
}

async function finalizeProgram(program: VeryDeepProgram): Promise<void> {
  program.status = "completed";
  program.updatedAt = Date.now();
  
  // Create a final synthesized report run
  const finalId = generateRunId();
  const finalReport = `# 📊 ${program.label} (Very Deep Dive - ${program.iteration} Passes)

## 🎯 Research Summary
This report synthesizes findings from ${program.iteration} sequential research passes, each building on the previous one to provide comprehensive, multi-sourced insights.

${program.aggregateOutput}

---

**Research Methodology:** ${program.iteration} sequential ultra-deep passes with context carry-forward
**Total Runtime:** ${Math.round((program.updatedAt - program.createdAt) / 1000)}s
`;
  
  const runData = {
    id: finalId,
    userId: program.userId || "demo-user",
    sessionId: program.sessionId,
    label: `${program.label} (Very Deep Dive Final)`,
    prompt: program.prompt,
    mode: "report" as const,
    counties: program.counties,
    windowMonths: program.windowMonths,
    intensity: "ultra" as const,
    status: "completed" as const,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
    outputText: finalReport,
  };
  
  await storage.createDeepResearchRun(runData);
  
  console.log(`✅ Very Deep Program ${program.id} completed. Final run: ${finalId}`);
  
  // Send notification
  if (program.sessionId) {
    await sendCompletionNotification(program.sessionId, runData as DeepResearchRun);
  }
  
  activePrograms.set(program.id, program);
}

export function getProgram(id: string): VeryDeepProgram | undefined {
  return activePrograms.get(id);
}

export function getAllPrograms(): VeryDeepProgram[] {
  return Array.from(activePrograms.values());
}

async function pollAllPendingRuns(): Promise<void> {
  try {
    const pending = await storage.listPendingDeepResearchRuns();
    for (const r of pending) {
      if (r.status === "stopped") continue;
      await pollOneRun(r as DeepResearchRun);
    }
    
    // Also advance any running programs
    for (const program of activePrograms.values()) {
      if (program.status === "running") {
        await advanceProgram(program);
      }
    }
  } catch (error) {
    // Log but don't crash - database might be temporarily unavailable
    console.error('❌ Error in deep research polling:', error instanceof Error ? error.message : error);
  }
}

setInterval(pollAllPendingRuns, POLL_INTERVAL_MS);

console.log(`🔬 Deep Research module initialized (polling every ${POLL_INTERVAL_MS}ms)`);
