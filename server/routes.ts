import type { Express } from "express";
import { createServer, type Server } from "http";
import { openai, WYSHBONE_SYSTEM_PROMPT } from "./openai";
import { chatRequestSchema, addNoteRequestSchema } from "@shared/schema";
import cors from "cors";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for all routes
  app.use(cors());

  // POST /api/chat - Chat with OpenAI
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

      // Call OpenAI API - using gpt-5 (latest model released August 7, 2025)
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages: messagesWithSystem,
        max_completion_tokens: 8192,
      });

      const reply = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";

      res.json({ reply });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ 
        error: "Failed to process chat request", 
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
