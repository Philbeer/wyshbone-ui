/**
 * ClaudeService - Intelligent Claude API Integration
 * 
 * Based on Anthropic's best practices for building chat that doesn't feel "dumb":
 * - Minimal system prompts (let Claude be Claude)
 * - Immediate tool use (no asking permission)
 * - Tool examples (show don't tell)
 * - Conversation context management
 * - Streaming responses
 * 
 * Reference: Anthropic Best Practices for Tool Use
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';

// =============================================================================
// TYPES
// =============================================================================

export interface ChatChunk {
  type: 'text' | 'tool_start' | 'tool_executing' | 'tool_complete' | 'error' | 'done';
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  message?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

// =============================================================================
// CLAUDE SERVICE CLASS
// =============================================================================

class ClaudeService {
  private client: Anthropic;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private readonly MAX_MESSAGES = 20; // Auto-clear after 20 messages
  
  constructor() {
    this.client = new Anthropic({
      apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true // Required for frontend use
    });
  }
  
  // ===========================================================================
  // TOOL DEFINITIONS (with examples for better understanding)
  // ===========================================================================
  
  private getTools(): ToolDefinition[] {
    return [
      {
        name: "search_google_places",
        description: `Fast search for businesses by location and type. 
Use IMMEDIATELY when user wants to find businesses, outlets, shops, venues, etc.
Returns list with names, addresses, ratings, phone numbers, websites.

Examples of when to use:
- "pubs in Leeds" → search_google_places(query="pubs", location="Leeds")
- "find breweries near Manchester" → search_google_places(query="breweries", location="Manchester")
- "coffee shops in Devon" → search_google_places(query="coffee shops", location="Devon")
- "restaurants London" → search_google_places(query="restaurants", location="London")`,
        input_schema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Business type (e.g. 'pubs', 'breweries', 'cafes', 'restaurants', 'gyms')"
            },
            location: {
              type: "string",
              description: "City, town, or region (e.g. 'Leeds', 'Manchester', 'Devon', 'London')"
            },
            country: {
              type: "string",
              description: "Country code (default: 'GB' for United Kingdom)",
              default: "GB"
            },
            maxResults: {
              type: "number",
              description: "Maximum results to return (default: 20)",
              default: 20
            }
          },
          required: ["query", "location"]
        }
      },
      {
        name: "deep_research",
        description: `Comprehensive research and analysis on a company, market, or topic.
Use when user wants DETAILED INFORMATION, analysis, or insights - not just a list.
Takes 30-60 seconds to complete. Shows progress while running.

Examples of when to use:
- "research the craft beer market" → deep_research(prompt="craft beer market analysis")
- "tell me about Red Lion Brewery" → deep_research(prompt="Red Lion Brewery company analysis")
- "analyze pub industry in Yorkshire" → deep_research(prompt="pub industry analysis in Yorkshire")
- "competitive landscape for breweries" → deep_research(prompt="competitive landscape for brewery industry", intensity="deep")`,
        input_schema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description: "What to research in detail - be specific"
            },
            intensity: {
              type: "string",
              enum: ["quick", "thorough", "deep"],
              description: "Research depth: quick (30s), thorough (1min), deep (2min)",
              default: "thorough"
            },
            counties: {
              type: "array",
              items: { type: "string" },
              description: "Optional: Specific regions/counties to focus on"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "email_finder",
        description: `Find verified contact emails for companies or people.
Use when user wants to contact businesses, find email addresses, or build outreach lists.
Can find emails for individual companies or batches.

Examples of when to use:
- "get email for Red Lion Brewery" → email_finder(query="Red Lion Brewery")
- "find contact for pub owners in Leeds" → email_finder(query="pubs", location="Leeds", targetRole="owner")
- "emails for those breweries" → email_finder with previous search results`,
        input_schema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Company name or business type to find emails for"
            },
            location: {
              type: "string",
              description: "Location to narrow the search"
            },
            targetRole: {
              type: "string",
              description: "Job title/role to find (e.g. 'owner', 'manager', 'buyer', 'director')",
              default: "owner"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "create_scheduled_monitor",
        description: `Set up recurring monitoring for companies or topics.
Automatically checks for changes and sends email alerts.
Use when user wants ongoing tracking, alerts, or automated monitoring.

Examples of when to use:
- "monitor new breweries in Yorkshire weekly" → create_scheduled_monitor(label="new breweries in Yorkshire", schedule="weekly")
- "track this company" → create_scheduled_monitor with company details
- "alert me about new pubs opening" → create_scheduled_monitor(label="new pub openings", schedule="weekly")`,
        input_schema: {
          type: "object" as const,
          properties: {
            label: {
              type: "string",
              description: "What to monitor (e.g. 'new breweries in Yorkshire')"
            },
            schedule: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              description: "How often to check and send updates",
              default: "weekly"
            },
            description: {
              type: "string",
              description: "Additional details about what changes to look for"
            }
          },
          required: ["label", "schedule"]
        }
      },
      {
        name: "get_nudges",
        description: `Get proactive suggestions and action items based on current context.
Use when user asks for suggestions, recommendations, or "what should I do next?"`,
        input_schema: {
          type: "object" as const,
          properties: {
            context: {
              type: "string",
              description: "Current situation or area to get suggestions for"
            }
          },
          required: []
        }
      }
    ];
  }
  
  // ===========================================================================
  // SYSTEM PROMPT WITH CLARIFICATION PROTOCOL
  // ===========================================================================
  
  private getSystemPrompt(): string {
    return `You are Wyshbone AI, a sales agent assistant that helps find businesses and contacts.

<clarification_protocol>
CRITICAL: Verify you have specific information before using tools.

REQUIRED before search_google_places:
✅ Business type (specific: "pubs", "breweries", "cafes" - not "businesses" or "customers")
✅ Location (specific: "Leeds", "Manchester", "London" - not just "Somerset", "UK", or "North")

REQUIRED before deep_research:
✅ Clear topic or company name (not just a region name)

REQUIRED before email_finder:
✅ Company or person name
✅ Optional: location, role

If user says something vague like:
- "Find customers" → Ask: "What type of business and which location?"
- "Deep research" → Ask: "What specific topic or company would you like me to research?"
- "Get emails" → Ask: "For which companies or people?"
- "Research Somerset" → Ask: "What aspect of Somerset? (e.g., pubs in Somerset, brewery market in Somerset)"
</clarification_protocol>

<examples>
TAKE ACTION IMMEDIATELY (have all required info):
- "Find pubs in Leeds" → search_google_places(query="pubs", location="Leeds")
- "Research Red Lion Brewery" → deep_research(prompt="Red Lion Brewery analysis")
- "Get emails for Red Lion Brewery" → email_finder(query="Red Lion Brewery")
- "Breweries in Manchester" → search_google_places(query="breweries", location="Manchester")
- "Research the craft beer market in Yorkshire" → deep_research(prompt="craft beer market in Yorkshire")

ASK FIRST (missing required info):
- "Find pubs" → "In which location would you like me to search for pubs?"
- "Deep research" → "What topic or company would you like me to research?"
- "Research Somerset" → "What aspect of Somerset would you like me to research? For example: pubs in Somerset, the brewery scene in Somerset, or a specific company?"
- "Find customers" → "What type of business are you looking for, and in which area?"
</examples>

<thinking_process>
Before each tool use, verify:
1. Do I have a SPECIFIC business type? (not generic "businesses" or "customers")
2. Do I have a SPECIFIC location? (city/town, not just a county or region)
3. Am I making ANY assumptions about what the user wants?

If answering YES to #3, ASK instead of ASSUME.
</thinking_process>

You have access to these tools:
- search_google_places: Fast business search (requires: business type + location)
- deep_research: Comprehensive research (requires: specific topic or company)
- email_finder: Find contacts (requires: company/person name)
- create_scheduled_monitor: Set up recurring monitoring
- get_nudges: Get proactive suggestions

Be conversational and helpful. When you have complete information, act immediately. When information is missing, ask ONE clear question to get what you need.

After completing a task, suggest logical next steps.`;
  }
  
  // ===========================================================================
  // MAIN CHAT METHOD - Streaming with Tool Use
  // ===========================================================================
  
  async *sendMessage(userMessage: string): AsyncGenerator<ChatChunk> {
    // Auto-clear old messages if history is too long
    if (this.conversationHistory.length > this.MAX_MESSAGES) {
      console.log('🧹 Auto-clearing conversation history (exceeded 20 messages)');
      this.conversationHistory = this.conversationHistory.slice(-10);
    }
    
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });
    
    console.log('🤖 Sending to Claude:', userMessage);
    console.log('📚 Conversation length:', this.conversationHistory.length);
    
    try {
      // Call Claude with streaming
      const stream = await this.client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        tools: this.getTools() as Anthropic.Tool[],
        messages: this.conversationHistory
      });
      
      let currentToolUse: { id: string; name: string; input: Record<string, unknown> } | null = null;
      let toolInputJson = '';
      const assistantContent: Anthropic.ContentBlock[] = [];
      let textAccumulator = '';
      
      // Process stream events
      for await (const event of stream) {
        // Text content streaming
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textAccumulator += event.delta.text;
            yield {
              type: 'text',
              content: event.delta.text
            };
          }
          
          // Tool input JSON streaming
          if (event.delta.type === 'input_json_delta') {
            toolInputJson += event.delta.partial_json;
          }
        }
        
        // Content block started
        if (event.type === 'content_block_start') {
          // Tool use block starting
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            };
            toolInputJson = '';
            
            yield {
              type: 'tool_start',
              tool: event.content_block.name
            };
          }
          
          // Text block starting
          if (event.content_block.type === 'text') {
            textAccumulator = '';
          }
        }
        
        // Content block finished
        if (event.type === 'content_block_stop') {
          // Text block complete
          if (textAccumulator) {
            assistantContent.push({
              type: 'text',
              text: textAccumulator
            });
            textAccumulator = '';
          }
          
          // Tool use block complete
          if (currentToolUse) {
            try {
              currentToolUse.input = toolInputJson ? JSON.parse(toolInputJson) : {};
            } catch {
              currentToolUse.input = {};
            }
            
            console.log('🔧 Tool call:', currentToolUse.name, currentToolUse.input);
            
            yield {
              type: 'tool_executing',
              tool: currentToolUse.name,
              toolInput: currentToolUse.input
            };
            
            // Execute tool on backend
            const toolResult = await this.executeToolOnBackend(
              currentToolUse.name,
              currentToolUse.input
            );
            
            // Add tool use to assistant content
            assistantContent.push({
              type: 'tool_use',
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: currentToolUse.input
            });
            
            yield {
              type: 'tool_complete',
              tool: currentToolUse.name,
              toolResult: toolResult
            };
            
            // Add assistant message with tool use to history
            this.conversationHistory.push({
              role: "assistant",
              content: assistantContent
            });
            
            // Add tool result to history
            this.conversationHistory.push({
              role: "user",
              content: [{
                type: "tool_result",
                tool_use_id: currentToolUse.id,
                content: JSON.stringify(toolResult)
              }]
            });
            
            // Continue conversation with tool results
            yield* this.continueAfterTool();
            
            currentToolUse = null;
            return;
          }
        }
      }
      
      // No tools used - add final assistant message to history
      if (assistantContent.length > 0 || textAccumulator) {
        if (textAccumulator) {
          assistantContent.push({
            type: 'text',
            text: textAccumulator
          });
        }
        this.conversationHistory.push({
          role: "assistant",
          content: assistantContent
        });
      }
      
      yield { type: 'done' };
      
    } catch (error) {
      console.error('❌ Claude API error:', error);
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
  
  // ===========================================================================
  // CONTINUE AFTER TOOL EXECUTION
  // ===========================================================================
  
  private async *continueAfterTool(): AsyncGenerator<ChatChunk> {
    console.log('🔄 Continuing conversation after tool execution...');
    
    try {
      const stream = await this.client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        tools: this.getTools() as Anthropic.Tool[],
        messages: this.conversationHistory
      });
      
      const assistantContent: Anthropic.ContentBlock[] = [];
      let textAccumulator = '';
      
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          textAccumulator += event.delta.text;
          yield {
            type: 'text',
            content: event.delta.text
          };
        }
        
        if (event.type === 'content_block_stop' && textAccumulator) {
          assistantContent.push({
            type: 'text',
            text: textAccumulator
          });
          textAccumulator = '';
        }
      }
      
      // Add final response to history
      if (assistantContent.length > 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: assistantContent
        });
      }
      
      yield { type: 'done' };
      
    } catch (error) {
      console.error('❌ Error continuing after tool:', error);
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Error processing tool results'
      };
    }
  }
  
  // ===========================================================================
  // BACKEND TOOL EXECUTION
  // ===========================================================================
  
  private async executeToolOnBackend(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    console.log(`🔄 Executing tool: ${toolName}`, params);
    
    try {
      switch (toolName) {
        case 'search_google_places':
          return await this.executeQuickSearch(params);
        
        case 'deep_research':
          return await this.executeDeepResearch(params);
        
        case 'email_finder':
          return await this.executeEmailFinder(params);
        
        case 'create_scheduled_monitor':
          return await this.executeScheduledMonitor(params);
        
        case 'get_nudges':
          return await this.executeGetNudges(params);
        
        default:
          return { error: true, message: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      console.error(`❌ Tool execution failed: ${toolName}`, error);
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Individual Tool Implementations
  // ---------------------------------------------------------------------------
  
  /**
   * Safely parse JSON response with comprehensive error handling
   */
  private async safeParseResponse(response: Response, toolName: string): Promise<any> {
    const contentType = response.headers.get('content-type');
    
    let text: string;
    try {
      text = await response.text();
    } catch (readError) {
      console.error(`[${toolName}] Failed to read response body:`, readError);
      throw new Error('Failed to read server response');
    }
    
    console.log(`[${toolName}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${toolName}] Response status: ${response.status} ${response.statusText}`);
    console.log(`[${toolName}] Content-Type: ${contentType || 'not set'}`);
    console.log(`[${toolName}] Response length: ${text.length} chars`);
    console.log(`[${toolName}] Response preview: ${text.substring(0, 500)}`);
    if (text.length > 500) {
      console.log(`[${toolName}] ... (truncated, ${text.length - 500} more chars)`);
    }
    console.log(`[${toolName}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Check for empty response
    if (!text || text.trim().length === 0) {
      throw new Error('Server returned empty response');
    }
    
    // Check if response is OK
    if (!response.ok) {
      console.error(`[${toolName}] HTTP Error ${response.status}`);
      
      // Try to extract error message from JSON response
      try {
        const errorJson = JSON.parse(text);
        const errorMsg = errorJson.error || errorJson.message || errorJson.details || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      } catch (parseErr) {
        // If not JSON, use raw text
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error(`Server error (${response.status}): HTML response received - check server logs`);
        }
        throw new Error(`Server error (${response.status}): ${text.substring(0, 200)}`);
      }
    }
    
    // Check content type
    if (contentType && !contentType.includes('application/json')) {
      console.warn(`[${toolName}] ⚠️ Unexpected content-type: ${contentType}`);
    }
    
    // Try to parse JSON
    try {
      // Trim whitespace that might cause parsing issues
      const trimmedText = text.trim();
      
      // Check for common JSON issues
      if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html')) {
        throw new Error('Server returned HTML instead of JSON');
      }
      
      if (trimmedText.startsWith('Error:') || trimmedText.startsWith('error:')) {
        throw new Error(trimmedText);
      }
      
      const parsed = JSON.parse(trimmedText);
      console.log(`[${toolName}] ✅ JSON parsed successfully`);
      return parsed;
      
    } catch (parseError) {
      console.error(`[${toolName}] ❌ JSON parse failed:`, parseError);
      console.error(`[${toolName}] Raw text that failed to parse:`, text);
      
      // Try to identify the issue
      const parseErrorMsg = (parseError as Error).message;
      if (parseErrorMsg.includes('position')) {
        // Extract position from error
        const posMatch = parseErrorMsg.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]);
          console.error(`[${toolName}] Error at position ${pos}:`);
          console.error(`[${toolName}] Context: ...${text.substring(Math.max(0, pos - 50), pos + 50)}...`);
        }
      }
      
      throw new Error(`Invalid JSON response: ${parseErrorMsg}. Check console for details.`);
    }
  }
  
  private async executeQuickSearch(params: Record<string, unknown>) {
    const { query, location, country = 'GB', maxResults = 20 } = params;
    const locationText = `${location}, ${country}`;
    
    const url = addDevAuthParams('/api/places/search');
    const fullUrl = buildApiUrl(url);
    
    console.log('[QuickSearch] Calling:', fullUrl);
    console.log('[QuickSearch] Params:', { query, locationText, maxResults });
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query, locationText, maxResults })
    });
    
    const result = await this.safeParseResponse(response, 'QuickSearch');
    
    return {
      success: true,
      query,
      location: locationText,
      totalResults: result.places?.length || 0,
      places: (result.places || []).slice(0, maxResults as number).map((place: any) => ({
        name: place.displayName?.text || place.name,
        address: place.formattedAddress || place.address,
        phone: place.nationalPhoneNumber || place.phone,
        website: place.websiteUri || place.website,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        placeId: place.id || place.placeId
      }))
    };
  }
  
  private async executeDeepResearch(params: Record<string, unknown>) {
    const { prompt, intensity = 'thorough' } = params;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('[DeepResearch] Starting deep research execution');
    console.log('[DeepResearch] Prompt:', prompt);
    console.log('[DeepResearch] Intensity:', intensity);
    
    // Get user for authentication
    const user = this.getDevUser();
    console.log('[DeepResearch] User for auth:', user);
    
    const url = addDevAuthParams('/api/deep-research');
    const fullUrl = buildApiUrl(url);
    
    console.log('[DeepResearch] Full URL:', fullUrl);
    
    try {
      // Include userId in the request body as well (backend accepts both URL params and body)
      const requestBody = { 
        prompt, 
        intensity,
        userId: user?.id || 'demo-user'
      };
      console.log('[DeepResearch] Request body:', JSON.stringify(requestBody));
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Add session ID header if available
          ...(this.getSessionId() ? { 'x-session-id': this.getSessionId()! } : {})
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      
      console.log('[DeepResearch] Response received');
      console.log('[DeepResearch] Status:', response.status, response.statusText);
      
      // Handle 401 specifically
      if (response.status === 401) {
        console.error('[DeepResearch] ❌ 401 Unauthorized - Authentication failed');
        return {
          success: false,
          error: true,
          message: 'Authentication failed (401). Please refresh the page and try again.',
          details: 'The server rejected the request due to missing or invalid authentication.',
          troubleshooting: [
            'Try refreshing the page',
            'Check if you are logged in',
            'Clear localStorage and reload'
          ]
        };
      }
      
      const result = await this.safeParseResponse(response, 'DeepResearch');
      
      console.log('[DeepResearch] Parsed result:', result);
      
      // Backend returns { run: { id, label, status, ... } }
      const run = result.run || result;
      
      console.log('[DeepResearch] Extracted run:', run);
      console.log('═══════════════════════════════════════════════════════');
      
      return {
        success: true,
        message: 'Deep research started successfully!',
        runId: run.id || result.runId,
        label: run.label || prompt,
        status: run.status || 'running',
        estimatedTime: intensity === 'quick' ? '30 seconds' : intensity === 'thorough' ? '1-2 minutes' : '2-3 minutes',
        viewInPanel: true,
        note: 'Research is running in the background. Check the left sidebar for progress.'
      };
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════');
      console.error('[DeepResearch] ❌ EXECUTION FAILED');
      console.error('[DeepResearch] Error type:', error?.constructor?.name);
      console.error('[DeepResearch] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[DeepResearch] Full error:', error);
      console.error('═══════════════════════════════════════════════════════');
      
      // Return error in a format Claude will display to user
      return {
        success: false,
        error: true,
        message: `Deep research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: 'Check the browser console (F12) for more information.',
        troubleshooting: [
          'Check if the backend server is running',
          'Check the Network tab in DevTools for the actual response',
          'Look for any CORS or authentication errors'
        ]
      };
    }
  }
  
  /**
   * Get user from localStorage for dev authentication
   */
  private getDevUser(): { id: string; email: string } | null {
    try {
      const userJson = localStorage.getItem('wyshbone_user');
      if (userJson) {
        return JSON.parse(userJson);
      }
    } catch (e) {
      console.warn('[ClaudeService] Failed to get user from localStorage:', e);
    }
    return null;
  }
  
  /**
   * Get session ID from localStorage
   */
  private getSessionId(): string | null {
    try {
      return localStorage.getItem('wyshbone_sid');
    } catch {
      return null;
    }
  }
  
  private async executeEmailFinder(params: Record<string, unknown>) {
    const { query, location, targetRole = 'owner' } = params;
    
    const url = addDevAuthParams('/api/batch/create');
    const fullUrl = buildApiUrl(url);
    
    console.log('[EmailFinder] Calling:', fullUrl);
    console.log('[EmailFinder] Params:', { businessType: query, location, targetRole });
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        businessType: query,
        location,
        targetRole,
        maxResults: 10
      })
    });
    
    const result = await this.safeParseResponse(response, 'EmailFinder');
    
    return {
      success: true,
      message: 'Email finder job started',
      jobId: result.jobId || result.id,
      status: 'running',
      estimatedTime: '2-5 minutes'
    };
  }
  
  private async executeScheduledMonitor(params: Record<string, unknown>) {
    const { label, schedule, description } = params;
    
    const url = addDevAuthParams('/api/monitors');
    const fullUrl = buildApiUrl(url);
    
    console.log('[ScheduledMonitor] Calling:', fullUrl);
    console.log('[ScheduledMonitor] Params:', { label, schedule, description });
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label, schedule, description, type: 'business_search' })
    });
    
    const result = await this.safeParseResponse(response, 'ScheduledMonitor');
    
    return {
      success: true,
      message: `Scheduled monitor created: ${label}`,
      monitorId: result.id,
      schedule,
      nextRun: result.nextRun
    };
  }
  
  private async executeGetNudges(params: Record<string, unknown>) {
    const { context } = params;
    
    const url = addDevAuthParams('/api/nudges');
    const fullUrl = buildApiUrl(url);
    
    console.log('[GetNudges] Calling:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    const result = await this.safeParseResponse(response, 'GetNudges');
    
    return {
      success: true,
      nudges: result.nudges || [],
      context
    };
  }
  
  // ===========================================================================
  // CONVERSATION MANAGEMENT
  // ===========================================================================
  
  /**
   * Clear conversation history - use when starting a new topic
   */
  clearConversation(): void {
    this.conversationHistory = [];
    console.log('🧹 Conversation history cleared');
  }
  
  /**
   * Get current conversation length
   */
  getConversationLength(): number {
    return this.conversationHistory.length;
  }
  
  /**
   * Check if conversation should be cleared (too long)
   */
  shouldClearConversation(): boolean {
    return this.conversationHistory.length > this.MAX_MESSAGES;
  }
}

// Export singleton instance
const claudeService = new ClaudeService();
export default claudeService;

// Also export the class for testing
export { ClaudeService };

// Legacy export for backwards compatibility
export async function sendToClaude(message: string): Promise<{ text: string; toolUsed?: string; toolResult?: unknown }> {
  let fullText = '';
  let toolUsed: string | undefined;
  let toolResult: unknown;
  
  for await (const chunk of claudeService.sendMessage(message)) {
    if (chunk.type === 'text' && chunk.content) {
      fullText += chunk.content;
    }
    if (chunk.type === 'tool_complete') {
      toolUsed = chunk.tool;
      toolResult = chunk.toolResult;
    }
    if (chunk.type === 'error') {
      throw new Error(chunk.message);
    }
  }
  
  return { text: fullText, toolUsed, toolResult };
}
