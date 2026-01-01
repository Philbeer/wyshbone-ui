/**
 * ClaudeToolService - Frontend service for Claude AI agent
 * 
 * SECURITY: This service calls our BACKEND endpoint, NOT the Anthropic API directly.
 * The API key stays secure on the server, never exposed to the browser.
 * 
 * Flow:
 * 1. User sends message
 * 2. Frontend calls POST /api/agent/chat
 * 3. Backend calls Anthropic API with our tools
 * 4. Claude decides what tools to use
 * 5. Backend executes tools via executeAction()
 * 6. Claude formats response
 * 7. Response returned to frontend
 */

import { apiRequest } from '@/lib/queryClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolUsed {
  name: string;
  input: Record<string, unknown>;
  result: {
    ok: boolean;
    data?: unknown;
    note?: string;
    error?: string;
  };
}

export interface ChatResponse {
  message: string;
  toolsUsed?: ToolUsed[];
  error?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class ClaudeToolService {
  private conversationHistory: Message[] = [];
  private userId?: string;

  constructor(userId?: string) {
    this.userId = userId;
  }

  /**
   * Set user ID for tool execution
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
  getHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Send a message to Claude via our backend
   * 
   * The backend handles:
   * - Calling Anthropic API
   * - Tool execution via executeAction()
   * - Multi-turn tool conversations
   * - Response formatting
   */
  async sendMessage(userMessage: string): Promise<ChatResponse> {
    console.log('[ClaudeToolService] Sending:', userMessage.substring(0, 50) + '...');

    try {
      // Call our backend endpoint (NOT Anthropic directly!)
      const response = await apiRequest('POST', '/api/agent/chat', {
        message: userMessage,
        conversationHistory: this.conversationHistory,
        userId: this.userId,
      });

      const data: ChatResponse = await response.json();

      // Update conversation history on success
      if (!data.error) {
        this.conversationHistory.push({
          role: 'user',
          content: userMessage,
        });

        this.conversationHistory.push({
          role: 'assistant',
          content: data.message,
        });

        // Keep history manageable (last 20 messages)
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }
      }

      console.log('[ClaudeToolService] Response received, tools:', data.toolsUsed?.length || 0);
      return data;

    } catch (error: any) {
      console.error('[ClaudeToolService] Error:', error);

      // Handle specific errors
      if (error.message?.includes('503')) {
        return {
          message: '⚠️ The AI agent is temporarily unavailable. Please check that ANTHROPIC_API_KEY is set in your .env file.',
          error: 'Service unavailable',
        };
      }

      if (error.message?.includes('401')) {
        return {
          message: '⚠️ Authentication error. Please try logging in again.',
          error: 'Auth error',
        };
      }

      return {
        message: '❌ Sorry, something went wrong. Please try again.',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a follow-up action
   */
  async sendFollowUp(prompt: string): Promise<ChatResponse> {
    return this.sendMessage(prompt);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ClaudeToolService | null = null;

export function getClaudeToolService(userId?: string): ClaudeToolService {
  if (!instance) {
    instance = new ClaudeToolService(userId);
  } else if (userId) {
    instance.setUserId(userId);
  }
  return instance;
}

export default ClaudeToolService;


