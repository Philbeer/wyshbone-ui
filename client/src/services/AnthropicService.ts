/**
 * AnthropicService - Frontend client for Claude AI agent
 * 
 * This service calls the backend /api/agent/chat endpoint which uses
 * the Anthropic Claude API with tool use capabilities.
 * 
 * The backend handles:
 * - Claude API calls (API key is kept secure on server)
 * - Tool execution via executeAction()
 * - Multi-turn tool use conversations
 * 
 * This frontend service handles:
 * - Formatting messages for the API
 * - Managing conversation history
 * - Error handling and retries
 */

import { apiRequest } from '@/lib/queryClient';

// =============================================================================
// TYPES
// =============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolResult {
  name: string;
  input: Record<string, unknown>;
  result: {
    ok: boolean;
    data?: unknown;
    note?: string;
    error?: string;
  };
}

export interface AgentResponse {
  message: string;
  toolsUsed?: ToolResult[];
  error?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class AnthropicService {
  private conversationHistory: ConversationMessage[] = [];
  private userId?: string;

  constructor(userId?: string) {
    this.userId = userId;
  }

  /**
   * Set the user ID for tool execution
   */
  setUserId(userId: string) {
    this.userId = userId;
  }

  /**
   * Clear conversation history (start fresh)
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Load conversation history (e.g., from saved conversation)
   */
  loadHistory(messages: ConversationMessage[]) {
    this.conversationHistory = [...messages];
  }

  /**
   * Send a message to Claude and get a response
   * 
   * @param message - The user's message
   * @returns The agent's response with any tools used
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    console.log('[AnthropicService] Sending message:', message.substring(0, 50) + '...');

    try {
      const response = await apiRequest('POST', '/api/agent/chat', {
        message,
        conversationHistory: this.conversationHistory,
        userId: this.userId,
      });

      const data: AgentResponse = await response.json();

      // Update conversation history
      this.conversationHistory.push({
        role: 'user',
        content: message,
      });

      this.conversationHistory.push({
        role: 'assistant',
        content: data.message,
      });

      // Keep history manageable (last 20 messages)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      console.log('[AnthropicService] Response received, tools used:', data.toolsUsed?.length || 0);

      return data;

    } catch (error: any) {
      console.error('[AnthropicService] Error:', error);

      // Handle specific error cases
      if (error.message?.includes('503') || error.message?.includes('unavailable')) {
        return {
          message: '⚠️ The AI agent is currently unavailable. The ANTHROPIC_API_KEY may not be configured. Please check with your administrator.',
          error: 'Agent unavailable',
        };
      }

      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        return {
          message: '⚠️ Authentication error. Please try logging in again.',
          error: 'Authentication error',
        };
      }

      return {
        message: '❌ Sorry, I encountered an error. Please try again.',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a message with a specific follow-up context
   * (for when user clicks a suggested action)
   */
  async sendFollowUp(action: string, context?: Record<string, unknown>): Promise<AgentResponse> {
    // Build a natural follow-up message
    let message = action;

    if (context) {
      if (context.query && context.location) {
        message = `${action} for ${context.query} in ${context.location}`;
      } else if (context.topic) {
        message = `${action}: ${context.topic}`;
      }
    }

    return this.sendMessage(message);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: AnthropicService | null = null;

export function getAnthropicService(userId?: string): AnthropicService {
  if (!serviceInstance) {
    serviceInstance = new AnthropicService(userId);
  } else if (userId) {
    serviceInstance.setUserId(userId);
  }
  return serviceInstance;
}

/**
 * Create a new service instance (for isolated conversations)
 */
export function createAnthropicService(userId?: string): AnthropicService {
  return new AnthropicService(userId);
}

export default AnthropicService;


