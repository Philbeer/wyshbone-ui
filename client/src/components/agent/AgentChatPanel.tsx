/**
 * AgentChatPanel - Claude AI chat via backend API
 * 
 * This uses the backend /api/agent/chat endpoint which handles Claude
 * authentication server-side. This is more secure than calling Claude
 * directly from the browser.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Send, 
  Search,
  Microscope,
  Mail,
  Clock,
  Loader2,
  User,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { useAgentStatus } from "@/contexts/AgentStatusContext";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";
import { buildApiUrl, addDevAuthParams } from "@/lib/queryClient";
import { LayoutToggle } from "@/components/LayoutToggle";

function TowerBadgeInline() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('TOWER_LOOP_CHAT_MODE') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    const handler = (e: Event) => setOn((e as CustomEvent).detail === true);
    window.addEventListener('tower-chat-mode-changed', handler);
    return () => window.removeEventListener('tower-chat-mode-changed', handler);
  }, []);
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200 select-none" title="Tower Loop Chat Mode is active">
      Tower
    </span>
  );
}

// =============================================================================
// TYPES
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  isError?: boolean;
}

// =============================================================================
// QUICK ACTIONS
// =============================================================================

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "find",
    label: "Find businesses",
    icon: <Search className="w-4 h-4" />,
    prompt: "Find breweries in Manchester",
  },
  {
    id: "research",
    label: "Research a market",
    icon: <Microscope className="w-4 h-4" />,
    prompt: "Research the craft beer market in London",
  },
  {
    id: "emails",
    label: "Find contact emails",
    icon: <Mail className="w-4 h-4" />,
    prompt: "Find emails for pubs in Leeds",
  },
  {
    id: "monitor",
    label: "Set up monitoring",
    icon: <Clock className="w-4 h-4" />,
    prompt: "Monitor new breweries in Yorkshire weekly",
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

interface AgentChatPanelProps {
  className?: string;
  defaultCountry?: string;
}

export function AgentChatPanel({ 
  className, 
  defaultCountry = 'GB' 
}: AgentChatPanelProps) {
  const { user } = useUser();
  const { status, setStatus } = useAgentStatus();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `👋 Hi! I'm your AI sales agent powered by Claude.

I can help you with:
🔍 **Find businesses** - Search for prospects in any location
🔬 **Research** - Get detailed company and market insights
📧 **Find emails** - Discover verified contact information
⏰ **Monitor** - Set up automated tracking

What would you like to work on?`,
        timestamp: new Date(),
      }]);
    }
  }, [messages.length]);

  // =============================================================================
  // SEND MESSAGE - BACKEND API CALL
  // =============================================================================

  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isProcessing) return;

    setInput("");
    setIsProcessing(true);
    setStatus('thinking');

    // Add user message
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    // Add loading indicator
    const loadingId = Date.now().toString() + '_loading';
    setMessages(prev => [...prev, {
      id: loadingId,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date(),
      isLoading: true
    }]);

    try {
      console.log('[AgentChatPanel] Calling backend /api/agent/chat...');
      setStatus('running');
      
      // Call backend API instead of Claude directly
      const sessionId = localStorage.getItem('wyshbone_sid');
      const url = buildApiUrl(addDevAuthParams('/api/agent/chat'));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId ? { 'x-session-id': sessionId } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          userId: user?.id,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[AgentChatPanel] Response received:', data);
      
      // Remove loading and add response
      const responseId = Date.now().toString() + '_response';
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: responseId,
          role: 'assistant',
          content: data.response || data.message || data.text || 'No response received',
          timestamp: new Date()
        }];
      });
      
      // Log result
      console.log('[AgentChatPanel] Response complete:', {
        hasResponse: !!data.response,
        toolUsed: data.toolUsed,
      });
      
      setStatus('idle');

    } catch (error: any) {
      console.error('[AgentChatPanel] API error:', error);
      
      // Remove loading, add error message
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ Error connecting to AI agent: ${error.message || 'Unknown error'}

This chat uses the backend API for Claude access.
Please check:
1. The backend server is running
2. ANTHROPIC_API_KEY is set in server .env
3. You are logged in`,
          timestamp: new Date(),
          isError: true
        }];
      });
      
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, setStatus, user]);

  const handleQuickAction = (action: QuickAction) => {
    handleSend(action.prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '🔄 Conversation cleared. How can I help you?',
      timestamp: new Date(),
    }]);
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className={cn("flex flex-col h-full bg-sidebar", className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary/20">
              <img 
                src={wyshboneLogo} 
                alt="Wyshbone Agent" 
                className="w-full h-full object-cover"
              />
            </div>
            <span 
              className={cn(
                "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-sidebar",
                status === "running" && "bg-green-500 animate-pulse",
                status === "thinking" && "bg-amber-500 animate-pulse",
                status === "idle" && "bg-gray-400",
                status === "error" && "bg-red-500"
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sidebar-foreground">
                AI Sales Agent
              </h2>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <AgentStatusBadge status={status} className="text-xs" />
          </div>
          <div className="flex items-center gap-1">
            <LayoutToggle variant="inline" />
            {import.meta.env.DEV && <TowerBadgeInline />}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearHistory}
              title="Clear conversation"
              className="h-8 w-8"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {messages.map((message) => (
            <div 
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === 'user' && "flex-row-reverse"
              )}
            >
              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center",
                message.role === 'user' 
                  ? "bg-primary" 
                  : message.isError 
                    ? "bg-red-500" 
                    : message.isLoading 
                      ? "bg-amber-500" 
                      : "bg-muted"
              )}>
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-primary-foreground" />
                ) : message.isError ? (
                  <AlertCircle className="w-4 h-4 text-white" />
                ) : message.isLoading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <img src={wyshboneLogo} alt="Agent" className="w-full h-full object-cover" />
                )}
              </div>

              {/* Message bubble */}
              <div className={cn(
                "flex-1 max-w-[85%]",
                message.role === 'user' && "flex flex-col items-end"
              )}>
                <div className={cn(
                  "rounded-lg p-3",
                  message.role === 'user' 
                    ? "bg-primary text-primary-foreground" 
                    : message.isError
                      ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                      : message.isLoading
                        ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
                        : "bg-card border border-border"
                )}>
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 p-4 border-t border-sidebar-border">
          <div className="mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick start
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className="justify-start h-auto py-2 px-3 text-left"
                onClick={() => handleQuickAction(action)}
                disabled={isProcessing}
              >
                {action.icon}
                <span className="ml-2 text-xs truncate">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-sidebar-border bg-sidebar">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything..."
            className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isProcessing}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            size="icon"
            className="flex-shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Direct Claude API • Press Enter to send
        </p>
      </div>
    </div>
  );
}

export default AgentChatPanel;
