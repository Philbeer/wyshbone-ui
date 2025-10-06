import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, CheckCircle2, Moon, Sun } from "lucide-react";
import type { ChatMessage, AddNoteResponse } from "@shared/schema";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";

type Message = ChatMessage & {
  id: string;
  timestamp: Date;
};

type SystemMessage = {
  id: string;
  type: "system";
  content: string;
  timestamp: Date;
};

type DisplayMessage = Message | SystemMessage;

export default function ChatPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

      // Send full conversation history for context
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversationMessages,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if there's an error or raw text (failed JSON parse)
      if (data.error && data.raw_text) {
        // If JSON parsing failed on the backend, show the raw text
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: data.raw_text }
              : msg
          )
        );
      } else if (data.error) {
        // Other errors
        throw new Error(data.error);
      } else {
        // Format the structured response nicely
        let formattedContent = `**Search Results for: "${data.query}"**\n\n`;
        
        if (data.results && data.results.length > 0) {
          formattedContent += `**Found ${data.results.length} result(s):**\n\n`;
          data.results.forEach((result: any, index: number) => {
            formattedContent += `${index + 1}. **${result.title}**\n`;
            formattedContent += `   ${result.snippet}\n`;
            formattedContent += `   🔗 ${result.url}\n\n`;
          });
        } else {
          formattedContent += `No results found.\n\n`;
        }
        
        if (data.notes) {
          formattedContent += `**Notes:**\n${data.notes}\n`;
        }
        
        formattedContent += `\n*Generated at: ${new Date(data.generated_at).toLocaleString()}*`;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: formattedContent }
              : msg
          )
        );
      }

      setIsStreaming(false);
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

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const conversationHistory = messages
      .filter((msg): msg is Message => !("type" in msg))
      .map(({ role, content }) => ({ role, content }));

    streamChatResponse([...conversationHistory, { role: userMessage.role, content: userMessage.content }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-16 border-b border-border backdrop-blur-sm bg-background/90 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md overflow-hidden">
            <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-sm md:text-2xl font-bold tracking-tight" style={{ color: '#2c7373' }}>Wyshbone AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="md:w-auto md:px-3"
            onClick={() => addNoteMutation.mutate()}
            disabled={addNoteMutation.isPending}
            data-testid="button-add-note"
          >
            <CheckCircle2 className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Add Note to Bubble</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mb-4">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Welcome to Wyshbone AI</h2>
              <p className="text-muted-foreground max-w-md">
                Start a conversation with your AI assistant. Ask questions, get insights, and manage your workflow.
              </p>
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
                  <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-3xl`}>
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-card-border"
                      }`}
                    >
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{chatMessage.content}</p>
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
              <div className="flex flex-col items-start max-w-3xl">
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
      <div className="border-t border-border bg-background px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card border border-card-border rounded-xl p-2 flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="resize-none border-0 bg-transparent text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 min-h-[48px] max-h-[200px]"
              rows={1}
              data-testid="input-message"
            />
            <Button
              onClick={handleSend}
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
  );
}
