import type { Express } from "express";
import { createServer, type Server } from "http";
import { openai, WYSHBONE_SYSTEM_PROMPT } from "./openai";
import { chatRequestSchema, addNoteRequestSchema, searchRequestSchema } from "@shared/schema";
import cors from "cors";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for all routes
  app.use(cors());

  // POST /api/chat - Chat with OpenAI (streaming)
  app.post("/api/chat", async (req, res) => {
    try {
      // Validate request body
      const validation = chatRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request format", details: validation.error });
      }

      const { messages, user } = validation.data;

      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      // Add system prompt to messages
      const messagesWithSystem = [
        { role: "system" as const, content: WYSHBONE_SYSTEM_PROMPT },
        ...messages,
      ];

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders(); // Send headers immediately

      // Call OpenAI API with streaming
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messagesWithSystem,
        max_tokens: 1500,
        stream: true,
      });

      // Stream chunks to client
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          // @ts-ignore - flush is available in some environments
          if (res.flush) res.flush();
        }
      }

      // Send done signal
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // POST /api/search - Search with OpenAI Responses API
  app.post("/api/search", async (req, res) => {
    try {
      // Accept either query string or messages array for conversation history
      const { query, messages } = req.body;
      
      if (!query && (!messages || messages.length === 0)) {
        return res.status(400).json({ error: "Either query or messages must be provided" });
      }

      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      // Define the JSON schema for structured output
      const wyshboneSchema = {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The original search query"
          },
          generated_at: {
            type: "string",
            description: "ISO timestamp when the response was generated"
          },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                snippet: { type: "string" }
              },
              required: ["title", "url", "snippet"],
              additionalProperties: false
            },
            description: "Array of search results"
          },
          notes: {
            type: "string",
            description: "Additional notes or summary about the search results"
          }
        },
        required: ["query", "generated_at", "results", "notes"],
        additionalProperties: false
      };

      // Build the input array from conversation history or single query
      let inputMessages;
      let isFollowUp = false;
      
      if (messages && messages.length > 0) {
        // Filter to only user messages
        const userMessages = messages.filter((msg: any) => msg.role === "user");
        
        if (userMessages.length === 0) {
          return res.status(400).json({ error: "No user messages found in conversation history" });
        }
        
        // Check if this is a follow-up question (more than one user message)
        isFollowUp = userMessages.length > 1;
        
        // For follow-ups, include conversation history (both user and assistant messages)
        if (isFollowUp) {
          const lastUserMessage = userMessages[userMessages.length - 1].content;
          
          // Build conversation context including both user questions and assistant responses
          let conversationContext = "Previous conversation:\n\n";
          for (let i = 0; i < messages.length - 1; i++) {
            const msg = messages[i];
            if (msg.role === "user") {
              conversationContext += `User: ${msg.content}\n\n`;
            } else if (msg.role === "assistant") {
              conversationContext += `Assistant: ${msg.content}\n\n`;
            }
          }
          
          inputMessages = [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `${conversationContext}Current question: ${lastUserMessage}`
                }
              ]
            }
          ];
        } else {
          // Single message - convert to Responses API format
          inputMessages = [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: userMessages[0].content
              }
            ]
          }];
        }
      } else {
        // Single query format
        inputMessages = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: query
              }
            ]
          }
        ];
      }

      // Call the new OpenAI Responses API
      // Only use structured output and web_search for initial queries, not follow-ups
      const requestBody: any = {
        model: "gpt-4o-mini",
        input: inputMessages,
      };

      // Add web_search and structured output only for non-follow-up queries
      if (!isFollowUp) {
        requestBody.tools = [{ type: "web_search" }];
        requestBody.text = {
          format: {
            type: "json_schema",
            name: "wyshbone_results",
            schema: wyshboneSchema
          }
        };
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", errorText);
        return res.status(response.status).json({ 
          error: "OpenAI API request failed", 
          details: errorText 
        });
      }

      const data = await response.json();
      
      // Extract the text from the response - try multiple possible locations
      let outputText = null;
      
      // Try output[1].content[0].text first (assistant response)
      if (data.output?.[1]?.content?.[0]?.text) {
        outputText = data.output[1].content[0].text;
      } 
      // Try output[0].content[0].text as fallback
      else if (data.output?.[0]?.content?.[0]?.text) {
        outputText = data.output[0].content[0].text;
      }
      // Try to find any output with content
      else if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.content?.[0]?.text) {
            outputText = item.content[0].text;
            break;
          }
        }
      }
      
      if (!outputText) {
        console.error("Could not parse OpenAI response:", JSON.stringify(data, null, 2));
        return res.status(500).json({ 
          error: "Unexpected response format", 
          details: "Could not find text in response output",
          raw: data
        });
      }

      // Try to parse the JSON for structured responses, or return plain text for follow-ups
      if (isFollowUp) {
        // For follow-ups, return plain text response
        return res.json({
          plain_text: outputText,
          is_follow_up: true
        });
      } else {
        // For search queries, parse JSON
        try {
          const parsedResults = JSON.parse(outputText);
          return res.json(parsedResults);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          // If JSON parse fails, return the raw text
          return res.json({ 
            error: "Failed to parse JSON response",
            raw_text: outputText 
          });
        }
      }

    } catch (error: any) {
      console.error("Search error:", error);
      return res.status(500).json({ 
        error: "Search request failed", 
        message: error.message 
      });
    }
  });

  // POST /api/tool/add_note - Stub for Bubble integration
  app.post("/api/tool/add_note", async (req, res) => {
    try {
      // Validate request body
      const validation = addNoteRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request format", details: validation.error });
      }

      const { userToken, leadId, note } = validation.data;

      // Log the payload (stub for Bubble integration)
      console.log("📝 Add Note Request (Stub):", {
        userToken,
        leadId,
        note,
        timestamp: new Date().toISOString(),
      });

      // Return success response
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Add note error:", error);
      res.status(500).json({ 
        error: "Failed to add note", 
        message: error.message 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
