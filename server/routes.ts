import type { Express } from "express";
import { createServer, type Server } from "http";
import { openai } from "./openai"; // keep your existing OpenAI client
import {
  getConversation,
  appendMessage,
  resetConversation,
  maybeSummarize,
} from "./memory";
import {
  chatRequestSchema,
  addNoteRequestSchema,
  searchRequestSchema,
} from "@shared/schema";
import cors from "cors";

// Helper to identify each user's session (Bubble should send x-session-id)
function getSessionId(req: import("express").Request) {
  return (req.headers["x-session-id"] as string) || req.ip || "anon";
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for all routes
  app.use(cors());

  // ===========================
  // POST /api/chat – streaming + MEMORY
  // ===========================
  app.post("/api/chat", async (req, res) => {
    try {
      // Validate request body against your existing schema
      const validation = chatRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const { messages, user } = validation.data; // 'user' kept in case you use it elsewhere
      const sessionId = getSessionId(req);

      // Grab the latest user message text (last item in the array)
      const latestUserText =
        messages?.length ? String(messages[messages.length - 1].content) : "";

      // 1) Store user's new message in memory
      appendMessage(sessionId, { role: "user", content: latestUserText });

      // 2) Compact long conversations with a summary when needed
      await maybeSummarize(sessionId, openai);

      // 3) Pull the memory-backed conversation to send to OpenAI
      const memoryMessages = getConversation(sessionId);

      // Prepare streaming headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Stream from OpenAI with memory messages
      let aiBuffer = "";

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: memoryMessages,
        max_tokens: 1500,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          aiBuffer += content; // collect full assistant reply
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          // @ts-ignore - flush exists in this env
          if (res.flush) res.flush();
        }
      }

      // Save assistant reply to memory
      appendMessage(sessionId, { role: "assistant", content: aiBuffer });

      // End stream
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Optional: clear memory for a given session (useful for "New chat")
  app.post("/api/chat/reset", (req, res) => {
    const sessionId = getSessionId(req);
    resetConversation(sessionId);
    res.json({ status: "ok", message: "Conversation reset." });
  });

  // =========================================
  // POST /api/search – OpenAI Responses API
  // (kept as you provided; unchanged in logic)
  // =========================================
  app.post("/api/search", async (req, res) => {
    try {
      // Get session ID for memory tracking
      const sessionId = getSessionId(req);
      
      // Accept either query string or messages array for conversation history
      const { query, messages } = req.body;

      if (!query && (!messages || messages.length === 0)) {
        return res
          .status(400)
          .json({ error: "Either query or messages must be provided" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(500)
          .json({ error: "OPENAI_API_KEY is not configured" });
      }
      
      // Get the latest user message
      const latestUserMessage = messages && messages.length > 0 
        ? messages[messages.length - 1].content 
        : query;
      
      // Store user message in memory
      appendMessage(sessionId, { role: "user", content: latestUserMessage });
      
      // Get full conversation from memory
      const memoryConversation = getConversation(sessionId);
      
      // Check if this is a follow-up (more than just system prompt + one user message)
      const userMessageCount = memoryConversation.filter(m => m.role === "user").length;
      const isFollowUp = userMessageCount > 1;

      // Structured JSON schema for initial search output (before Google Places verification)
      const wyshboneSchema = {
        type: "object",
        properties: {
          query: { type: "string", description: "The original search query" },
          generated_at: {
            type: "string",
            description: "ISO timestamp when the response was generated",
          },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Venue name" },
                address: { type: "string", description: "Full address" },
                sourceUrl: { type: "string", description: "URL where this info was found" },
              },
              required: ["name", "address", "sourceUrl"],
              additionalProperties: false,
            },
            description: "Array of venues found from web search",
          },
        },
        required: ["query", "generated_at", "results"],
        additionalProperties: false,
      };

      // Build input for Responses API based on memory conversation
      let inputMessages: any;
      
      if (isFollowUp) {
        // For follow-ups, format the entire conversation as context
        let conversationText = "";
        for (const msg of memoryConversation) {
          if (msg.role === "system") {
            // Skip system messages for Responses API
            continue;
          }
          const roleLabel = msg.role === "user" ? "User" : "Assistant";
          conversationText += `${roleLabel}: ${msg.content}\n\n`;
        }
        
        inputMessages = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: conversationText.trim(),
              },
            ],
          },
        ];
      } else {
        // For first query, just send the latest message
        inputMessages = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: latestUserMessage,
              },
            ],
          },
        ];
      }

      const requestBody: any = {
        model: "gpt-4o-mini",
        input: inputMessages,
      };

      // Add web_search + JSON schema only for non-follow-up queries
      if (!isFollowUp) {
        requestBody.tools = [{ type: "web_search" }];
        requestBody.text = {
          format: {
            type: "json_schema",
            name: "wyshbone_results",
            schema: wyshboneSchema,
          },
        };
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", errorText);
        return res
          .status(response.status)
          .json({ error: "OpenAI API request failed", details: errorText });
      }

      const data = await response.json();

      // Extract assistant text
      let outputText: string | null = null;
      if (data.output?.[1]?.content?.[0]?.text) {
        outputText = data.output[1].content[0].text;
      } else if (data.output?.[0]?.content?.[0]?.text) {
        outputText = data.output[0].content[0].text;
      } else if (Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.content?.[0]?.text) {
            outputText = item.content[0].text;
            break;
          }
        }
      }

      if (!outputText) {
        console.error("Could not parse OpenAI response:", JSON.stringify(data));
        return res.status(500).json({
          error: "Unexpected response format",
          details: "Could not find text in response output",
          raw: data,
        });
      }

      // Store assistant's response in memory
      appendMessage(sessionId, { role: "assistant", content: outputText });

      if (isFollowUp) {
        // follow-ups: return plain text
        return res.json({ plain_text: outputText, is_follow_up: true });
      } else {
        // initial searches: parse JSON and verify venues with Google Places
        try {
          const parsed = JSON.parse(outputText);
          
          // If no results or not an array, return as-is
          if (!parsed.results || !Array.isArray(parsed.results) || parsed.results.length === 0) {
            return res.json({ ...parsed, verified: false });
          }
          
          // Import verifyVenue function
          const { verifyVenue } = await import("./googlePlaces");
          
          // Verify each venue with Google Places
          const verifiedResults = [];
          const rawResults = [...parsed.results];
          
          for (const venue of parsed.results) {
            try {
              console.log(`\n🔍 Verifying venue: "${venue.name}"`);
              console.log(`   Address: ${venue.address}`);
              
              const verification = await verifyVenue({
                name: venue.name,
                address: venue.address,
              });
              
              console.log(`   Found: ${verification.found}`);
              if (verification.best) {
                console.log(`   Best match: "${verification.best.name}"`);
                console.log(`   Match score: ${verification.best.score}`);
                console.log(`   Place ID: ${verification.best.placeId}`);
                console.log(`   Status: ${verification.best.businessStatus}`);
              }
              
              if (verification.candidates && verification.candidates.length > 0) {
                console.log(`   Other candidates:`);
                verification.candidates.slice(0, 3).forEach((c: any, i: number) => {
                  const typesStr = c.types?.length ? c.types.join(", ") : "no types";
                  console.log(`     ${i + 1}. "${c.name}" (score: ${c.score}) [${typesStr}] - ${c.placeId}`);
                });
              }
              
              // Only include if found and operational
              if (verification.found && verification.best?.businessStatus === "OPERATIONAL") {
                verifiedResults.push({
                  name: verification.best.name,
                  address: verification.best.address,
                  placeId: verification.best.placeId,
                  businessStatus: verification.best.businessStatus,
                  phone: verification.best.phone,
                  website: verification.best.website,
                  sourceUrl: venue.sourceUrl,
                });
              } else {
                console.log(`   ❌ Skipped: ${!verification.found ? 'not found' : 'not operational'}`);
              }
            } catch (verifyError) {
              console.error(`Error verifying venue ${venue.name}:`, verifyError);
              // Continue with next venue if verification fails
            }
          }
          
          // If we have verified results, return them
          if (verifiedResults.length > 0) {
            return res.json({
              query: parsed.query,
              verified: true,
              results: verifiedResults,
              generated_at: parsed.generated_at,
            });
          } else {
            // No verified results found - return raw results with verified: false
            return res.json({
              query: parsed.query,
              verified: false,
              rawResults: rawResults,
              message: "No verified operational venues found",
              generated_at: parsed.generated_at,
            });
          }
        } catch (e) {
          console.error("JSON parse error:", e);
          return res.json({ error: "Failed to parse JSON response", raw_text: outputText });
        }
      }
    } catch (error: any) {
      console.error("Search error:", error);
      return res
        .status(500)
        .json({ error: "Search request failed", message: error.message });
    }
  });

  // Reset search conversation memory
  app.post("/api/search/reset", (req, res) => {
    const sessionId = getSessionId(req);
    resetConversation(sessionId);
    res.json({ status: "ok", message: "Search conversation reset." });
  });

  // =========================================
  // POST /api/tool/add_note – Bubble stub
  // =========================================
  app.post("/api/tool/add_note", async (req, res) => {
    try {
      const validation = addNoteRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const { userToken, leadId, note } = validation.data;

      console.log("📝 Add Note Request (Stub):", {
        userToken,
        leadId,
        note,
        timestamp: new Date().toISOString(),
      });

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Add note error:", error);
      res
        .status(500)
        .json({ error: "Failed to add note", message: error.message });
    }
  });
  // POST /api/places/verify – cross-check a venue, return Place ID + status
  app.post("/api/places/verify", async (req, res) => {
    try {
      const { name, address, lat, lng, radiusMeters } = req.body || {};

      if (!name) {
        return res.status(400).json({ error: "Missing `name`" });
      }

      const locationBias =
        lat && lng && radiusMeters
          ? { lat: Number(lat), lng: Number(lng), radiusMeters: Number(radiusMeters) }
          : undefined;

      const { verifyVenue } = await import("./googlePlaces");

      const result = await verifyVenue({
        name,
        address,
        locationBias,
      });

      return res.json(result);
    } catch (e: any) {
      console.error("verify error:", e);
      return res.status(500).json({ error: e.message || "Verify failed" });
    }
  });

  // =========================================
  // POST /api/places/search - Places v1 discovery
  // =========================================
  app.post("/api/places/search", async (req, res) => {
    try {
      const { query, locationText, lat, lng, radiusMeters, typesFilter, maxResults } = req.body || {};

      if (!query) {
        return res.status(400).json({ error: "Missing `query`" });
      }

      const { searchPlaces } = await import("./googlePlaces");

      const results = await searchPlaces({
        query,
        locationText,
        lat: lat !== undefined ? Number(lat) : undefined,
        lng: lng !== undefined ? Number(lng) : undefined,
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        maxResults: maxResults !== undefined ? Number(maxResults) : 30,
        typesFilter,
      });

      return res.json({
        results,
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("places/search error:", e);
      return res.status(500).json({ error: e.message || "Search failed" });
    }
  });

  // =========================================
  // POST /api/prospects/enrich - GPT enrichment via Responses API
  // =========================================
  app.post("/api/prospects/enrich", async (req, res) => {
    try {
      const { items, concurrency = 3 } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty `items` array" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      // JSON schema for enrichment output
      const enrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          domain: { type: "string", nullable: true },
          contact_email: { type: "string", nullable: true },
          socials: {
            type: "object",
            properties: {
              website: { type: "string", nullable: true },
              linkedin: { type: "string", nullable: true },
              twitter: { type: "string", nullable: true },
              instagram: { type: "string", nullable: true },
              facebook: { type: "string", nullable: true },
            },
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "category", "summary", "suggested_intro", "lead_score"],
      };

      // Process items with concurrency control
      const enrichItem = async (item: any) => {
        const placeId = item.placeId || item.resourceName?.replace(/^places\//, "") || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const phone = item.phone || "";

        const prompt = `You are a B2B sales research assistant. Enrich this business with web search:

Business: ${name}
Address: ${address}
${website ? `Website: ${website}` : ""}
${phone ? `Phone: ${phone}` : ""}

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Tasks:
1. ${website ? "Verify the website is correct" : "Find the official website"}
2. Extract domain name (e.g., example.com)
3. Find generic contact email if publicly listed (info@, hello@, contact@)
4. Find social media links (LinkedIn, Twitter, Instagram, Facebook)
5. Classify the business type (e.g., pub, brewery, restaurant, cafe)
6. Write a 1-2 sentence neutral summary of what they do
7. Create a short suggested outreach intro (1 sentence, professional, no fluff)
8. Assign a lead score 0-100 based on online presence quality

Return structured data with the EXACT placeId provided above: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "enrichment",
                schema: enrichmentSchema,
              },
            },
          };

          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();

          // Extract text from response
          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.content?.[0]?.text) {
                outputText = item.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const enrichment = JSON.parse(outputText);
          
          // CRITICAL: Validate that GPT returned the exact Place ID we provided
          if (enrichment.placeId !== placeId) {
            console.error(`Place ID mismatch! Expected: ${placeId}, Got: ${enrichment.placeId}`);
            // Force the correct Place ID instead of accepting fabricated one
            enrichment.placeId = placeId;
          }
          
          return {
            ...item,
            ...enrichment,
          };
        } catch (error: any) {
          console.error(`Enrichment error for ${name}:`, error.message);
          return {
            ...item,
            placeId,
            domain: null,
            contact_email: null,
            socials: {},
            category: "unknown",
            summary: "Enrichment failed",
            suggested_intro: "",
            lead_score: 0,
          };
        }
      };

      // Process in batches with concurrency control
      const enriched = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichItem));
        enriched.push(...batchResults);
      }

      return res.json({ enriched });
    } catch (e: any) {
      console.error("prospects/enrich error:", e);
      return res.status(500).json({ error: e.message || "Enrichment failed" });
    }
  });

  // =========================================
  // POST /api/prospects/search_and_enrich - Combined endpoint
  // =========================================
  app.post("/api/prospects/search_and_enrich", async (req, res) => {
    try {
      const { query, locationText, lat, lng, radiusMeters, typesFilter, maxResults, enrich = true, concurrency = 3 } = req.body || {};

      if (!query) {
        return res.status(400).json({ error: "Missing `query`" });
      }

      // Step 1: Search Places
      const { searchPlaces } = await import("./googlePlaces");
      const places = await searchPlaces({
        query,
        locationText,
        lat: lat !== undefined ? Number(lat) : undefined,
        lng: lng !== undefined ? Number(lng) : undefined,
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        maxResults: maxResults !== undefined ? Number(maxResults) : 20,
        typesFilter,
      });

      if (!enrich) {
        return res.json({
          verified: true,
          results: places,
          generated_at: new Date().toISOString(),
        });
      }

      // Step 2: Enrich with GPT
      if (!process.env.OPENAI_API_KEY) {
        return res.json({
          verified: true,
          results: places,
          generated_at: new Date().toISOString(),
          note: "Enrichment skipped - OPENAI_API_KEY not configured",
        });
      }

      const enrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          domain: { type: "string", nullable: true },
          contact_email: { type: "string", nullable: true },
          socials: {
            type: "object",
            properties: {
              website: { type: "string", nullable: true },
              linkedin: { type: "string", nullable: true },
              twitter: { type: "string", nullable: true },
              instagram: { type: "string", nullable: true },
              facebook: { type: "string", nullable: true },
            },
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "category", "summary", "suggested_intro", "lead_score"],
      };

      const enrichItem = async (item: any) => {
        const placeId = item.placeId || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const phone = item.phone || "";

        const prompt = `You are a B2B sales research assistant. Enrich this business with web search:

Business: ${name}
Address: ${address}
${website ? `Website: ${website}` : ""}
${phone ? `Phone: ${phone}` : ""}

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Tasks:
1. ${website ? "Verify the website is correct" : "Find the official website"}
2. Extract domain name (e.g., example.com)
3. Find generic contact email if publicly listed (info@, hello@, contact@)
4. Find social media links (LinkedIn, Twitter, Instagram, Facebook)
5. Classify the business type (e.g., pub, brewery, restaurant, cafe)
6. Write a 1-2 sentence neutral summary of what they do
7. Create a short suggested outreach intro (1 sentence, professional, no fluff)
8. Assign a lead score 0-100 based on online presence quality

Return structured data with the EXACT placeId provided above: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "enrichment",
                schema: enrichmentSchema,
              },
            },
          };

          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();

          // Extract text from response
          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.content?.[0]?.text) {
                outputText = item.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const enrichment = JSON.parse(outputText);
          
          // CRITICAL: Validate that GPT returned the exact Place ID we provided
          if (enrichment.placeId !== placeId) {
            console.error(`Place ID mismatch! Expected: ${placeId}, Got: ${enrichment.placeId}`);
            // Force the correct Place ID instead of accepting fabricated one
            enrichment.placeId = placeId;
          }
          
          return {
            ...item,
            ...enrichment,
          };
        } catch (error: any) {
          console.error(`Enrichment error for ${name}:`, error.message);
          return {
            ...item,
            placeId,
            domain: null,
            contact_email: null,
            socials: {},
            category: "unknown",
            summary: "Enrichment failed",
            suggested_intro: "",
            lead_score: 0,
          };
        }
      };

      // Process in batches
      const enriched = [];
      for (let i = 0; i < places.length; i += concurrency) {
        const batch = places.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichItem));
        enriched.push(...batchResults);
      }

      return res.json({
        verified: true,
        results: enriched,
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("prospects/search_and_enrich error:", e);
      return res.status(500).json({ error: e.message || "Search and enrich failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
