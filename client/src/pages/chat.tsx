import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authedFetch, addDevAuthParams, buildApiUrl, handleApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, CheckCircle2, Search, Building2, HelpCircle, Activity } from "lucide-react";
import type { ChatMessage, AddNoteResponse, DeepResearchCreateRequest } from "@shared/schema";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";
import { LocationSuggestions } from "@/components/LocationSuggestions";
import { CopyButton } from "@/components/ui/copy-button";
import WishboneSidebar from "@/components/WishboneSidebar";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { AddToXeroDialog } from "@/components/AddToXeroDialog";
import { useSidebarFlash } from "@/contexts/SidebarFlashContext";
import { subscribeSupervisorMessages, type SupervisorMessage } from "@/lib/supabase";
import { useUserGoal } from "@/hooks/use-user-goal";
import { publishEvent } from "@/lib/events";
import { getCurrentVerticalId } from "@/contexts/VerticalContext";
import { WhatJustHappenedPanel } from "@/components/tower/WhatJustHappenedPanel";
import { useResultsPanel } from "@/contexts/ResultsPanelContext";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";

type Message = ChatMessage & {
  id: string;
  timestamp: Date;
  source?: 'user' | 'assistant' | 'supervisor';
};

type SystemMessage = {
  id: string;
  type: "system";
  content: string;
  timestamp: Date;
  searchResults?: Array<{
    place_id: string;
    name: string;
    address?: string;
    phone?: string;
    rating?: number;
  }>;
};

type DisplayMessage = Message | SystemMessage;

interface ChatPageProps {
  defaultCountry?: string;
  onInjectSystemMessage?: (fn: (msg: string) => void) => void;
  addRun?: (run: any) => string;
  updateRun?: (runId: string, updates: any) => void;
  getActiveRunId?: () => string | null;
  onNewChat?: (fn: () => void) => void;
  onLoadConversation?: (fn: (conversationId: string) => void) => void;
}

export default function ChatPage({ defaultCountry = 'GB', onInjectSystemMessage, addRun, updateRun, getActiveRunId, onNewChat, onLoadConversation }: ChatPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const { trigger: triggerSidebarFlash } = useSidebarFlash();
  const { goal, hasGoal, isLoading: isLoadingGoal } = useUserGoal();
  const { openResults } = useResultsPanel();
  const { setCurrentClientRequestId, setPinnedClientRequestId } = useCurrentRequest();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(() => {
    // Load conversationId from localStorage on mount
    return localStorage.getItem('currentConversationId') || undefined;
  });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedHistoryRef = useRef(false);
  const hasShownGreetingRef = useRef(false); // Track if we've shown the auto-greeting
  const [batchJobTracking, setBatchJobTracking] = useState<Map<string, string>>(new Map()); // messageId -> batchId
  const batchPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showXeroDialog, setShowXeroDialog] = useState(false);
  
  // Functions panel visibility control (default hidden to not interfere with agentic flow)
  const [showFunctionsPanel, setShowFunctionsPanel] = useState(false);
  
  // UI-18: "What just happened?" Tower log viewer
  const [isWhatJustHappenedOpen, setWhatJustHappenedOpen] = useState(false);
  
  // MEGA Agent mode toggle
  const [chatMode, setChatMode] = useState<"standard" | "mega">(() => {
    return (localStorage.getItem('chatMode') as "standard" | "mega") || "standard";
  });
  const [megaChips, setMegaChips] = useState<string[]>([]);
  
  // Supervisor integration
  const [supervisorTaskId, setSupervisorTaskId] = useState<string | null>(null);
  const [isWaitingForSupervisor, setIsWaitingForSupervisor] = useState(false);
  const supervisorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Progress stack for chat status events (Part 2 implementation)
  type ProgressStage = 'ack' | 'classifying' | 'planning' | 'executing' | 'finalising' | 'completed' | 'failed';
  interface ProgressEvent {
    stage: ProgressStage;
    message: string;
    ts: number;
    toolName?: string;
  }
  const [progressStack, setProgressStack] = useState<ProgressEvent[]>([]);
  const [activeClientRequestId, setActiveClientRequestId] = useState<string | null>(null);
  
  // Queued message for soft lock (Part 3 implementation)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const queuedMessageRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);

  // Helper to get stage icon and label
  const getStageDisplay = (stage: ProgressStage, toolName?: string): { icon: string; label: string } => {
    switch (stage) {
      case 'ack':
        return { icon: '\u2714', label: 'OK, working' };
      case 'classifying':
        return { icon: '\u{1F50D}', label: 'Classifying intent' };
      case 'planning':
        return { icon: '\u{1F50D}', label: 'Planning' };
      case 'executing':
        if (toolName) {
          if (toolName.toLowerCase().includes('search') || toolName.toLowerCase().includes('wyshbone')) {
            return { icon: '\u{1F50E}', label: 'Searching Wyshbone database' };
          }
          if (toolName.toLowerCase().includes('google') || toolName.toLowerCase().includes('places')) {
            return { icon: '\u{1F5FA}', label: 'Running Google Places' };
          }
          return { icon: '\u{1F527}', label: `Executing ${toolName.replace(/_/g, ' ')}` };
        }
        return { icon: '\u{1F527}', label: 'Executing tools' };
      case 'finalising':
        return { icon: '\u270D', label: 'Finalising response' };
      case 'completed':
        return { icon: '\u2705', label: 'Done' };
      case 'failed':
        return { icon: '\u274C', label: 'Failed' };
      default:
        return { icon: '\u2022', label: stage };
    }
  };

  // Persist chat mode to localStorage
  useEffect(() => {
    localStorage.setItem('chatMode', chatMode);
  }, [chatMode]);

  // Demo mode clean slate: Clear all state on EVERY page load for demo users
  useEffect(() => {
    const isDemoUser =
      user.email.includes('demo@') ||
      user.email.endsWith('@wyshbone.demo') ||
      user.id === 'temp-demo-user' ||
      user.id.startsWith('demo-');

    if (isDemoUser) {
      console.log('🎭 Demo mode detected: Resetting to clean slate on page load');

      // Clear all persisted state - runs on EVERY page load/refresh
      localStorage.removeItem('currentConversationId');
      localStorage.removeItem('chatMode');
      sessionStorage.removeItem(`labelsRegenerated_${user.id}`);

      // Clear any other conversation-related storage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('conversation_') || key.includes('_messages')) {
          localStorage.removeItem(key);
        }
      });

      // Clear React Query cache (goals, cached API data, etc.)
      queryClient.clear();

      // Reset component state
      setMessages([]);
      setConversationId(undefined);
      setChatMode('standard');
      hasLoadedHistoryRef.current = false;
      hasShownGreetingRef.current = false;

      console.log('✅ Demo mode clean slate applied - fresh "first time" experience ready');
    }
  }, [user.id, user.email, queryClient]);

  // Subscribe to Supervisor responses via Supabase realtime
  useEffect(() => {
    if (!conversationId) return;

    console.log('🔔 Setting up Supervisor subscription for conversation:', conversationId);
    
    const channel = subscribeSupervisorMessages(conversationId, (supervisorMessage: SupervisorMessage) => {
      console.log('🤖 Received Supervisor message:', supervisorMessage);
      
      // Convert Supervisor message to display message format
      const displayMessage: Message = {
        id: supervisorMessage.id,
        role: 'assistant',
        content: supervisorMessage.content,
        timestamp: new Date(supervisorMessage.created_at),
        source: 'supervisor',
      };
      
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some(m => m.id === displayMessage.id)) {
          return prev;
        }
        return [...prev, displayMessage];
      });

      // Publish event for message received from supervisor
      publishEvent("CHAT_MESSAGE_RECEIVED", {
        conversationId: supervisorMessage.conversation_id,
        messageId: supervisorMessage.id,
        content: supervisorMessage.content,
        source: "supervisor",
      });
      
      // Clear waiting state and timeout
      setIsWaitingForSupervisor(false);
      setSupervisorTaskId(null);
      if (supervisorTimeoutRef.current) {
        clearTimeout(supervisorTimeoutRef.current);
        supervisorTimeoutRef.current = null;
      }
      
      // Show toast notification (auto-scroll handled by existing useEffect on messages)
      toast({
        title: "Supervisor Response",
        description: "Your lead generation results are ready!",
      });
    });

    // Cleanup subscription on unmount or conversation change
    return () => {
      if (channel) {
        console.log('🔕 Cleaning up Supervisor subscription');
        channel.unsubscribe();
      }
    };
  }, [conversationId, toast]);

  const detectDeepResearchIntent = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    const researchKeywords = /\b(research|investigate|analyze|study|explore|deep dive|comprehensive|thorough|detailed report|sources|citations|evidence|findings|create.*report|write.*report|compile.*report)\b/;
    const actionKeywords = /\b(find|search|get|show|list|discover|gather|collect|do|make|create|write|compile|generate|build)\b/;
    
    // If it has strong research indicators, return true
    const strongResearchIndicators = /\b(deep dive|detailed report|research.*for me|do.*research|create.*report|write.*report|comprehensive report)\b/;
    if (strongResearchIndicators.test(lowerText)) {
      return true;
    }
    
    // Otherwise must have both research keywords and action words
    return researchKeywords.test(lowerText) && actionKeywords.test(lowerText);
  };

  const startDeepResearch = async (request: DeepResearchCreateRequest) => {
    try {
      // UI-16: Include current vertical in deep research request
      const verticalId = getCurrentVerticalId();
      console.log(`🔬 Starting deep research with vertical: ${verticalId}`);
      
      const response = await apiRequest("POST", "/api/deep-research", {
        ...request,
        conversationId,
        userId: user.id,
        verticalId,
      });

      const data = await response.json();
      const run = data.run;
      
      // Add to sidebar immediately
      if (addRun) {
        addRun({
          id: run.id,
          label: run.label,
          startedAt: new Date(run.createdAt).toISOString(),
          status: run.status,
          runType: "deep_research",
          outputPreview: run.outputPreview,
        });
        triggerSidebarFlash('deepResearch');
      }
      
      const systemMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `🔬 Deep research started: "${request.label || request.prompt}". Check the sidebar for progress.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
      
      return run;
    } catch (error: any) {
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to start deep research: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation history ONCE on mount from localStorage
  useEffect(() => {
    const loadHistory = async () => {
      // Only run once on mount
      if (hasLoadedHistoryRef.current) return;
      hasLoadedHistoryRef.current = true;
      
      // Get conversationId from localStorage
      const storedConversationId = localStorage.getItem('currentConversationId');
      if (!storedConversationId) return;
      
      setIsLoadingHistory(true);
      try {
        const response = await authedFetch(`/api/debug/conversations/${storedConversationId}/messages`);
        if (response.ok) {
          const data = await response.json();
          const historicalMessages: Message[] = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));
          if (historicalMessages.length > 0) {
            setMessages(historicalMessages);
            console.log(`📜 Loaded ${historicalMessages.length} messages from conversation ${storedConversationId}`);
          }
        }
      } catch (error) {
        handleApiError(error, "load conversation history");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, []); // Empty deps - only run ONCE on mount

  // Persist conversationId to localStorage
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('currentConversationId', conversationId);
    }
  }, [conversationId]);

  // REMOVED: Goal prompt blocking logic
  // Micro goals like "find pubs in Devon" must execute immediately
  // Long-term goal capture is optional and accessed via the "My Goal" panel in sidebar

  // Poll batch job statuses and update messages when complete
  useEffect(() => {
    const pollBatchJobs = async () => {
      if (batchJobTracking.size === 0) return;

      for (const [messageId, batchId] of Array.from(batchJobTracking.entries())) {
        try {
          const response = await authedFetch(`/api/batch/${batchId}`);
          if (response.ok) {
            const job = await response.json();
            
            if (job.status === 'completed') {
              // Update message to show completion
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === messageId && 'content' in msg) {
                    const updatedContent = msg.content
                      .replace(/⏳ Running/g, '✅ Completed')
                      .replace(/⏳/g, '✅');
                    return { ...msg, content: updatedContent };
                  }
                  return msg;
                })
              );
              
              // Remove from tracking
              setBatchJobTracking((prev) => {
                const newMap = new Map(prev);
                newMap.delete(messageId);
                return newMap;
              });

              console.log(`✅ Batch job ${batchId} completed`);
            }
          }
        } catch (error) {
          console.error(`Error polling batch job ${batchId}:`, error);
        }
      }
    };

    // Start polling if we have batch jobs to track
    if (batchJobTracking.size > 0 && !batchPollIntervalRef.current) {
      batchPollIntervalRef.current = setInterval(pollBatchJobs, 5000); // Poll every 5 seconds
    }

    // Stop polling if no more batch jobs
    if (batchJobTracking.size === 0 && batchPollIntervalRef.current) {
      clearInterval(batchPollIntervalRef.current);
      batchPollIntervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (batchPollIntervalRef.current) {
        clearInterval(batchPollIntervalRef.current);
        batchPollIntervalRef.current = null;
      }
    };
  }, [batchJobTracking]);

  // Expose send message function to parent (use ref to avoid dependency issues)
  const handleSendRef = useRef<((content?: string) => void) | null>(null);
  const setMessagesRef = useRef<React.Dispatch<React.SetStateAction<DisplayMessage[]>> | null>(null);

  useEffect(() => {
    handleSendRef.current = handleSend;
    setMessagesRef.current = setMessages;
  });

  useEffect(() => {
    if (onInjectSystemMessage) {
      const injectMessage = (content: string, asUser: boolean = true) => {
        if (asUser) {
          // Send to AI
          handleSendRef.current?.(content);
        } else {
          // Add as assistant message directly
          const message: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            timestamp: new Date(),
          };
          setMessagesRef.current?.((prev) => [...prev, message]);
        }
      };
      onInjectSystemMessage(injectMessage);
    }
  }, [onInjectSystemMessage]);

  // Expose new chat function to parent
  useEffect(() => {
    if (onNewChat) {
      const handleNewChat = () => {
        // Abort any active stream first
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // IMPORTANT: Set history loading ref to true FIRST to prevent auto-loading
        hasLoadedHistoryRef.current = true;
        
        // Reset greeting ref so it shows for new chat
        hasShownGreetingRef.current = false;
        
        // Generate a fresh conversation ID for the new chat
        const newConversationId = crypto.randomUUID();
        
        // Clear old conversationId from localStorage and set new one
        localStorage.setItem('currentConversationId', newConversationId);
        
        // Clear all state and set new conversation ID
        setMessages([]);
        setInput("");
        setIsStreaming(false);
        setShowLocationSuggestions(false);
        setConversationId(newConversationId);
        
        console.log(`🆕 Started new chat with ID: ${newConversationId}`);
      };
      onNewChat(handleNewChat);
    }
  }, [onNewChat]);

  // Expose load conversation function to parent
  useEffect(() => {
    if (onLoadConversation) {
      const handleLoadConversation = async (newConversationId: string) => {
        // Abort any active stream first
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        setIsStreaming(false);
        setInput("");
        setShowLocationSuggestions(false);
        
        // Update conversationId
        setConversationId(newConversationId);
        localStorage.setItem('currentConversationId', newConversationId);
        
        // Load conversation messages
        setIsLoadingHistory(true);
        try {
          const response = await authedFetch(`/api/conversations/${newConversationId}/messages`);
          if (response.ok) {
            const messages = await response.json();
            const loadedMessages: DisplayMessage[] = messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant" | "system",
              content: msg.content,
              timestamp: new Date(msg.createdAt),
            }));
            setMessages(loadedMessages);
            hasLoadedHistoryRef.current = true;
            console.log(`📜 Loaded ${loadedMessages.length} messages from conversation ${newConversationId}`);
          } else {
            console.error("Failed to load conversation history");
          }
        } catch (error) {
          handleApiError(error, "load conversation");
        } finally {
          setIsLoadingHistory(false);
        }
      };
      onLoadConversation(handleLoadConversation);
    }
  }, [onLoadConversation]);

  const streamChatResponse = async (conversationMessages: ChatMessage[]) => {
    setIsStreaming(true);
    
    // Generate unique client request ID for idempotency and AFR correlation
    const clientRequestId = crypto.randomUUID();
    
    // Clear progress stack and set active request for new run
    setProgressStack([]);
    setActiveClientRequestId(clientRequestId);
    
    // Immediately notify LiveActivityPanel of new request (before any server events)
    setCurrentClientRequestId(clientRequestId);
    setPinnedClientRequestId(clientRequestId);
    
    // Create assistant message with empty content
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Send conversation to /api/chat endpoint (GPT-5 with web search)
      const sessionId = localStorage.getItem('wyshbone_sid');
      const response = await fetch(buildApiUrl(addDevAuthParams("/api/chat")), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "x-session-id": sessionId } : {}),
        },
        body: JSON.stringify({
          messages: conversationMessages,
          user: { id: user.id, email: user.email },
          defaultCountry: defaultCountry,
          conversationId: conversationId,
          clientRequestId: clientRequestId, // AFR idempotency key
        }),
        signal: abortControllerRef.current.signal,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Handle SSE streaming response from /api/chat
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            
            if (data === '[DONE]') {
              // Stream complete
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              // Handle conversationId from backend
              if (parsed.conversationId) {
                console.log('💬 Received conversationId:', parsed.conversationId);
                setConversationId(parsed.conversationId);
              }
              
              // Handle ACK event (immediate acknowledgment)
              if (parsed.type === 'ack') {
                console.log('✓ ACK received:', parsed.message);
                setActiveClientRequestId(parsed.clientRequestId || clientRequestId);
                setProgressStack([{
                  stage: 'ack',
                  message: parsed.message || 'OK, working',
                  ts: parsed.ts || Date.now(),
                }]);
              }
              
              // Handle STATUS events (progress updates)
              if (parsed.type === 'status' && parsed.stage) {
                console.log(`📊 Status: ${parsed.stage} - ${parsed.message}`);
                setProgressStack((prev) => {
                  const existingIndex = prev.findIndex(p => p.stage === parsed.stage);
                  const newEvent: ProgressEvent = {
                    stage: parsed.stage,
                    message: parsed.message || parsed.stage,
                    ts: parsed.ts || Date.now(),
                    toolName: parsed.toolName,
                  };
                  if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = newEvent;
                    return updated;
                  }
                  return [...prev, newEvent];
                });
                
                // If completed or failed, clear active request after a delay
                if (parsed.stage === 'completed' || parsed.stage === 'failed') {
                  setTimeout(() => {
                    setActiveClientRequestId(null);
                    // Check for queued message and auto-submit
                    if (queuedMessageRef.current) {
                      const messageToSend = queuedMessageRef.current;
                      setQueuedMessage(null);
                      console.log('📤 Auto-submitting queued message:', messageToSend.slice(0, 50));
                      handleSendRef.current?.(messageToSend);
                    }
                  }, 500);
                }
              }
              
              // Handle Supervisor task creation
              if (parsed.supervisorTaskId) {
                console.log('🤖 Supervisor task created:', parsed.supervisorTaskId);
                setSupervisorTaskId(parsed.supervisorTaskId);
                setIsWaitingForSupervisor(true);
                
                // Set timeout watchdog (clear if Supervisor responds within 2 minutes)
                if (supervisorTimeoutRef.current) {
                  clearTimeout(supervisorTimeoutRef.current);
                }
                supervisorTimeoutRef.current = setTimeout(() => {
                  console.warn('⏱️ Supervisor response timeout - clearing waiting state');
                  setIsWaitingForSupervisor(false);
                  setSupervisorTaskId(null);
                  toast({
                    title: "Timeout",
                    description: "Supervisor is taking longer than expected. The results will appear when ready.",
                  });
                }, 120000); // 2 minute timeout
              }
              
              // Handle batch job ID
              if (parsed.batchId) {
                console.log('🔗 Received batch job ID:', parsed.batchId);
                setBatchJobTracking((prev) => new Map(prev).set(assistantMessageId, parsed.batchId));
                triggerSidebarFlash('emailFinder');
              }
              
              if (parsed.content) {
                accumulatedContent += parsed.content;
                
                // Update message in real-time
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              // Skip invalid JSON lines
              if (data !== '[DONE]') {
                console.warn('Failed to parse SSE data:', data);
              }
            }
          }
        }
      }

      // After streaming completes, check if this was a successful batch execution
      if ((addRun || updateRun) && (accumulatedContent.includes("Batch sent to Smartlead") || accumulatedContent.includes("contact queued"))) {
        console.log("Extracting run details from AI response:", accumulatedContent);
        
        // Extract details from the AI's response which contains the batch preview
        // Pattern: "- {role} @ {businessType} in {location}, {country}"
        let businessType = "";
        let location = "";
        let targetPosition = "";
        let country = defaultCountry;
        
        // Primary pattern: Look for bullet points like "- ceo @ pubs [Atlanta, US]:"
        const bulletMatch = accumulatedContent.match(/-\s*([^@]+?)\s*@\s*([^\[]+?)\s*\[([^,\]]+?)(?:,\s*([A-Z]{2}))?\]/i);
        if (bulletMatch) {
          targetPosition = bulletMatch[1].trim();
          businessType = bulletMatch[2].trim();
          location = bulletMatch[3].trim();
          country = bulletMatch[4]?.trim() || defaultCountry;
          console.log("Matched bullet pattern:", { targetPosition, businessType, location, country });
        } else {
          // Fallback patterns
          console.log("Trying fallback patterns...");
          
          // Look for business type
          const businessMatch = accumulatedContent.match(/(?:Business|business_type):\s*([^\n]+)/i) || 
                               accumulatedContent.match(/@ ([^in]+?)\s+in\s+/i);
          if (businessMatch) {
            businessType = businessMatch[1].trim();
          }
          
          // Look for location
          const locationMatch = accumulatedContent.match(/(?:Location|location):\s*([^\n]+)/i) ||
                               accumulatedContent.match(/in\s+\*\*([^\*,]+)\*\*/i) ||
                               accumulatedContent.match(/in\s+([^,\n]+?)(?:,|\s+[A-Z]{2})/i);
          if (locationMatch) {
            location = locationMatch[1].trim();
          }
          
          // Look for target position/role
          const positionMatch = accumulatedContent.match(/(?:Target|target_position|Position|Role):\s*([^\n]+)/i) ||
                               accumulatedContent.match(/-\s*([^@]+?)\s*@/i);
          if (positionMatch) {
            targetPosition = positionMatch[1].trim();
          }
          
          // Look for country code
          const countryMatch = accumulatedContent.match(/(?:Country|country):\s*([A-Z]{2})/i) ||
                              accumulatedContent.match(/,\s*([A-Z]{2})\s*\*\*/i);
          if (countryMatch) {
            country = countryMatch[1].trim();
          }
          
          console.log("Fallback extraction:", { businessType, location, targetPosition, country });
        }
        
        // Create a readable label
        const label = businessType && location 
          ? `${businessType.charAt(0).toUpperCase() + businessType.slice(1)} in ${location}${targetPosition ? ' - ' + targetPosition.charAt(0).toUpperCase() + targetPosition.slice(1) : ''}`
          : `${targetPosition || "Contact"} @ ${businessType || "businesses"} in ${location || "location"}`;
        
        // Check if this is updating an existing run (from clicking "Run" button) or creating a new one
        const activeRunId = getActiveRunId?.();
        
        if (activeRunId && updateRun) {
          // Update existing run - keep the same unique ID
          console.log("Updating existing run:", activeRunId, "with data:", { label, status: "completed", businessType, location, country, targetPosition });
          updateRun(activeRunId, {
            label,
            status: "completed",
            businessType,
            location,
            country,
            targetPosition,
            // Don't update uniqueId - it stays the same
          });
          console.log("Updated run in history - UI should now show completed status");
        } else if (addRun) {
          // Create new run with new unique ID
          // Generate unique ID (20 chars lowercase alphanumeric)
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          let uniqueId = '';
          for (let i = 0; i < 20; i++) {
            uniqueId += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          
          console.log("Creating new run");
          addRun({
            label,
            status: "completed",
            businessType,
            location,
            country,
            targetPosition,
            uniqueId,
          });
          console.log("Added run to history:", { label, businessType, location, country, targetPosition, uniqueId });
        }
      }
      
      setIsStreaming(false);
      
      // ROBUST CLEANUP: Clear soft lock and trigger queued message if no terminal status was received
      // This is a fallback in case the server didn't emit completed/failed status events
      setTimeout(() => {
        setActiveClientRequestId((current) => {
          // Only clear if still the same request (prevents race conditions)
          if (current === clientRequestId) {
            console.log('🧹 Stream completed, clearing active request (fallback cleanup)');
            // Check for queued message and auto-submit
            if (queuedMessageRef.current) {
              const messageToSend = queuedMessageRef.current;
              setQueuedMessage(null);
              console.log('📤 Auto-submitting queued message (fallback):', messageToSend.slice(0, 50));
              setTimeout(() => handleSendRef.current?.(messageToSend), 100);
            }
            return null;
          }
          return current;
        });
      }, 500);
      
    } catch (error: any) {
      setIsStreaming(false);
      
      // ROBUST CLEANUP: Clear soft lock state on error
      setActiveClientRequestId(null);
      setProgressStack((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.stage !== 'completed' && last.stage !== 'failed') {
          return [...prev, { stage: 'failed' as ProgressStage, message: error.message || 'Request failed', ts: Date.now() }];
        }
        return prev;
      });
      
      // Check for queued message and auto-submit even on error
      if (queuedMessageRef.current) {
        const messageToSend = queuedMessageRef.current;
        setQueuedMessage(null);
        console.log('📤 Auto-submitting queued message after error:', messageToSend.slice(0, 50));
        setTimeout(() => handleSendRef.current?.(messageToSend), 500);
      }
      
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      
      // Add error message
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to get response: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const addNoteMutation = useMutation<AddNoteResponse, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tool/add_note", {
        userToken: "demo-token-123",
        leadId: "lead-456",
        note: "This is a demo note from the Wyshbone AI chat interface",
      });
      return await response.json();
    },
    onSuccess: () => {
      const systemMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: "Note successfully added to Bubble",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
    },
    onError: (error) => {
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to add note: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  // Send message to MEGA Agent
  const sendMegaMessage = async (messageContent: string) => {
    setIsStreaming(true);
    setMegaChips([]); // Clear previous chips
    
    try {
      // Show a warning for slow responses
      const slowWarningTimeout = setTimeout(() => {
        toast({
          title: "Still thinking...",
          description: "MEGA is processing your request. This usually takes 5-15 seconds.",
        });
      }, 10000);

      // Ensure we have a conversationId - create one if needed
      const currentConversationId = conversationId || crypto.randomUUID();
      if (!conversationId) {
        setConversationId(currentConversationId);
        localStorage.setItem('currentConversationId', currentConversationId);
      }

      const megaSessionId = localStorage.getItem('wyshbone_sid');
      const response = await fetch(buildApiUrl(addDevAuthParams("/agent/chat")), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(megaSessionId ? { "x-session-id": megaSessionId } : {}),
        },
        body: JSON.stringify({
          text: messageContent,
          conversationId: currentConversationId,
        }),
        credentials: "include",
      });

      clearTimeout(slowWarningTimeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "MEGA agent request failed");
      }

      const data = await response.json();

      // Check if MEGA wants to delegate to Standard mode
      if (data.delegateToStandard) {
        console.log("🔄 MEGA delegated to Standard - switching to streaming mode");
        
        // Add MEGA's transition message
        const transitionMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.natural || "Switching to Standard mode for better handling of this request...",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, transitionMessage]);
        
        // Switch to Standard mode and re-submit using the existing handleSend function
        setChatMode("standard");
        
        // Re-submit after a brief delay to allow mode switch
        setTimeout(() => {
          handleSend(messageContent);
        }, 500);
        
        return;
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.natural || "No response",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Handle tool execution results (SEARCH_PLACES, DEEP_RESEARCH, etc.)
      if (data.auto_action_result?.ok && data.auto_action_result?.data) {
        const result = data.auto_action_result.data;
        
        // Handle SEARCH_PLACES results
        if (result.places && Array.isArray(result.places)) {
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `✅ Found ${result.places.length} places. Click "View Results" to see full details.`,
            timestamp: new Date(),
            searchResults: result.places.slice(0, 5), // Show preview of 5
          };
          setMessages((prev) => [...prev, systemMessage]);
          
          // Open results in right panel
          openResults('quick_search', {
            places: result.places,
            count: result.places.length,
            query: result.query || '',
            location: result.location || '',
            country: result.country || defaultCountry,
          }, `${result.places.length} businesses found`);
        }
        
        // Handle DEEP_RESEARCH results
        if (result.run && result.run.id) {
          if (addRun) {
            addRun({
              id: result.run.id,
              label: result.run.label || "Deep Research",
              startedAt: new Date().toISOString(),
              status: result.run.status || "running",
              runType: "deep_research",
              outputPreview: result.run.outputPreview,
            });
          }
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `🔬 Deep research started! Research is running in the background. View progress in the Results panel.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);
          
          // Open results in right panel
          openResults('deep_research', {
            run: {
              id: result.run.id,
              label: result.run.label || result.topic,
              status: result.run.status || 'running',
            },
            topic: result.topic || result.run.label || 'Research',
          }, result.run.label || 'Deep Research');
          
          triggerSidebarFlash('deepResearch');
        }
        
        // Handle BATCH_CONTACT_FINDER results
        if (result.job && result.job.id) {
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `📧 Email finder started! Finding contacts in the background. View progress in the Results panel.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);
          
          // Open results in right panel
          openResults('email_finder', {
            batchId: result.job.id,
            status: 'running',
            viewUrl: `/batch/${result.job.id}`,
          }, 'Email Finder');
          
          triggerSidebarFlash('emailFinder');
        }
        
        // Handle SCHEDULED_MONITOR results
        if (result.id && result.schedule && result.monitorType) {
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `⏰ Monitor "${result.label}" created! Scheduled to run ${result.schedule}. View it in the Results panel.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);

          // Open results in right panel
          openResults('scheduled_monitor', {
            monitor: result,
            id: result.id,
            label: result.label,
            schedule: result.schedule,
            status: result.status,
          }, `Monitor: ${result.label}`);
        }

        // Handle GET_NUDGES results
        if (result.nudges !== undefined) {
          const nudgesCount = Array.isArray(result.nudges) ? result.nudges.length : 0;
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: nudgesCount > 0
              ? `👉 Found ${nudgesCount} nudge${nudgesCount === 1 ? '' : 's'}. View in the Results panel.`
              : `📭 No pending nudges at the moment.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);

          // Open results in right panel
          openResults('nudges', {
            nudges: result.nudges || [],
            count: nudgesCount,
            message: result.message,
          }, `Nudges (${nudgesCount})`);
        }

        // Handle DRAFT_EMAIL results
        if (result.draft) {
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `✉️ Email draft:\n\n${result.draft}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);
        }
      }

      // Store follow-up chips
      if (data.plan?.follow_ups) {
        setMegaChips(data.plan.follow_ups);
      }

      // Show clarity questions if any
      if (data.plan?.clarity_questions && data.plan.clarity_questions.length > 0) {
        toast({
          title: "Questions",
          description: data.plan.clarity_questions.join("\n"),
        });
      }
    } catch (error: any) {
      toast({
        title: "MEGA Agent Error",
        description: error.message || "Failed to send message. Try switching to Standard mode.",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Intent classification: Determines if user wants to start fresh or continue
  const classifyIntent = (newMessage: string, history: Message[]): 'NEW_REPLACE' | 'CONTINUE' | 'MODIFY' | 'NEW_UNRELATED' => {
    const lowerMsg = newMessage.toLowerCase();

    // No history = always NEW
    if (history.length === 0) return 'NEW_REPLACE';

    // Strong NEW_REPLACE signals (explicit goal change)
    const newReplacePatterns = [
      /^(find|search for|look for|get me|show me).+in [a-z]/i,  // "Find pubs in Manchester" (new location/topic)
      /^(i want to|i need to|let's|can you).+(instead|now)/i,   // "I want to search Leeds instead"
      /^(actually|wait|no|forget that)/i,                       // "Actually, let's do Birmingham"
      /^(new search|start over|different)/i,                    // "New search for..."
    ];

    if (newReplacePatterns.some(p => p.test(newMessage))) {
      // Check if it's truly different from last user message
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const oldLocation = lastUserMsg.content.match(/in ([a-z\s]+)/i)?.[1];
        const newLocation = newMessage.match(/in ([a-z\s]+)/i)?.[1];
        if (oldLocation && newLocation && oldLocation.toLowerCase() !== newLocation.toLowerCase()) {
          return 'NEW_REPLACE';
        }
      }
    }

    // MODIFY signals (tweaking existing request)
    const modifyPatterns = [
      /^(make that|change (?:that|it) to|actually|instead of)/i,  // "Make that 100 instead of 60"
      /^(increase|decrease|more|less|fewer|add|remove)/i,          // "Increase to 100"
      /\b(not|instead of|rather than)\b/i,                         // "Not 60, 100"
    ];

    if (modifyPatterns.some(p => p.test(newMessage)) && history.length > 0) {
      return 'MODIFY';
    }

    // NEW_UNRELATED signals (completely different task)
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const wasResearching = /find|search|look|show|get/i.test(lastUserMsg.content);
      const nowDrafting = /draft|write|compose|create.*email/i.test(lowerMsg);
      const nowAnalyzing = /analyze|review|check/i.test(lowerMsg);

      if ((wasResearching && nowDrafting) || (wasResearching && nowAnalyzing)) {
        return 'NEW_UNRELATED';
      }
    }

    // Default: CONTINUE (follow-up questions, clarifications)
    return 'CONTINUE';
  };

  // Check if a run is currently active (soft lock check)
  const isRunActive = !!activeClientRequestId;

  const handleSend = async (promptOverride?: string) => {
    const messageContent = promptOverride || input.trim();
    if (!messageContent) return;
    
    // SOFT LOCK: If a run is active, don't submit - this is handled by handleKeyDown
    // This check is here as a safety net for direct calls
    if (isStreaming || isRunActive) {
      console.log('⏸️ Run active, cannot submit new message');
      return;
    }

    // Hide location suggestions
    setShowLocationSuggestions(false);

    // INTENT CLASSIFICATION: Determine if this is a new goal or continuation
    const currentHistory = messages.filter((msg): msg is Message => !("type" in msg));
    const intent = classifyIntent(messageContent, currentHistory);

    console.log(`🎯 Intent classified: ${intent} for message: "${messageContent.slice(0, 50)}..."`);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    // Handle intent-based context management
    if (intent === 'NEW_REPLACE') {
      // Clear old context, start fresh
      console.log('🔄 NEW_REPLACE: Clearing old context and starting fresh');
      setMessages([userMessage]);  // Only keep new message
    } else if (intent === 'NEW_UNRELATED') {
      // Could implement multi-threading here, for now start fresh
      console.log('🆕 NEW_UNRELATED: Starting new thread');
      setMessages([userMessage]);
    } else {
      // CONTINUE or MODIFY: Keep existing context
      setMessages((prev) => [...prev, userMessage]);
    }

    setInput("");

    // Publish event for message sent
    publishEvent("CHAT_MESSAGE_SENT", {
      conversationId: conversationId || "pending",
      messageId: userMessage.id,
      content: messageContent,
      mode: chatMode,
    });

    // Route to MEGA agent if in MEGA mode
    if (chatMode === "mega") {
      await sendMegaMessage(messageContent);
      return;
    }

    // Check if this looks like a deep research request
    if (detectDeepResearchIntent(messageContent)) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I can run a deep research dive with web browsing for you. This will take a few minutes and produce a comprehensive report with sources. Would you like me to start this research?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Store the research request for the user to confirm
      const researchRequest: DeepResearchCreateRequest = {
        prompt: messageContent,
        label: messageContent.length > 60 ? messageContent.slice(0, 57) + "…" : messageContent,
        mode: "report",
      };

      // Add confirmation button (we'll do this via a special system message)
      const confirmMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: JSON.stringify({ type: "deep_research_confirm", data: researchRequest }),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, confirmMessage]);
      return;
    }

    // Build conversation history based on intent
    let conversationHistory: ChatMessage[];

    if (intent === 'NEW_REPLACE' || intent === 'NEW_UNRELATED') {
      // For new goals, only send the current message (no old context)
      conversationHistory = [{ role: userMessage.role, content: userMessage.content }];
    } else {
      // For CONTINUE/MODIFY, send recent history
      const allHistory = messages
        .filter((msg): msg is Message => !("type" in msg))
        .map(({ role, content }) => ({ role, content }));

      // LIMIT TO LAST 6 MESSAGES (3 exchanges) to prevent old context pollution
      const recentHistory = allHistory.slice(-6);
      conversationHistory = [...recentHistory, { role: userMessage.role, content: userMessage.content }];
    }

    // Send conversation to backend
    streamChatResponse(conversationHistory);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    
    // Show location suggestions if user is typing and not streaming
    if (newValue.length >= 3 && !isStreaming) {
      setShowLocationSuggestions(true);
    } else {
      setShowLocationSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setShowLocationSuggestions(false);
      
      // SOFT LOCK: If run is active, show toast and don't submit
      if (isRunActive || isStreaming) {
        toast({
          title: "Wyshbone is working",
          description: "Press Queue to run this next, or wait for the current request to finish.",
        });
        return;
      }
      
      handleSend();
    } else if (e.key === "Escape") {
      setShowLocationSuggestions(false);
    }
  };
  
  // Queue handler: Save message for later execution
  const handleQueue = () => {
    const messageContent = input.trim();
    if (!messageContent) return;
    
    setQueuedMessage(messageContent);
    setInput("");
    toast({
      title: "Message queued",
      description: "Your message will run automatically when the current request finishes.",
    });
  };
  
  // Cancel handler: Abort current request and optionally run queued message
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setActiveClientRequestId(null);
    setProgressStack((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.stage !== 'completed' && last.stage !== 'failed') {
        return [...prev.slice(0, -1), { ...last, stage: 'failed' as ProgressStage, message: 'Cancelled' }];
      }
      return prev;
    });
    
    toast({
      title: "Request cancelled",
      description: queuedMessage ? "Running queued message..." : "Request has been stopped.",
    });
    
    // If there's a queued message, submit it after a brief delay
    if (queuedMessageRef.current) {
      const messageToSend = queuedMessageRef.current;
      setQueuedMessage(null);
      setTimeout(() => {
        handleSendRef.current?.(messageToSend);
      }, 300);
    }
  };

  const handleSelectLocation = (newValue: string) => {
    setInput(newValue);
    setShowLocationSuggestions(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-nowrap h-full w-full bg-background overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto py-8">
        <div className="w-full space-y-4 px-6">
          {messages.length === 0 && isLoadingGoal ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mb-4">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold mb-6">Loading...</h2>
            </div>
          ) : messages.length === 0 && !isLoadingHistory ? (
            /* UI-19: Welcome state with sample prompts */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
              <div className="w-20 h-20 rounded-full overflow-hidden mb-6 shadow-lg">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">What can I help you with?</h2>
              <p className="text-muted-foreground mb-8 max-w-md">
                Tell me what you need — I can find leads, research markets, draft emails, and more.
              </p>
              
              {/* Sample prompt chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {[
                  "Find 30 pubs in Yorkshire that serve cask ale",
                  "Deep research on the micropub market in Manchester",
                  "Find decision-makers at breweries in Wales",
                  "Draft an intro email for a new pub contact",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="px-3 py-2 text-sm rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages
              .filter((message) => {
                // Filter out empty messages (they'll be shown as thinking dots instead)
                if ("type" in message && message.type === "system") {
                  return true; // Always show system messages
                }
                const chatMessage = message as Message;
                return chatMessage.content.trim().length > 0; // Only show messages with content
              })
              .map((message) => {
              if ("type" in message && message.type === "system") {
                // Check if this is a deep research confirmation message
                try {
                  const parsed = JSON.parse(message.content);
                  if (parsed.type === "deep_research_confirm") {
                    return (
                      <div
                        key={message.id}
                        className="flex justify-center gap-2"
                        data-testid={`message-system-${message.id}`}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            startDeepResearch(parsed.data);
                            // Remove this confirmation message
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                          }}
                          data-testid="button-start-research"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Start Deep Research
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-gradient-to-r from-primary to-chart-2 hover:from-primary/90 hover:to-chart-2/90"
                          onClick={async () => {
                            // Start Very Deep Program (multi-iteration)
                            try {
                              await apiRequest("POST", "/api/very-deep-program", {
                                ...parsed.data,
                                conversationId,
                                userId: user.id
                              });
                              
                              // Remove confirmation message and show notification
                              setMessages((prev) => prev.filter((m) => m.id !== message.id));
                              
                              toast({
                                title: "Very Deep Dive Started",
                                description: "Running 3 sequential research passes. This will take several minutes...",
                              });
                            } catch (error) {
                              const message = handleApiError(error, "start Very Deep Dive");
                              toast({
                                title: "Error",
                                description: message,
                                variant: "destructive",
                              });
                            }
                          }}
                          data-testid="button-very-deep-dive"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Very Deep Dive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Remove this confirmation message
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                          }}
                          data-testid="button-cancel-research"
                        >
                          Cancel
                        </Button>
                      </div>
                    );
                  }
                } catch (e) {
                  // Not a JSON message, fall through to regular display
                }

                // Check if this is an email draft message
                if (message.content.startsWith('✉️ Email draft:')) {
                  const emailContent = message.content.replace('✉️ Email draft:\n\n', '').trim();
                  return (
                    <div
                      key={message.id}
                      className="flex flex-col gap-3 w-full max-w-3xl mx-auto"
                      data-testid={`message-system-${message.id}`}
                    >
                      <div className="flex justify-center">
                        <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                          ✉️ Email Draft Ready
                        </div>
                      </div>

                      {/* Email Draft Card */}
                      <div className="bg-card border border-card-border rounded-lg p-4">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed mb-4">
                          {emailContent}
                        </div>
                        <div className="flex gap-2 justify-end border-t border-border pt-3">
                          <CopyButton
                            text={emailContent}
                            label="Copy Email"
                            variant="default"
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Check if this system message has search results to display
                if (message.searchResults && Array.isArray(message.searchResults)) {
                  const totalResults = message.searchResults.length;
                  const previewResults = message.searchResults.slice(0, 5);
                  const hasMore = totalResults > 5;

                  return (
                    <div
                      key={message.id}
                      className="flex flex-col gap-3 w-full max-w-3xl mx-auto"
                      data-testid={`message-system-${message.id}`}
                    >
                      <div className="flex justify-center">
                        <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                          {message.content}
                        </div>
                      </div>

                      {/* Search Results Preview Card */}
                      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                        <div className="p-4">
                          <div className="space-y-3">
                            {previewResults.map((place: any, index: number) => (
                              <div
                                key={place.place_id || index}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
                                data-testid={`search-result-${index}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm mb-1">{place.name}</div>
                                  <div className="text-xs text-muted-foreground space-y-0.5">
                                    {place.address && (
                                      <div className="flex items-start gap-1">
                                        <span>📍</span>
                                        <span>{place.address}</span>
                                      </div>
                                    )}
                                    {place.phone && (
                                      <div className="flex items-center gap-1">
                                        <span>📞</span>
                                        <span>{place.phone}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {place.rating && (
                                  <div className="flex-shrink-0">
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-50 dark:bg-yellow-950/30">
                                      <span className="text-yellow-600 dark:text-yellow-400">⭐</span>
                                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                                        {place.rating}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="border-t border-border bg-muted/30 px-4 py-3 flex gap-2 justify-between flex-wrap">
                          <div className="flex gap-2">
                            {hasMore && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  // TODO: Open side panel or full results view
                                  toast({
                                    title: "View All Results",
                                    description: `Showing all ${totalResults} results (coming soon)`,
                                  });
                                }}
                              >
                                View All {totalResults} Results →
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Convert results to CSV
                                const csv = [
                                  ['Name', 'Address', 'Phone', 'Rating'].join(','),
                                  ...(message.searchResults || []).map((p: any) =>
                                    [p.name, p.address || '', p.phone || '', p.rating || ''].join(',')
                                  )
                                ].join('\n');

                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `search-results-${Date.now()}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);

                                toast({
                                  title: "Exported",
                                  description: `Downloaded ${totalResults} results as CSV`,
                                });
                              }}
                            >
                              📥 Export CSV
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div
                    key={message.id}
                    className="flex justify-center"
                    data-testid={`message-system-${message.id}`}
                  >
                    <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                      {message.content}
                    </div>
                  </div>
                );
              }

              const chatMessage = message as Message;
              const isUser = chatMessage.role === "user";
              const isSupervisor = chatMessage.source === 'supervisor';

              // Check if this is a monitor creation notification
              if (!isUser && chatMessage.content.startsWith('🔔 MONITOR_CREATED')) {
                const lines = chatMessage.content.split('\n');
                const monitorData: Record<string, string> = {};
                lines.forEach(line => {
                  const [key, ...valueParts] = line.split(': ');
                  if (valueParts.length > 0) {
                    monitorData[key] = valueParts.join(': ');
                  }
                });

                return (
                  <div
                    key={chatMessage.id}
                    className="flex gap-3 flex-row"
                    data-testid={`message-monitor-${chatMessage.id}`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                      <div className="bg-chart-2/20 border border-chart-2/30 rounded-lg px-4 py-3 w-full">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 className="w-5 h-5 text-chart-2" />
                          <span className="font-semibold text-chart-2">Monitor Created Successfully</span>
                        </div>
                        <div className="space-y-2 text-sm mb-4">
                          <div>
                            <span className="font-medium">Name:</span> {monitorData['LABEL']}
                          </div>
                          <div>
                            <span className="font-medium">Description:</span> {monitorData['DESCRIPTION']}
                          </div>
                          <div>
                            <span className="font-medium">Schedule:</span> {monitorData['SCHEDULE']}
                          </div>
                          <div>
                            <span className="font-medium">Type:</span> {monitorData['TYPE']}
                          </div>
                          <div>
                            <span className="font-medium">Next Run:</span> {monitorData['NEXT_RUN']}
                          </div>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            // Navigate to monitors section - you may need to implement this navigation
                            window.location.hash = '#monitors';
                          }}
                        >
                          Go to Monitors →
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {chatMessage.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={chatMessage.id}
                  className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  data-testid={`message-${chatMessage.role}-${chatMessage.id}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isUser ? "bg-primary" : isSupervisor ? "bg-gradient-to-br from-blue-500 to-blue-600" : "overflow-hidden"
                    }`}
                  >
                    {isUser ? (
                      <User className="w-4 h-4 text-primary-foreground" />
                    ) : isSupervisor ? (
                      <Building2 className="w-4 h-4 text-white" />
                    ) : (
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-3xl lg:max-w-none`}>
                    {isSupervisor && (
                      <div className="mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                          <Building2 className="w-3 h-3" />
                          Supervisor
                        </span>
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : isSupervisor
                          ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800"
                          : "bg-card border border-card-border"
                      }`}
                    >
                      {!isUser && (chatMessage.content.includes('# 📊') || chatMessage.content.includes('[') && chatMessage.content.includes('](')) ? (
                        <div className="text-[15px] leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a {...props} className="text-primary hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer" />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul {...props} className="list-disc list-inside my-2 space-y-1" />
                              ),
                              ol: ({ node, ...props }) => (
                                <ol {...props} className="list-decimal list-inside my-2 space-y-1" />
                              ),
                              h1: ({ node, ...props }) => (
                                <h1 {...props} className="text-xl font-bold mt-4 mb-2" />
                              ),
                              h2: ({ node, ...props }) => (
                                <h2 {...props} className="text-lg font-semibold mt-3 mb-2" />
                              ),
                              h3: ({ node, ...props }) => (
                                <h3 {...props} className="text-base font-semibold mt-2 mb-1" />
                              ),
                              p: ({ node, ...props }) => (
                                <p {...props} className="my-2" />
                              ),
                              table: ({ node, ...props }) => (
                                <div className="overflow-x-auto my-2">
                                  <table {...props} className="border-collapse border border-border w-full" />
                                </div>
                              ),
                              th: ({ node, ...props }) => (
                                <th {...props} className="border border-border px-2 py-1 bg-muted font-semibold text-left" />
                              ),
                              td: ({ node, ...props }) => (
                                <td {...props} className="border border-border px-2 py-1" />
                              ),
                            }}
                          >
                            {chatMessage.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{chatMessage.content}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      {chatMessage.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* Progress Stack - shows status updates during request */}
          {progressStack.length > 0 && (
            <div className="flex gap-3 flex-row mb-2" data-testid="progress-stack">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
                  <div className="space-y-1">
                    {progressStack.map((event, idx) => {
                      const display = getStageDisplay(event.stage, event.toolName);
                      const isLast = idx === progressStack.length - 1;
                      const isTerminal = event.stage === 'completed' || event.stage === 'failed';
                      return (
                        <div 
                          key={`${event.stage}-${idx}`} 
                          className={`flex items-center gap-2 text-sm ${isLast && !isTerminal ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          <span>{display.icon}</span>
                          <span>{display.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Supervisor thinking indicator */}
          {isWaitingForSupervisor && (
            <div className="flex gap-3 flex-row" data-testid="supervisor-loading">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="mb-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                    <Building2 className="w-3 h-3" />
                    Supervisor
                  </span>
                </div>
                <div className="rounded-lg px-4 py-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm text-blue-700 dark:text-blue-300">Searching for leads...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && (
            <div className="flex gap-3 flex-row" data-testid="thinking-indicator">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-background py-6">
        <div className="w-full relative px-6">
          {/* Chat Mode Toggle and Functions Panel Toggle */}
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant={chatMode === "standard" ? "default" : "outline"}
                size="sm"
                onClick={() => setChatMode("standard")}
                data-testid="button-mode-standard"
              >
                Standard
              </Button>
              <Button
                variant={chatMode === "mega" ? "default" : "outline"}
                size="sm"
                onClick={() => setChatMode("mega")}
                data-testid="button-mode-mega"
              >
                🚀 MEGA
              </Button>
              <span className="text-xs text-muted-foreground ml-2">
                {chatMode === "mega" ? "Takes action immediately, suggests next steps" : "Conversational, can search the web"}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* UI-18: What just happened? button - shows recent Tower activity */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWhatJustHappenedOpen(true)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                data-testid="button-what-just-happened"
                title="View recent Wyshbone activity"
              >
                <Activity className="h-3 w-3" />
                <span className="hidden sm:inline">Activity log</span>
              </Button>
              
              {/* Quick Actions Panel Toggle - only show when panel is hidden */}
              {!showFunctionsPanel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFunctionsPanel(true)}
                  className="flex items-center gap-1"
                  data-testid="button-show-functions"
                  title="Show quick action buttons"
                >
                  <HelpCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Quick actions</span>
                </Button>
              )}
            </div>
          </div>

          {/* MEGA Chips (Follow-up suggestions) */}
          {chatMode === "mega" && megaChips.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {megaChips.map((chip, idx) => (
                <Button
                  key={idx}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setInput(chip);
                    handleSend(chip);
                  }}
                  className="text-xs"
                  data-testid={`chip-${idx}`}
                >
                  💡 {chip}
                </Button>
              ))}
            </div>
          )}

          {/* Location Suggestions */}
          {showLocationSuggestions && (
            <LocationSuggestions
              inputValue={input}
              onSelectLocation={handleSelectLocation}
              isVisible={showLocationSuggestions}
              inputRef={textareaRef}
              defaultCountry={defaultCountry}
            />
          )}
          
          {/* Queued Message Indicator */}
          {queuedMessage && (
            <div className="mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                📋 Queued: "{queuedMessage.slice(0, 40)}{queuedMessage.length > 40 ? '...' : ''}"
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQueuedMessage(null)}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Clear
              </Button>
            </div>
          )}
          
          <div className="bg-card border border-card-border rounded-xl p-2 flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Tell Wyshbone what you need — find leads, research a market, draft an email..."
              className="resize-none border-0 bg-transparent text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 min-h-[48px] max-h-[200px]"
              rows={1}
              data-testid="input-message"
            />
            
            {/* Show Queue/Cancel buttons when run is active */}
            {isRunActive && (
              <>
                {input.trim() && !queuedMessage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleQueue}
                    className="flex-shrink-0"
                    data-testid="button-queue"
                  >
                    Queue
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  className="flex-shrink-0"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </>
            )}
            
            {/* Show Send button when no run is active */}
            {!isRunActive && (
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="flex-shrink-0 p-0 overflow-hidden"
                data-testid="button-send"
              >
                <img src={wyshboneLogo} alt="Send" className="w-full h-full object-cover" />
              </Button>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Right Sidebar - Functions Panel */}
      <WishboneSidebar 
        onPrompt={handleSend}
        isVisible={showFunctionsPanel}
        onHide={() => setShowFunctionsPanel(false)}
      />
      
      {/* Add to Xero features temporarily removed for layout debugging */}
      
      {/* UI-18: What just happened? Tower log viewer */}
      <WhatJustHappenedPanel
        isOpen={isWhatJustHappenedOpen}
        onClose={() => setWhatJustHappenedOpen(false)}
        conversationId={conversationId}
      />
    </div>
  );
}
