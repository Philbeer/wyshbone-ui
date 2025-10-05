import { z } from "zod";

// Chat message schema
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// Chat request schema
export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Chat response schema
export const chatResponseSchema = z.object({
  reply: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Tool add note request schema
export const addNoteRequestSchema = z.object({
  userToken: z.string(),
  leadId: z.string(),
  note: z.string(),
});

export type AddNoteRequest = z.infer<typeof addNoteRequestSchema>;

// Tool add note response schema
export const addNoteResponseSchema = z.object({
  ok: z.boolean(),
});

export type AddNoteResponse = z.infer<typeof addNoteResponseSchema>;

// Search request schema
export const searchRequestSchema = z.object({
  query: z.string(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

// Search response schema (wyshbone_results)
export const searchResponseSchema = z.object({
  query: z.string(),
  generated_at: z.string(),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
  })),
  notes: z.string(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
