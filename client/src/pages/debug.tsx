import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

type Conversation = {
  id: string;
  userId: string;
  createdAt: number;
  lastMessageAt: number;
};

type Message = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: number;
};

type Fact = {
  id: string;
  userId: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  fact: string;
  score: number;
  category: string;
  createdAt: number;
};

export default function DebugPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: conversationsData } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/debug/conversations"],
    refetchInterval: 5000,
  });

  const { data: messagesData } = useQuery<{ messages: Message[] }>({
    queryKey: ["/api/debug/conversations", selectedConversation, "messages"],
    queryFn: async () => {
      if (!selectedConversation) throw new Error("No conversation selected");
      const response = await fetch(`/api/debug/conversations/${selectedConversation}/messages`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: 5000,
  });

  const { data: factsData } = useQuery<{ facts: Fact[] }>({
    queryKey: ["/api/debug/facts"],
    refetchInterval: 5000,
  });

  const conversations = conversationsData?.conversations || [];
  const messages = messagesData?.messages || [];
  const allFacts = factsData?.facts || [];
  
  // Filter facts based on search query (client-side filtering for simplicity)
  const facts = searchQuery.trim() 
    ? allFacts.filter(f => 
        f.fact.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allFacts;

  return (
    <div className="h-full overflow-hidden p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-debug-title">Memory Debug View</h1>
        <p className="text-muted-foreground">View persistent conversations, messages, and extracted facts</p>
      </div>

      <Tabs defaultValue="conversations" className="h-[calc(100%-80px)]">
        <TabsList data-testid="tabs-debug-navigation">
          <TabsTrigger value="conversations" data-testid="tab-conversations">
            Conversations ({conversations.length})
          </TabsTrigger>
          <TabsTrigger value="facts" data-testid="tab-facts">
            Facts ({facts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="h-full space-y-4">
          <div className="grid grid-cols-2 gap-4 h-[calc(100%-40px)]">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>All stored conversation sessions</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-2">
                    {conversations.length === 0 && (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-conversations">
                        No conversations yet. Start chatting to create one!
                      </p>
                    )}
                    {conversations.map((conv) => (
                      <Card
                        key={conv.id}
                        className={`cursor-pointer hover-elevate ${
                          selectedConversation === conv.id ? "border-primary" : ""
                        }`}
                        onClick={() => setSelectedConversation(conv.id)}
                        data-testid={`card-conversation-${conv.id}`}
                      >
                        <CardHeader className="p-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <code className="text-xs" data-testid={`text-conversation-id-${conv.id}`}>
                              {conv.id.slice(0, 8)}...
                            </code>
                            <Badge variant="outline" data-testid={`badge-user-${conv.id}`}>
                              {conv.userId}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground" data-testid={`text-conversation-time-${conv.id}`}>
                            Created {formatDistanceToNow(conv.createdAt)} ago
                          </p>
                          {conv.lastMessageAt && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-last-message-${conv.id}`}>
                              Last message {formatDistanceToNow(conv.lastMessageAt)} ago
                            </p>
                          )}
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>
                  {selectedConversation
                    ? `Messages in conversation ${selectedConversation.slice(0, 8)}...`
                    : "Select a conversation to view messages"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4">
                    {!selectedConversation && (
                      <p className="text-sm text-muted-foreground" data-testid="text-select-conversation">
                        Select a conversation from the left
                      </p>
                    )}
                    {selectedConversation && messages.length === 0 && (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-messages">
                        No messages in this conversation
                      </p>
                    )}
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="space-y-2"
                        data-testid={`message-${msg.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant={msg.role === "user" ? "default" : "secondary"} data-testid={`badge-role-${msg.id}`}>
                            {msg.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground" data-testid={`text-message-time-${msg.id}`}>
                            {formatDistanceToNow(msg.createdAt)} ago
                          </span>
                        </div>
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-sm whitespace-pre-wrap" data-testid={`text-message-content-${msg.id}`}>
                              {msg.content}
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="facts" className="h-full">
          <div className="flex flex-col gap-4 h-full">
            {/* User Summary Section */}
            {facts.length > 0 && (
              <Card className="flex-shrink-0">
                <CardHeader>
                  <CardTitle>User Profile Summary</CardTitle>
                  <CardDescription>High-confidence insights learned from conversations (score ≥ 70)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {facts
                      .filter(f => f.score >= 70)
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 5)
                      .map((fact) => (
                        <div key={`summary-${fact.id}`} className="flex items-start gap-3" data-testid={`summary-fact-${fact.id}`}>
                          <div className="flex-shrink-0 mt-0.5">
                            <Badge variant={fact.score >= 80 ? "default" : "secondary"}>
                              {fact.score}
                            </Badge>
                          </div>
                          <p className="text-sm leading-relaxed">{fact.fact}</p>
                        </div>
                      ))}
                    {facts.filter(f => f.score >= 70).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No high-confidence facts yet. Facts with scores ≥70 will appear here.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Facts Section */}
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>All Extracted Facts ({facts.length})</CardTitle>
                    <CardDescription>Complete knowledge base accumulated from conversations</CardDescription>
                  </div>
                </div>
                {/* Search Input */}
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search facts by content or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                    data-testid="input-search-facts"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setSearchQuery("")}
                      data-testid="button-clear-search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-3 pr-4">
                    {facts.length === 0 && searchQuery && (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-search-results">
                        No facts found matching "{searchQuery}". Try a different search term.
                      </p>
                    )}
                    {facts.length === 0 && !searchQuery && (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-facts">
                        No facts extracted yet. Facts are automatically extracted after conversations.
                      </p>
                    )}
                    {facts.map((fact) => {
                      const getCategoryColor = (category: string) => {
                        switch (category) {
                          case 'industry': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
                          case 'place': return 'bg-green-500/10 text-green-500 border-green-500/20';
                          case 'subject': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
                          case 'preference': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
                          default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
                        }
                      };
                      
                      return (
                      <Card key={fact.id} data-testid={`card-fact-${fact.id}`}>
                        <CardHeader className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm flex-1" data-testid={`text-fact-content-${fact.id}`}>
                              {fact.fact}
                            </p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge 
                                className={getCategoryColor(fact.category || 'general')}
                                variant="outline"
                                data-testid={`badge-fact-category-${fact.id}`}
                              >
                                {fact.category || 'general'}
                              </Badge>
                              <Badge 
                                variant={fact.score >= 80 ? "default" : fact.score >= 70 ? "secondary" : "outline"} 
                                data-testid={`badge-fact-score-${fact.id}`}
                              >
                                {fact.score}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span data-testid={`text-fact-user-${fact.id}`}>
                              {fact.userId}
                            </span>
                            {fact.sourceConversationId && (
                              <>
                                <span>•</span>
                                <code className="text-[10px]" data-testid={`text-fact-conversation-${fact.id}`}>
                                  {fact.sourceConversationId.slice(0, 8)}...
                                </code>
                              </>
                            )}
                            <span className="ml-auto" data-testid={`text-fact-time-${fact.id}`}>
                              {formatDistanceToNow(fact.createdAt)} ago
                            </span>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
