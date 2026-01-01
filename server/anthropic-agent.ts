/**
 * Anthropic Agent - Claude API with Tool Use
 * 
 * This module handles conversations with Claude and executes tools when requested.
 * Uses Anthropic's "tool use" feature for intelligent function calling.
 * 
 * Flow:
 * 1. User sends message
 * 2. Claude analyzes and decides if tool is needed
 * 3. If tool needed: execute via executeAction(), return result to Claude
 * 4. Claude formats final response naturally
 */

import Anthropic from "@anthropic-ai/sdk";
import { executeAction, ActionResult } from "./lib/actions";
import type { IStorage } from "./storage";

// =============================================================================
// CONFIGURATION
// =============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-20250514"; // Latest Claude Sonnet

// =============================================================================
// TOOL DEFINITIONS (Anthropic Format)
// =============================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: "quick_search",
    description: "Search for businesses in a specific location using the Wyshbone Global Database (Google Places). Use this when the user wants to find businesses like pubs, breweries, restaurants, cafes, etc. in a specific area. Returns a list of businesses with names, addresses, phone numbers, and websites.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The type of business to search for (e.g., 'breweries', 'pubs', 'coffee shops', 'restaurants')"
        },
        location: {
          type: "string",
          description: "The location to search in (e.g., 'Manchester', 'London', 'Leeds')"
        },
        country: {
          type: "string",
          description: "The country code (default: 'GB' for United Kingdom, 'US' for United States)",
          default: "GB"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 30)",
          default: 30
        }
      },
      required: ["query", "location"]
    }
  },
  {
    name: "deep_research",
    description: "Perform comprehensive research on a topic, company, or market. Use this when the user wants detailed analysis, market research, competitor analysis, or thorough investigation of a subject. Takes 30 seconds to several minutes depending on complexity.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "What to research - be specific about the topic, location, and what information is needed"
        },
        intensity: {
          type: "string",
          enum: ["standard", "ultra"],
          description: "Research depth: 'standard' for quick research (30-90 seconds), 'ultra' for comprehensive deep dive (2-8 minutes)",
          default: "standard"
        },
        counties: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Specific regions/counties to focus the research on"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "email_finder",
    description: "Find verified contact email addresses for businesses. Use this when the user wants to get contact information, email addresses, or set up outreach campaigns. Searches for businesses and enriches them with verified emails via Hunter.io, then can add to SalesHandy campaigns.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The type of business to find emails for (e.g., 'breweries', 'pubs')"
        },
        location: {
          type: "string",
          description: "The location to search in (e.g., 'Manchester', 'Yorkshire')"
        },
        country: {
          type: "string",
          description: "Country code (default: 'GB')",
          default: "GB"
        },
        targetRole: {
          type: "string",
          description: "The job title/role to find (default: 'General Manager')",
          default: "General Manager"
        },
        limit: {
          type: "number",
          description: "Maximum number of businesses to process (default: 30)",
          default: 30
        }
      },
      required: ["query", "location"]
    }
  },
  {
    name: "scheduled_monitor",
    description: "Set up automated recurring monitoring for a topic or search. Use this when the user wants to track changes, get alerts, or automate regular research on a topic. Can run daily, weekly, biweekly, or monthly.",
    input_schema: {
      type: "object" as const,
      properties: {
        label: {
          type: "string",
          description: "A short descriptive name for this monitor (e.g., 'New breweries in Manchester')"
        },
        description: {
          type: "string",
          description: "What to monitor - this becomes the research prompt that runs on schedule"
        },
        schedule: {
          type: "string",
          enum: ["hourly", "daily", "weekly", "biweekly", "monthly"],
          description: "How often to run the monitor (default: 'weekly')",
          default: "weekly"
        },
        scheduleTime: {
          type: "string",
          description: "What time to run (HH:MM format, default: '09:00')",
          default: "09:00"
        }
      },
      required: ["label", "description"]
    }
  },
  {
    name: "get_nudges",
    description: "Get AI-generated suggestions and nudges for follow-ups. Use this when the user asks about what they should do, which leads need attention, or wants proactive suggestions.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of nudges to return (default: 10)",
          default: 10
        }
      },
      required: []
    }
  }
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT = `You are Wyshbone AI, an intelligent sales assistant that helps users find business leads, research markets, and manage outreach.

You have access to these tools:
1. **quick_search** - Find businesses in any location (fast, returns list of places)
2. **deep_research** - Comprehensive market research (takes longer, returns detailed reports)
3. **email_finder** - Find verified contact emails for businesses
4. **scheduled_monitor** - Set up automated recurring monitoring/alerts
5. **get_nudges** - Get AI suggestions for follow-ups and actions

IMPORTANT GUIDELINES:

1. **Be conversational and helpful** - Talk naturally like a helpful assistant, not a robot.

2. **Use tools proactively** - When the user mentions finding businesses, researching, getting emails, or monitoring - use the appropriate tool. Don't just describe what you could do.

3. **Ask for clarification only when necessary** - If the user says "find pubs", ask about location. If they say "find pubs in London", just do it.

4. **Present results clearly** - After using a tool, summarize the results in a friendly way. For search results, list the top findings. For research, give key highlights.

5. **Suggest next steps** - After completing a task, suggest relevant follow-up actions the user might want (e.g., "Would you like me to find emails for these businesses?")

6. **Handle errors gracefully** - If a tool fails, explain what happened and offer alternatives.

7. **Remember context** - Use the conversation history to understand what the user is working on.

EXAMPLES of good responses:

User: "Find breweries in Manchester"
→ Use quick_search with query="breweries", location="Manchester"
→ "I found 15 breweries in Manchester! Here are the top results:
   1. **Cloudwater Brew Co** - Unit 9, Piccadilly...
   2. **Marble Beers** - 73 Rochdale Road...
   Would you like me to find contact emails for these, or research any of them in more detail?"

User: "Research the craft beer market in London"
→ Use deep_research with prompt="craft beer market in London"
→ "I've started researching the craft beer market in London. This comprehensive analysis will take about 1-2 minutes. I'll look at market size, key players, trends, and opportunities..."

Be helpful, be proactive, and make the user's job easier!`;

// =============================================================================
// TYPES
// =============================================================================

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentResponse {
  message: string;
  toolsUsed?: Array<{
    name: string;
    input: Record<string, unknown>;
    result: ActionResult;
  }>;
}

// =============================================================================
// ANTHROPIC CLIENT
// =============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicClient = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

// =============================================================================
// TOOL EXECUTION
// =============================================================================

async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId?: string,
  storage?: IStorage
): Promise<ActionResult> {
  console.log(`🔧 [Claude Agent] Executing tool: ${toolName}`, JSON.stringify(toolInput, null, 2));

  try {
    // Map tool names to action names (matching server/lib/actions.ts)
    const actionMap: Record<string, string> = {
      quick_search: "SEARCH_PLACES",
      deep_research: "DEEP_RESEARCH",
      email_finder: "BATCH_CONTACT_FINDER",
      scheduled_monitor: "CREATE_SCHEDULED_MONITOR",
      get_nudges: "GET_NUDGES",
    };

    const actionName = actionMap[toolName];
    if (!actionName) {
      return {
        ok: false,
        error: `Unknown tool: ${toolName}`,
      };
    }

    // Special handling for nudges (reads from database)
    if (toolName === "get_nudges") {
      // TODO: Implement nudges fetching from Supabase
      return {
        ok: true,
        data: { nudges: [], message: "No pending nudges at the moment" },
        note: "No nudges available",
      };
    }

    // Map tool input to expected action params
    let actionParams = { ...toolInput };
    
    // quick_search expects locationText, not location
    if (toolName === "quick_search") {
      actionParams = {
        query: toolInput.query,
        locationText: toolInput.location,
        maxResults: toolInput.maxResults || 30,
        country: toolInput.country || "GB",
      };
    }
    
    // deep_research expects prompt
    if (toolName === "deep_research") {
      actionParams = {
        prompt: toolInput.prompt,
        label: toolInput.prompt,
        intensity: toolInput.intensity || "standard",
        counties: toolInput.counties,
      };
    }

    // Execute via shared action executor
    const result = await executeAction({
      action: actionName,
      params: actionParams,
      userId,
      storage,
    });

    console.log(`✅ [Claude Agent] Tool result:`, result.ok ? "success" : "failed", result.note || result.error);
    return result;
    
  } catch (error: any) {
    console.error(`❌ [Claude Agent] Tool execution error:`, error);
    return {
      ok: false,
      error: error.message || "Tool execution failed",
    };
  }
}

// =============================================================================
// MAIN CHAT FUNCTION
// =============================================================================

export async function chatWithClaude(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  userId?: string,
  storage?: IStorage
): Promise<AgentResponse> {
  const client = getAnthropicClient();
  const toolsUsed: AgentResponse["toolsUsed"] = [];

  // Build messages array for Anthropic
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the new user message
  messages.push({
    role: "user",
    content: userMessage,
  });

  console.log(`💬 [Claude Agent] Sending message to Claude...`);

  // Initial request to Claude
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });

  console.log(`📥 [Claude Agent] Response stop_reason: ${response.stop_reason}`);

  // Handle tool use loop (Claude may want to use multiple tools)
  while (response.stop_reason === "tool_use") {
    // Find the tool use block
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      console.error("❌ [Claude Agent] tool_use stop reason but no tool_use block found");
      break;
    }

    console.log(`🔧 [Claude Agent] Claude wants to use tool: ${toolUseBlock.name}`);

    // Execute the tool
    const toolResult = await executeToolCall(
      toolUseBlock.name,
      toolUseBlock.input as Record<string, unknown>,
      userId,
      storage
    );

    toolsUsed.push({
      name: toolUseBlock.name,
      input: toolUseBlock.input as Record<string, unknown>,
      result: toolResult,
    });

    // Send tool result back to Claude
    messages.push({
      role: "assistant",
      content: response.content,
    });

    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult),
        },
      ],
    });

    // Continue the conversation
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    console.log(`📥 [Claude Agent] Continuation stop_reason: ${response.stop_reason}`);
  }

  // Extract the final text response
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  const finalMessage = textBlock?.text || "I apologize, but I couldn't generate a response.";

  console.log(`✅ [Claude Agent] Final response generated`);

  return {
    message: finalMessage,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
  };
}

// =============================================================================
// STREAMING VERSION (for real-time updates)
// =============================================================================

export async function* streamChatWithClaude(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  userId?: string,
  storage?: IStorage
): AsyncGenerator<{ type: "text" | "tool_start" | "tool_result" | "done"; content: string }> {
  const client = getAnthropicClient();

  // Build messages array
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  messages.push({
    role: "user",
    content: userMessage,
  });

  // Create streaming request
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });

  let currentToolUse: { id: string; name: string; input: string } | null = null;

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        currentToolUse = {
          id: event.content_block.id,
          name: event.content_block.name,
          input: "",
        };
        yield { type: "tool_start", content: event.content_block.name };
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        yield { type: "text", content: event.delta.text };
      } else if (event.delta.type === "input_json_delta" && currentToolUse) {
        currentToolUse.input += event.delta.partial_json;
      }
    } else if (event.type === "content_block_stop" && currentToolUse) {
      // Execute the tool
      try {
        const toolInput = JSON.parse(currentToolUse.input);
        const result = await executeToolCall(
          currentToolUse.name,
          toolInput,
          userId,
          storage
        );
        yield {
          type: "tool_result",
          content: JSON.stringify({
            tool: currentToolUse.name,
            result,
          }),
        };
      } catch (e) {
        console.error("Tool execution error:", e);
      }
      currentToolUse = null;
    }
  }

  yield { type: "done", content: "" };
}

