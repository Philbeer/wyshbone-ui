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
      const { getVenueCacheContext, addVenuesToCache, markVenuesAsServed, getVenueCache } = await import("./memory");
      
      // STEP 1: GPT Planner - Decide intent: search, use cache, or conversational response
      const plannerMessages = [
        {
          role: "system" as const,
          content: `You are a venue search intent classifier. Your job is to distinguish between:
- Requests for SPECIFIC VENUE LISTINGS (use "search" or "use_cache")
- CONVERSATIONAL questions, estimates, or general discussion (use "respond")

KEY DISTINCTION:
- "find X" / "show me X" / "I need X" = SEARCH for venue listings
- "how many X?" / "what is X?" / "tell me about X" = CONVERSATIONAL response

DO NOT search when user asks "how many" or similar analytical questions. Just answer conversationally.

Reply with a json object matching the action schema specified below.`
        },
        ...memoryConversation.map((msg) => ({ role: msg.role as "system" | "user" | "assistant", content: msg.content })),
        {
          role: "user" as const,
          content: `User query: "${latestUserMessage}"

${getVenueCacheContext(sessionId)}

Choose ONE action:

1. "search" - User wants a LIST of specific venues
   ✓ "find 5 pubs in London"
   ✓ "show me restaurants"
   ✗ "how many pubs are in London?" (this is NOT a search!)
   ✗ "what's a good pub?" (this is NOT a search!)

2. "use_cache" - User wants MORE from existing results
   ✓ "show 5 more"
   ✓ "next results"

3. "respond" - User wants CONVERSATION/INFORMATION (NOT venue listings)
   ✓ "how many pubs do you think there are in london?" 
   ✓ "what makes a good pub?"
   ✓ "thanks"
   ✓ "tell me about pubs"

Response format:
- If "respond": {"action": "respond", "answer": "your conversational answer here", "reasoning": "..."}
- If "search": {"action": "search", "query": "...", "count": N, "reasoning": "..."}
- If "use_cache": {"action": "use_cache", "count": N, "reasoning": "..."}`
        }
      ];

      const plannerResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: plannerMessages,
        response_format: { type: "json_object" },
      });

      const plannerText = plannerResponse.choices[0]?.message?.content || "{}";
      const plan = JSON.parse(plannerText);
      
      console.log("🎯 Planner decision:", plan);

      // STEP 2: Handle conversational responses
      if (plan.action === "respond") {
        const conversationalResponse = {
          query: latestUserMessage,
          conversational: true,
          answer: plan.answer || "I'd be happy to discuss that with you.",
          generated_at: new Date().toISOString()
        };
        
        // Store assistant's response in memory
        appendMessage(sessionId, { role: "assistant", content: plan.answer || conversationalResponse.answer });
        
        return res.json(conversationalResponse);
      }

      let newVenues: any[] = [];

      // STEP 3: If planner says "search", call Google Places FIRST as primary source
      if (plan.action === "search") {
        const { searchPlaces } = await import("./googlePlaces");
        
        // Extract location from query (simple parsing)
        const queryLower = (plan.query || latestUserMessage).toLowerCase();
        let locationText = "";
        
        // Common patterns: "in [location]", "near [location]", "at [location]"
        const locationMatch = queryLower.match(/(?:in|near|at)\s+([a-z\s,]+?)(?:\s|$)/);
        if (locationMatch) {
          locationText = locationMatch[1].trim();
        }

        // Call Google Places API directly as primary source
        // Always fetch 60 results (3 pages of 20) to build a large cache
        const placesResults = await searchPlaces({
          query: plan.query || latestUserMessage,
          locationText: locationText || undefined,
          maxResults: 60, // Fetch up to 60 results across 3 pages
        });

        console.log(`📍 Google Places found ${placesResults.length} venues`);

        // Add Google Places results to cache
        if (placesResults.length > 0) {
          addVenuesToCache(
            sessionId,
            placesResults.map((v) => ({
              placeId: v.placeId,
              name: v.name,
              address: v.address,
            }))
          );
          newVenues = placesResults;
        }
      }

      // STEP 4: Use GPT formatter to create final response from cache
      const cache = getVenueCache(sessionId);
      const availableVenues = cache.filter((v) => !v.served);
      
      const formatterMessages = [
        ...memoryConversation.map((msg) => ({ role: msg.role as "system" | "user" | "assistant", content: msg.content })),
        {
          role: "system" as const,
          content: `Available venues to show (not yet served): ${JSON.stringify(availableVenues)}\n\nCreate a response using these venues. Format as JSON: {"query": "...", "verified": true, "results": [{placeId, name, address, ...}], "generated_at": "ISO timestamp"}`
        }
      ];

      const formatterResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: formatterMessages,
        response_format: { type: "json_object" },
      });

      const formatterText = formatterResponse.choices[0]?.message?.content || "{}";
      const finalResponse = JSON.parse(formatterText);

      // Mark venues as served
      if (finalResponse.results && Array.isArray(finalResponse.results)) {
        const servedPlaceIds = finalResponse.results.map((v: any) => v.placeId).filter(Boolean);
        markVenuesAsServed(sessionId, servedPlaceIds);
      }

      // Store assistant's formatted response in memory
      appendMessage(sessionId, { role: "assistant", content: formatterText });

      return res.json(finalResponse);

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
      const { items, concurrency = 3, contacts } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty `items` array" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      // Parse contacts configuration
      const contactsConfig = contacts?.enabled ? {
        enabled: true,
        roles: contacts.roles || ["general manager", "bar manager", "taproom manager", "head brewer", "owner", "landlord"],
        maxPerPlace: contacts.maxPerPlace || 3,
        minConfidence: contacts.minConfidence || 0.6,
      } : { enabled: false };

      // JSON schema for enrichment output (without contacts)
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
            required: ["website", "linkedin", "twitter", "instagram", "facebook"],
            additionalProperties: false,
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "domain", "contact_email", "socials", "category", "summary", "suggested_intro", "lead_score"],
        additionalProperties: false,
      };

      // JSON schema for contact enrichment
      const contactEnrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                role_normalized: { 
                  type: "string", 
                  description: "one of: general_manager, bar_manager, taproom_manager, head_brewer, owner, landlord, other" 
                },
                source_url: { type: "string" },
                source_type: { 
                  type: "string", 
                  description: "website|linkedin|instagram|facebook|news|other" 
                },
                source_date: { 
                  type: "string", 
                  nullable: true, 
                  description: "ISO date if available (post/article/profile last updated)" 
                },
                confidence: { 
                  type: "number", 
                  description: "0-1" 
                },
                email_public: { 
                  type: "string", 
                  nullable: true, 
                  description: "Only if clearly published; never guess" 
                },
                email_type: { 
                  type: "string", 
                  nullable: true, 
                  description: "generic|personal" 
                },
                phone_public: { type: "string", nullable: true },
                linkedin_url: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
              },
              required: ["name", "title", "role_normalized", "source_url", "source_type", "source_date", "confidence", "email_public", "email_type", "phone_public", "linkedin_url", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["placeId", "contacts"],
        additionalProperties: false,
      };

      // Process items with concurrency control
      const enrichItem = async (item: any) => {
        const placeId = item.placeId || item.resourceName?.replace(/^places\//, "") || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const phone = item.phone || "";
        const domain = item.domain || (website ? new URL(website).hostname : "");

        // Extract city/town from address for contact search
        const cityMatch = address.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
        const city = cityMatch ? cityMatch[1].trim() : "";

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
          
          // CRITICAL: Validate that GPT returned the exact Place ID we provided - reject if mismatch
          if (enrichment.placeId !== placeId) {
            console.error(`Enrichment Place ID mismatch! Expected: ${placeId}, Got: ${enrichment.placeId}. Rejecting enrichment.`);
            // Don't use hallucinated enrichment for wrong place - return minimal data
            return {
              ...item,
              placeId,
              domain: null,
              contact_email: null,
              socials: {},
              category: "unknown",
              summary: "Enrichment rejected due to Place ID mismatch",
              suggested_intro: "",
              lead_score: 0,
              ...(contactsConfig.enabled ? { contacts: [] } : {}),
            };
          }

          // Optional: Enrich with public contacts if enabled
          let contacts = [];
          if (contactsConfig.enabled) {
            const enrichedDomain = enrichment.domain || domain;
            const enrichedWebsite = enrichment.socials?.website || website;

            const contactPrompt = `You are a B2B sales research assistant. Find PUBLIC contact information for this business.

Business: ${name}
${city ? `City: ${city}` : ""}
${enrichedDomain ? `Domain: ${enrichedDomain}` : ""}
${enrichedWebsite ? `Website: ${enrichedWebsite}` : ""}

CRITICAL SAFETY RULES:
- Only return PUBLIC contact info with a verifiable source URL
- Never guess personal emails, phone numbers, or names
- If unsure, return an empty contacts list
- Never use paywalled, login-gated, or scraped sources

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Search for contacts with these roles: ${contactsConfig.roles.join(", ")}

Search strategy:
1. Check "${name}" ${city} manager OR owner
2. ${enrichedDomain ? `Search site:${enrichedDomain} for "team" OR "staff" OR "meet the team" OR "about us"` : ""}
3. Search "${name}" LinkedIn for relevant roles (${contactsConfig.roles.slice(0, 3).join(", ")})
4. Check Instagram/Facebook business pages for contact info
5. Look for press mentions or news articles

For each contact found:
- Verify they are current (within ~18 months)
- Include the exact source URL where you found the info
- Set confidence (0-1) based on how current and authoritative the source is
- Only include email/phone if clearly published publicly
- Classify source_type as: website, linkedin, instagram, facebook, news, or other

Return up to ${contactsConfig.maxPerPlace} contacts with confidence >= ${contactsConfig.minConfidence}.
Return structured data with the EXACT placeId: "${placeId}"`;

            try {
              const contactRequestBody = {
                model: "gpt-4o-mini",
                input: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: contactPrompt,
                      },
                    ],
                  },
                ],
                tools: [{ type: "web_search" }],
                text: {
                  format: {
                    type: "json_schema",
                    name: "contact_enrichment",
                    schema: contactEnrichmentSchema,
                  },
                },
              };

              const contactResponse = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify(contactRequestBody),
              });

              if (contactResponse.ok) {
                const contactData = await contactResponse.json();

                let contactOutputText: string | null = null;
                if (contactData.output?.[1]?.content?.[0]?.text) {
                  contactOutputText = contactData.output[1].content[0].text;
                } else if (contactData.output?.[0]?.content?.[0]?.text) {
                  contactOutputText = contactData.output[0].content[0].text;
                } else if (Array.isArray(contactData.output)) {
                  for (const contactItem of contactData.output) {
                    if (contactItem.content?.[0]?.text) {
                      contactOutputText = contactItem.content[0].text;
                      break;
                    }
                  }
                }

                if (contactOutputText) {
                  const contactEnrichment = JSON.parse(contactOutputText);
                  
                  // CRITICAL: Validate Place ID - reject mismatches instead of overwriting
                  if (contactEnrichment.placeId !== placeId) {
                    console.error(`Contact Place ID mismatch! Expected: ${placeId}, Got: ${contactEnrichment.placeId}. Rejecting contact enrichment.`);
                    // Don't use hallucinated contacts for wrong place
                  } else {
                    // Filter contacts by role, confidence, source validation, and max count
                  const normalizedRoles = contactsConfig.roles.map((r: string) => 
                    r.toLowerCase().replace(/\s+/g, "_")
                  );
                  
                    contacts = (contactEnrichment.contacts || [])
                      .filter((c: any) => {
                        // Must have source URL
                        if (!c.source_url || typeof c.source_url !== "string") {
                          console.warn(`Contact "${c.name}" rejected: missing source_url`);
                          return false;
                        }
                        
                        // Source URL must be valid HTTPS URL
                        try {
                          const url = new URL(c.source_url);
                          if (!url.protocol.startsWith("http")) {
                            console.warn(`Contact "${c.name}" rejected: invalid source_url protocol`);
                            return false;
                          }
                        } catch (e) {
                          console.warn(`Contact "${c.name}" rejected: malformed source_url`);
                          return false;
                        }
                        
                        // Must meet confidence threshold
                        if (c.confidence < contactsConfig.minConfidence) {
                          return false;
                        }
                        
                        // Must match requested roles
                        if (normalizedRoles.length > 0 && !normalizedRoles.includes(c.role_normalized)) {
                          return false;
                        }
                        
                        return true;
                      })
                      .slice(0, contactsConfig.maxPerPlace);
                  }
                }
              }
            } catch (contactError: any) {
              console.error(`Contact enrichment error for ${name}:`, contactError.message);
            }
          }
          
          return {
            ...item,
            ...enrichment,
            ...(contactsConfig.enabled ? { contacts } : {}),
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
            ...(contactsConfig.enabled ? { contacts: [] } : {}),
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
  // POST /api/prospects/enrich_contacts - Contacts-only enrichment
  // =========================================
  app.post("/api/prospects/enrich_contacts", async (req, res) => {
    try {
      const { items, concurrency = 3, roles, maxPerPlace = 3, minConfidence = 0.6 } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty `items` array" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      const contactRoles = roles || ["general manager", "bar manager", "taproom manager", "head brewer", "owner", "landlord"];

      // JSON schema for contact enrichment
      const contactEnrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                role_normalized: { type: "string", description: "one of: general_manager, bar_manager, taproom_manager, head_brewer, owner, landlord, other" },
                source_url: { type: "string" },
                source_type: { type: "string", description: "website|linkedin|instagram|facebook|news|other" },
                source_date: { type: "string", nullable: true, description: "ISO date if available" },
                confidence: { type: "number", description: "0-1" },
                email_public: { type: "string", nullable: true, description: "Only if clearly published; never guess" },
                email_type: { type: "string", nullable: true, description: "generic|personal" },
                phone_public: { type: "string", nullable: true },
                linkedin_url: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
              },
              required: ["name", "title", "role_normalized", "source_url", "source_type", "source_date", "confidence", "email_public", "email_type", "phone_public", "linkedin_url", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["placeId", "contacts"],
        additionalProperties: false,
      };

      const enrichContactsForItem = async (item: any) => {
        const placeId = item.placeId || item.resourceName?.replace(/^places\//, "") || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const domain = item.domain || (website ? new URL(website).hostname : "");

        // Extract city from address
        const cityMatch = address.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
        const city = cityMatch ? cityMatch[1].trim() : "";

        const contactPrompt = `You are a B2B sales research assistant. Find PUBLIC contact information for this business.

Business: ${name}
${city ? `City: ${city}` : ""}
${domain ? `Domain: ${domain}` : ""}
${website ? `Website: ${website}` : ""}

CRITICAL SAFETY RULES:
- Only return PUBLIC contact info with a verifiable source URL
- Never guess personal emails, phone numbers, or names
- If unsure, return an empty contacts list
- Never use paywalled, login-gated, or scraped sources

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Search for contacts with these roles: ${contactRoles.join(", ")}

Search strategy:
1. Check "${name}" ${city} manager OR owner
2. ${domain ? `Search site:${domain} for "team" OR "staff" OR "meet the team" OR "about us"` : ""}
3. Search "${name}" LinkedIn for relevant roles (${contactRoles.slice(0, 3).join(", ")})
4. Check Instagram/Facebook business pages for contact info
5. Look for press mentions or news articles

For each contact found:
- Verify they are current (within ~18 months)
- Include the exact source URL where you found the info
- Set confidence (0-1) based on how current and authoritative the source is
- Only include email/phone if clearly published publicly
- Classify source_type as: website, linkedin, instagram, facebook, news, or other

Return up to ${maxPerPlace} contacts with confidence >= ${minConfidence}.
Return structured data with the EXACT placeId: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: contactPrompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "contact_enrichment",
                schema: contactEnrichmentSchema,
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

          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const contactItem of data.output) {
              if (contactItem.content?.[0]?.text) {
                outputText = contactItem.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const contactEnrichment = JSON.parse(outputText);

          // CRITICAL: Validate Place ID - reject mismatches instead of overwriting
          if (contactEnrichment.placeId !== placeId) {
            console.error(`Contact Place ID mismatch! Expected: ${placeId}, Got: ${contactEnrichment.placeId}. Rejecting contact enrichment.`);
            // Don't use hallucinated contacts for wrong place
            return {
              placeId,
              contacts: [],
            };
          }

          // Filter contacts by role, confidence, source validation, and max count
          const normalizedRoles = contactRoles.map((r: string) => 
            r.toLowerCase().replace(/\s+/g, "_")
          );
          
          const contacts = (contactEnrichment.contacts || [])
            .filter((c: any) => {
              // Must have source URL
              if (!c.source_url || typeof c.source_url !== "string") {
                console.warn(`Contact "${c.name}" rejected: missing source_url`);
                return false;
              }
              
              // Source URL must be valid HTTP/HTTPS URL
              try {
                const url = new URL(c.source_url);
                if (!url.protocol.startsWith("http")) {
                  console.warn(`Contact "${c.name}" rejected: invalid source_url protocol`);
                  return false;
                }
              } catch (e) {
                console.warn(`Contact "${c.name}" rejected: malformed source_url`);
                return false;
              }
              
              // Must meet confidence threshold
              if (c.confidence < minConfidence) {
                return false;
              }
              
              // Must match requested roles
              if (normalizedRoles.length > 0 && !normalizedRoles.includes(c.role_normalized)) {
                return false;
              }
              
              return true;
            })
            .slice(0, maxPerPlace);

          return {
            placeId,
            contacts,
          };
        } catch (error: any) {
          console.error(`Contact enrichment error for ${name}:`, error.message);
          return {
            placeId,
            contacts: [],
          };
        }
      };

      // Process in batches with concurrency control
      const enriched = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichContactsForItem));
        enriched.push(...batchResults);
      }

      return res.json({ enriched });
    } catch (e: any) {
      console.error("prospects/enrich_contacts error:", e);
      return res.status(500).json({ error: e.message || "Contact enrichment failed" });
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
            required: ["website", "linkedin", "twitter", "instagram", "facebook"],
            additionalProperties: false,
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "domain", "contact_email", "socials", "category", "summary", "suggested_intro", "lead_score"],
        additionalProperties: false,
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
