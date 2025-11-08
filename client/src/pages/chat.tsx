import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, addDevAuthParams } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, CheckCircle2, Search, Building2 } from "lucide-react";
import type { ChatMessage, AddNoteResponse, DeepResearchCreateRequest } from "@shared/schema";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";
import Welcome from "@/components/Welcome";
import { LocationSuggestions } from "@/components/LocationSuggestions";
import WishboneSidebar from "@/components/WishboneSidebar";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { AddToXeroDialog } from "@/components/AddToXeroDialog";

type Message = ChatMessage & {
  id: string;
  timestamp: Date;
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

export default function ChatPage({ defaultCountry = 'US', onInjectSystemMessage, addRun, updateRun, getActiveRunId, onNewChat, onLoadConversation }: ChatPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
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
  
  // MEGA Agent mode toggle
  const [chatMode, setChatMode] = useState<"standard" | "mega">(() => {
    return (localStorage.getItem('chatMode') as "standard" | "mega") || "standard";
  });
  const [megaChips, setMegaChips] = useState<string[]>([]);

  // Persist chat mode to localStorage
  useEffect(() => {
    localStorage.setItem('chatMode', chatMode);
  }, [chatMode]);

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
      const response = await apiRequest("POST", "/api/deep-research", {
        ...request,
        conversationId,
        userId: user.id
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

  // Welcome message will hide automatically when user sends first message (messages.length > 0)

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
        const response = await fetch(`/api/debug/conversations/${storedConversationId}/messages`);
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
            setShowWelcome(false);
            console.log(`📜 Loaded ${historicalMessages.length} messages from conversation ${storedConversationId}`);
          }
        }
      } catch (error) {
        console.error('Failed to load conversation history:', error);
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

  // Auto-show personalized greeting when user first visits
  useEffect(() => {
    const showAutoGreeting = async () => {
      // Only show greeting once, when we have no messages and welcome is visible
      if (hasShownGreetingRef.current || messages.length > 0 || !showWelcome || isLoadingHistory) {
        return;
      }

      hasShownGreetingRef.current = true;

      try {
        const response = await fetch(addDevAuthParams('/api/chat/greeting'));
        if (response.ok) {
          const data = await response.json();
          
          // Add personalized greeting as an assistant message
          const greetingMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.greeting,
            timestamp: new Date(),
          };

          setMessages([greetingMessage]);
          setShowWelcome(false); // Hide static welcome, show dynamic greeting
        }
      } catch (error) {
        console.error('Failed to fetch greeting:', error);
        // Silently fail - user can still use chat normally
      }
    };

    showAutoGreeting();
  }, [messages.length, showWelcome, isLoadingHistory]);

  // Poll batch job statuses and update messages when complete
  useEffect(() => {
    const pollBatchJobs = async () => {
      if (batchJobTracking.size === 0) return;

      for (const [messageId, batchId] of Array.from(batchJobTracking.entries())) {
        try {
          const response = await fetch(addDevAuthParams(`/api/batch/${batchId}`));
          if (response.ok) {
            const job = await response.json();
            
            if (job.status === 'completed') {
              // Update message to show completion
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === messageId && 'content' in msg) {
                    const updatedContent = msg.content
                      .replace(/⏳/g, '✅')
                      .replace(/This will take several minutes\./g, 'Pipeline completed!');
                    return { ...msg, content: updatedContent };
                  }
                  return msg;
                })
              );

              // Auto-open results tab with auth params
              window.open(addDevAuthParams(`/batch/${batchId}`), '_blank');
              
              // Remove from tracking
              setBatchJobTracking((prev) => {
                const newMap = new Map(prev);
                newMap.delete(messageId);
                return newMap;
              });

              console.log(`✅ Batch job ${batchId} completed and tab opened`);
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

  // Expose send message function to parent
  useEffect(() => {
    if (onInjectSystemMessage) {
      const injectMessage = (content: string, asUser: boolean = true) => {
        if (asUser) {
          // Send to AI
          handleSend(content);
        } else {
          // Add as assistant message directly
          const message: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, message]);
        }
      };
      onInjectSystemMessage(injectMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        
        // Clear conversationId from localStorage BEFORE clearing state
        localStorage.removeItem('currentConversationId');
        
        // Clear all state
        setMessages([]);
        setShowWelcome(true);
        setInput("");
        setIsStreaming(false);
        setShowLocationSuggestions(false);
        setConversationId(undefined);
        
        console.log("🆕 Started new chat - visual thread cleared, context retained");
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
        setShowWelcome(false);
        setShowLocationSuggestions(false);
        
        // Update conversationId
        setConversationId(newConversationId);
        localStorage.setItem('currentConversationId', newConversationId);
        
        // Load conversation messages
        setIsLoadingHistory(true);
        try {
          const url = addDevAuthParams(`/api/conversations/${newConversationId}/messages`);
          const response = await fetch(url);
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
          console.error("Error loading conversation:", error);
        } finally {
          setIsLoadingHistory(false);
        }
      };
      onLoadConversation(handleLoadConversation);
    }
  }, [onLoadConversation]);

  const streamChatResponse = async (conversationMessages: ChatMessage[]) => {
    setIsStreaming(true);
    
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
      const response = await fetch(addDevAuthParams("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversationMessages,
          user: { id: user.id, email: user.email },
          defaultCountry: defaultCountry,
          conversationId: conversationId,
        }),
        signal: abortControllerRef.current.signal,
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
              
              // Handle batch job ID
              if (parsed.batchId) {
                console.log('🔗 Received batch job ID:', parsed.batchId);
                setBatchJobTracking((prev) => new Map(prev).set(assistantMessageId, parsed.batchId));
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
      
      // AUTO-REVERT: After Standard completes, switch back to MEGA mode
      // This creates the bidirectional flow: MEGA → Standard → MEGA
      if (chatMode === "standard") {
        console.log("🔄 Standard mode completed - auto-reverting to MEGA mode");
        setTimeout(() => {
          setChatMode("mega");
        }, 500);
      }
    } catch (error: any) {
      setIsStreaming(false);
      
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

      const response = await fetch(addDevAuthParams("/agent/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: messageContent,
          conversationId: conversationId || `mega-${user.id}`,
        }),
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
            content: `✅ Found ${result.places.length} places via Wyshbone Global Database. Results displayed below.`,
            timestamp: new Date(),
            searchResults: result.places,
          };
          setMessages((prev) => [...prev, systemMessage]);
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
            content: `🔬 Deep research started. Check the sidebar for progress.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);
        }
        
        // Handle BATCH_CONTACT_FINDER results
        if (result.job && result.job.id) {
          const systemMessage: SystemMessage = {
            id: crypto.randomUUID(),
            type: "system",
            content: `📧 Batch contact finder started. Job ID: ${result.job.id}. This will run in the background.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, systemMessage]);
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

  const handleSend = async (promptOverride?: string) => {
    const messageContent = promptOverride || input.trim();
    if (!messageContent || isStreaming) return;

    // Hide location suggestions
    setShowLocationSuggestions(false);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    // Update UI state immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setShowWelcome(false);

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

    // Build conversation history BEFORE adding new message to state
    const conversationHistory = messages
      .filter((msg): msg is Message => !("type" in msg))
      .map(({ role, content }) => ({ role, content }));

    // LIMIT TO LAST 6 MESSAGES (3 exchanges) to prevent old context pollution
    // This prevents the AI from seeing very old searches when starting a new one
    const recentHistory = conversationHistory.slice(-6);

    // Add new user message to the history
    const fullConversation = [...recentHistory, { role: userMessage.role, content: userMessage.content }];

    // Send recent conversation only
    streamChatResponse(fullConversation);
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
      handleSend();
      setShowLocationSuggestions(false);
    } else if (e.key === "Escape") {
      setShowLocationSuggestions(false);
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
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mb-4">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold mb-6">Welcome to Wyshbone AI</h2>
              {showWelcome && <Welcome />}
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
                              const response = await fetch(addDevAuthParams("/api/very-deep-program"), {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  ...parsed.data,
                                  conversationId,
                                  userId: user.id
                                }),
                              });
                              
                              if (!response.ok) {
                                throw new Error("Failed to start Very Deep Program");
                              }
                              
                              // Remove confirmation message and show notification
                              setMessages((prev) => prev.filter((m) => m.id !== message.id));
                              
                              toast({
                                title: "Very Deep Dive Started",
                                description: "Running 3 sequential research passes. This will take several minutes...",
                              });
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Failed to start Very Deep Dive. Please try again.",
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
                
                // Check if this system message has search results to display
                if (message.searchResults && Array.isArray(message.searchResults)) {
                  return (
                    <div
                      key={message.id}
                      className="flex flex-col gap-3 w-full"
                      data-testid={`message-system-${message.id}`}
                    >
                      <div className="flex justify-center">
                        <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                          {message.content}
                        </div>
                      </div>
                      
                      {/* Search Results Table */}
                      <div className="bg-card border border-card-border rounded-lg p-4">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 font-semibold text-sm">Name</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Address</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Phone</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Rating</th>
                              </tr>
                            </thead>
                            <tbody>
                              {message.searchResults.map((place: any, index: number) => (
                                <tr 
                                  key={place.place_id || index} 
                                  className="border-b border-border/50 hover-elevate active-elevate-2 cursor-pointer"
                                  data-testid={`search-result-${index}`}
                                >
                                  <td className="py-3 px-3 text-sm font-medium">{place.name}</td>
                                  <td className="py-3 px-3 text-sm text-muted-foreground">{place.address || '—'}</td>
                                  <td className="py-3 px-3 text-sm text-muted-foreground">{place.phone || '—'}</td>
                                  <td className="py-3 px-3 text-sm">
                                    {place.rating ? (
                                      <span className="text-yellow-600 dark:text-yellow-400">
                                        ⭐ {place.rating}
                                      </span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
              return (
                <div
                  key={chatMessage.id}
                  className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  data-testid={`message-${chatMessage.role}-${chatMessage.id}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isUser ? "bg-primary" : "overflow-hidden"
                    }`}
                  >
                    {isUser ? (
                      <User className="w-4 h-4 text-primary-foreground" />
                    ) : (
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-3xl lg:max-w-none`}>
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
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
          {/* Chat Mode Toggle */}
          <div className="mb-3 flex items-center gap-2">
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
              {chatMode === "mega" ? "Action-first AI with follow-up suggestions" : "Streaming chat with web search"}
            </span>
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
          
          <div className="bg-card border border-card-border rounded-xl p-2 flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="resize-none border-0 bg-transparent text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 min-h-[48px] max-h-[200px]"
              rows={1}
              data-testid="input-message"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="flex-shrink-0 p-0 overflow-hidden"
              data-testid="button-send"
            >
              <img src={wyshboneLogo} alt="Send" className="w-full h-full object-cover" />
            </Button>
          </div>
        </div>
      </div>
      </div>

      {/* Right Sidebar */}
      <WishboneSidebar onPrompt={handleSend} />
      
      {/* Add to Xero features temporarily removed for layout debugging */}
    </div>
  );
}
