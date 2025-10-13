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
import { storage } from "./storage";
import cors from "cors";
import * as cheerio from "cheerio";

// Helper to identify each user's session (Bubble should send x-session-id)
function getSessionId(req: import("express").Request) {
  return (req.headers["x-session-id"] as string) || req.ip || "anon";
}

// Helper to detect URLs in text
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlRegex);
  return matches || [];
}

// Helper to fetch and extract text content from a URL
async function fetchUrlContent(url: string): Promise<string> {
  try {
    console.log(`🌐 Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, header, aside').remove();
    
    // Extract title
    const title = $('title').text().trim();
    
    // Extract main content (try article first, then main, then body)
    let mainContent = '';
    if ($('article').length > 0) {
      mainContent = $('article').text();
    } else if ($('main').length > 0) {
      mainContent = $('main').text();
    } else {
      mainContent = $('body').text();
    }
    
    // Clean up whitespace
    const cleanContent = mainContent
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000); // Limit to ~15k chars
    
    console.log(`✅ Extracted ${cleanContent.length} characters from ${url}`);
    return `Title: ${title}\n\nContent: ${cleanContent}`;
  } catch (error: any) {
    console.error(`❌ Failed to fetch ${url}:`, error.message);
    throw new Error(`Could not fetch URL: ${error.message}`);
  }
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

      // Stream from OpenAI using Responses API with GPT-5
      let aiBuffer = "";

      // Check if the latest message contains URLs
      const urls = extractUrls(latestUserText);
      const useDirectFetch = urls.length > 0;

      // Check if user wants to control an existing job
      const jobCommandPattern = /\b(status|pause|stop|resume|cancel)\s+job\s+(\S+)/i;
      const jobCommandMatch = latestUserText.match(jobCommandPattern);
      
      if (jobCommandMatch) {
        const [, command, jobId] = jobCommandMatch;
        console.log(`🎯 Detected job command: ${command} for job ${jobId}`);
        
        try {
          if (command.toLowerCase() === 'status') {
            const statusResp = await fetch(`http://localhost:5000/api/jobs/status?jobId=${jobId}`);
            const statusData = await statusResp.json();
            
            if (statusResp.ok) {
              const responseText = `📊 Job ${jobId} Status:\n\n` +
                `Business Type: ${statusData.business_type}\n` +
                `Status: ${statusData.status}\n` +
                `Progress: ${statusData.processed_count}/${statusData.total} (${statusData.percent}%)\n` +
                `Recent Region: ${statusData.recent_region || 'N/A'}\n` +
                `Failed: ${statusData.failed.length}`;
              
              appendMessage(sessionId, { role: "assistant", content: responseText });
              res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            } else {
              const errorMsg = `❌ Failed to get job status: ${statusData.error || 'Unknown error'}`;
              appendMessage(sessionId, { role: "assistant", content: errorMsg });
              res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            }
          } else if (command.toLowerCase() === 'pause' || command.toLowerCase() === 'stop') {
            const stopResp = await fetch(`http://localhost:5000/api/jobs/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const stopData = await stopResp.json();
            
            const responseText = stopResp.ok 
              ? `⏸️ Job ${jobId} has been paused` 
              : `❌ Failed to pause job: ${stopData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          } else if (command.toLowerCase() === 'resume') {
            const startResp = await fetch(`http://localhost:5000/api/jobs/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const startData = await startResp.json();
            
            const responseText = startResp.ok 
              ? `▶️ Job ${jobId} has been resumed` 
              : `❌ Failed to resume job: ${startData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          } else if (command.toLowerCase() === 'cancel') {
            const stopResp = await fetch(`http://localhost:5000/api/jobs/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const stopData = await stopResp.json();
            
            const responseText = stopResp.ok 
              ? `🛑 Job ${jobId} has been cancelled` 
              : `❌ Failed to cancel job: ${stopData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          }
        } catch (error: any) {
          console.error("❌ Job command error:", error.message);
          const errorMsg = `Sorry, I couldn't execute that command: ${error.message}`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }
      }

      // Check if user wants to create a region-powered job (ONLY for "across all" patterns)
      // Regular "find/search" is now handled by Chat Completions API tool calling
      const jobCreationPattern = /\b(run|search|find)\b.*(across|in all|every)\b.*(counties|boroughs|states)/i;
      const isJobCreationRequest = jobCreationPattern.test(latestUserText);
      
      if (isJobCreationRequest) {
        console.log("🔵 Detected region job request - extracting parameters...");
        
        try {
          const extractionPrompt = [
            {
              role: "system" as const,
              content: `Extract job parameters from user request. Return JSON with: business_type (string), country ("UK" or "US"), granularity ("county", "borough", or "state"), region_filter (optional string like "London" or "Texas"). 
              
Examples:
- "Run dentists across all London boroughs" → {"business_type":"dentists","country":"UK","granularity":"borough","region_filter":"London"}
- "Search for pubs in every English county" → {"business_type":"pubs","country":"UK","granularity":"county"}
- "Find breweries in all Texas counties" → {"business_type":"breweries","country":"US","granularity":"county","region_filter":"Texas"}`
            },
            {
              role: "user" as const,
              content: `Extract from: "${latestUserText}"`
            }
          ];

          const extractionResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: extractionPrompt,
            response_format: { type: "json_object" },
          });

          const params = JSON.parse(extractionResp.choices[0]?.message?.content || "{}");
          console.log("📋 Extracted job params:", params);

          if (params.business_type && params.country && params.granularity) {
            // Create the job
            const createResp = await fetch(`http://localhost:5000/api/jobs/create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_type: params.business_type,
                country: params.country,
                granularity: params.granularity,
                region_filter: params.region_filter,
                userEmail: user.email
              })
            });

            const createData = await createResp.json();
            
            if (createResp.ok) {
              const { jobId, total_regions } = createData;
              
              // Start the job in background
              fetch(`http://localhost:5000/api/jobs/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
              }).catch(err => console.error("Failed to start job:", err));

              const responseText = `✅ Started job #${jobId} with ${total_regions} regions!\n\n` +
                `I'm now running searches for "${params.business_type}" across all regions.\n\n` +
                `Use "status job ${jobId}" to check progress.`;
              
              appendMessage(sessionId, { role: "assistant", content: responseText });
              res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            } else {
              const errorMsg = `❌ Failed to create job: ${createData.error}`;
              appendMessage(sessionId, { role: "assistant", content: errorMsg });
              res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            }
          } else {
            console.log("⚠️ Could not extract valid job parameters");
          }
        } catch (error: any) {
          console.error("❌ Job creation error:", error.message);
        }
      }

      // Check if user is confirming a pending batch workflow
      const pendingConfirmation = await storage.getPendingConfirmation(sessionId);
      const confirmationPattern = /^(yes|ok|confirm|proceed|go ahead|execute|send|do it)/i;
      const cancellationPattern = /^(no|cancel|stop|abort|nevermind|don't)/i;
      const correctionPattern = /^(actually|no,?\s+|i meant|change|correct|fix|instead|it should be)/i;

      if (pendingConfirmation) {
        // Check if user wants to make a correction
        if (correctionPattern.test(latestUserText.trim())) {
          console.log("🔄 User wants to correct the workflow, clearing confirmation");
          await storage.clearPendingConfirmation(sessionId);
          
          // Let the AI reprocess the corrected request
          const responseText = "I've cleared the previous workflow. Please tell me what you'd like to change.";
          appendMessage(sessionId, { role: "assistant", content: responseText });
          res.write(`data: ${JSON.stringify({ content: responseText, done: true })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }
        
        if (confirmationPattern.test(latestUserText.trim())) {
          console.log("✅ User confirmed batch execution");
          await storage.clearPendingConfirmation(sessionId);

          try {
            const { bubbleRunBatch } = await import("./bubble");
            const result = await bubbleRunBatch({
              business_types: pendingConfirmation.business_types,
              roles: pendingConfirmation.roles,
              delay_ms: pendingConfirmation.delay_ms,
              number_countiestosearch: pendingConfirmation.number_countiestosearch,
              smarlead_id: pendingConfirmation.smarlead_id,
              counties: pendingConfirmation.counties,  // Pass exact counties from preview
              country: pendingConfirmation.country  // Pass country/state
            });

            const successCount = result.results.filter(r => r.ok).length;
            const totalCount = result.results.length;
            const country = pendingConfirmation.country || 'UK';
            
            let responseText = `✅ Bubble batch workflow completed: ${successCount}/${totalCount} successful\n\n`;
            responseText += `Results:\n`;
            for (const r of result.results) {
              const countyInfo = r.county ? ` [${r.county}, ${country}]` : '';
              responseText += `- ${r.role} @ ${r.business_type}${countyInfo}: ${r.ok ? '✅' : '❌'} (${r.status})\n`;
            }

            appendMessage(sessionId, { role: "assistant", content: responseText });
            
            res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } catch (error: any) {
            console.error("❌ Bubble batch execution error:", error.message);
            const errorMsg = `Sorry, I couldn't trigger the Bubble workflow: ${error.message}`;
            appendMessage(sessionId, { role: "assistant", content: errorMsg });
            res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          }
        } else if (cancellationPattern.test(latestUserText.trim())) {
          console.log("❌ User cancelled batch execution");
          await storage.clearPendingConfirmation(sessionId);
          
          const responseText = "❌ Batch workflow cancelled.";
          appendMessage(sessionId, { role: "assistant", content: responseText });
          res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // DISABLED: Old bubble batch detection - now handled by Chat Completions API tool calling
      // This prevents duplicate execution without confirmation
      const isBubbleBatchRequest = false; // Always false - tool calling handles this now

      if (isBubbleBatchRequest) {
        console.log("🔵 Detected Bubble batch request - extracting parameters...");
        
        try {
          // Use GPT to extract parameters from natural language
          const extractionPrompt = [
            {
              role: "system" as const,
              content: "Extract business_types, roles, delay_ms, number_countiestosearch, location, and smarlead_id from the user's request. Return a JSON object with these fields. business_types is required (array of strings). roles is optional (array, default ['Head of Sales']). delay_ms is optional (number, default 4000). number_countiestosearch is optional (number, default 1). location is optional (string, can be 'UK', 'Texas', or other US states). smarlead_id is optional (string). Parse time units: 's' or 'sec' = multiply by 1000, 'ms' = use as-is. Extract county/region numbers from phrases like '5 counties', '10 regions', etc. Extract location from phrases like 'in Texas', 'in UK', 'in California', etc."
            },
            {
              role: "user" as const,
              content: `Extract parameters from: "${latestUserText}"\n\nExamples:\n- "Run Head of Sales for dentistry supplies, vet supplies; 4s delay" → {"business_types":["dentistry supplies","vet supplies"],"roles":["Head of Sales"],"delay_ms":4000}\n- "Trigger Director for farm shops, cheese makers; 3000ms delay, 5 counties, smarlead 12345" → {"business_types":["farm shops","cheese makers"],"roles":["Director"],"delay_ms":3000,"number_countiestosearch":5,"smarlead_id":"12345"}\n- "Run for dentist supplies in 2 counties in Texas, smarlead abc123" → {"business_types":["dentist supplies"],"number_countiestosearch":2,"location":"Texas","smarlead_id":"abc123"}\n- "Run for dental supplies in 3 counties in California" → {"business_types":["dental supplies"],"number_countiestosearch":3,"location":"California"}\n\nExtract now:`
            }
          ];

          const extractionResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: extractionPrompt,
            response_format: { type: "json_object" },
          });

          const params = JSON.parse(extractionResp.choices[0]?.message?.content || "{}");
          console.log("📋 Extracted params:", params);

          if (params.business_types && Array.isArray(params.business_types) && params.business_types.length > 0) {
            // Determine location and load appropriate region data
            const location = params.location || 'UK';
            let selectedCounties: string[] = [];
            
            const numCounties = params.number_countiestosearch || 1;
            
            // Normalize country code using ISO mapping (Texas → US, UK → GB, etc.)
            const { getRegionCode } = await import("./regions");
            const countryCode = getRegionCode(location);
            
            if (location.toLowerCase() === 'texas') {
              const { getRegions } = await import("./regions");
              const texasCountiesResult = await getRegions('US', 'county', 'Texas');
              selectedCounties = texasCountiesResult.regions.slice(0, numCounties).map(r => r.name);
            } else {
              // Default to UK
              const ukCountiesData = await import("./data/uk_counties.json");
              const ukCounties = ukCountiesData.default;
              selectedCounties = ukCounties.slice(0, numCounties).map((c: any) => c.name);
            }

            console.log(`🗺️ Auto-selected ${numCounties} ${countryCode} counties:`, selectedCounties);

            // Apply defaults now - what user sees is what gets executed
            const roles = params.roles || ['Head of Sales'];
            const delayMs = params.delay_ms || 4000;
            const smarleadId = params.smarlead_id || '2354720';

            // Store pending confirmation WITH COMPUTED DEFAULTS
            await storage.setPendingConfirmation(sessionId, {
              business_types: params.business_types,
              roles: roles,  // Store computed default
              delay_ms: delayMs,  // Store computed default
              number_countiestosearch: numCounties,  // Store computed value
              smarlead_id: smarleadId,  // Store computed default
              counties: selectedCounties,  // Store auto-selected counties
              country: countryCode,  // Store country/state
              timestamp: new Date().toISOString()
            });

            // Build preview message showing EXACTLY what will be executed
            let previewText = `📋 **Batch Workflow Preview**\n\n`;
            previewText += `I'll make **${selectedCounties.length} API call(s)** to the autogen endpoint:\n\n`;
            
            for (const county of selectedCounties) {
              for (const businessType of params.business_types) {
                for (const role of roles) {
                  previewText += `• ${role} @ ${businessType} in **${county}, ${countryCode}**\n`;
                }
              }
            }
            
            previewText += `\n**Parameters:**\n`;
            previewText += `- Delay: ${delayMs}ms\n`;
            previewText += `- Smarlead ID: ${smarleadId}\n`;
            previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;

            appendMessage(sessionId, { role: "assistant", content: previewText });
            res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } else {
            console.log("⚠️ Could not extract valid business_types, falling back to regular chat");
          }
        } catch (error: any) {
          console.error("❌ Bubble batch extraction error:", error.message);
          const errorMsg = `Sorry, I couldn't parse your request: ${error.message}`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // CHECK FOR COUNTRY CHANGE COMMAND
      const countryChangePattern = /\b(set|change|use|switch)\s+(country|location|region)?\s*(to|as)?\s+([a-zA-Z\s]+)/i;
      const countryMatch = latestUserText.match(countryChangePattern);
      
      if (countryMatch) {
        // Extract country name from command
        const countryInput = countryMatch[4].trim();
        
        // Try to find matching country
        const { loadCountryCodes, fillSlots } = await import("./slotExtractor");
        loadCountryCodes(); // Ensure country codes are loaded
        
        // Use fillSlots to parse the country
        const testSlots = fillSlots(`test ${countryInput}`);
        
        if (testSlots.country_code && testSlots.country) {
          // Valid country found - save preference
          await storage.setCountryPreference(sessionId, testSlots.country_code, testSlots.country);
          
          const confirmMsg = `✅ Default country changed to **${testSlots.country} (${testSlots.country_code})**`;
          appendMessage(sessionId, { role: "assistant", content: confirmMsg });
          res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        } else {
          // Country not recognized
          const errorMsg = `Sorry, I couldn't recognize "${countryInput}" as a valid country. Please try again with a country name like "United Kingdom", "India", or "Vietnam".`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // DETERMINISTIC SLOT EXTRACTION - Extract slots BEFORE calling OpenAI
      // Trigger slot extraction for:
      // 1. Explicit search verbs (find/search/look/get/show/fetch)
      // 2. Noun + location patterns (e.g., "dentists new york", "pubs in kendal")
      // 3. Ongoing slot collection (prevSlotContext exists)
      const searchPattern = /\b(find|search|look for|get|show|fetch)\b/i;
      const nounLocationPattern = /\b(ceo|director|manager|owner|head|dentists?|pubs?|restaurants?|makers?|shops?|stores?|bars?|cafes?|hotels?)\b/i;
      const hasLocationWords = /\b(in|at|near|around|across)\b/i;
      
      const isSearchRequest = searchPattern.test(latestUserText) || 
                             (nounLocationPattern.test(latestUserText) && !latestUserText.match(/^(hi|hello|thanks|yes|no|ok)\b/i));
      
      // Check for previous slot context (in case we're collecting missing info)
      const prevSlotContext = await storage.getSlotContext(sessionId);
      
      if (isSearchRequest || prevSlotContext) {
        console.log("🎯 Running slot extractor..." + (prevSlotContext ? " (with context)" : ""));
        
        const { fillSlots, handleClarification } = await import("./slotExtractor");
        
        // Extract slots from message (or handle clarification)
        let slots;
        if (prevSlotContext && prevSlotContext.awaiting_country_for) {
          // This is a clarification response for country
          slots = handleClarification(prevSlotContext as any, latestUserText);
        } else if (prevSlotContext && (prevSlotContext as any).awaiting_position) {
          // This is a response for position - extract position from user's answer
          const positions = ['head of sales', 'ceo', 'director', 'owner', 'manager', 'cfo', 'cto', 'coo', 'founder', 'vp', 'president'];
          let extractedPosition = latestUserText.toLowerCase().trim();
          
          // Try to match known positions
          for (const pos of positions) {
            if (extractedPosition.includes(pos)) {
              extractedPosition = pos;
              break;
            }
          }
          
          // Combine with previous slots
          slots = {
            ...prevSlotContext,
            position: extractedPosition,
            awaiting_position: undefined
          };
        } else {
          // Fresh extraction
          slots = fillSlots(latestUserText, prevSlotContext as any);
        }
        
        // USE DEFAULT COUNTRY if no country detected
        if (!slots.country_code && slots.query) {
          const defaultCountry = await storage.getCountryPreference(sessionId);
          if (defaultCountry) {
            slots.country_code = defaultCountry.code;
            slots.country = defaultCountry.name;
            slots.granularity = slots.location ? 'city' : 'country';
            console.log(`📍 Using default country: ${defaultCountry.name} (${defaultCountry.code})`);
          }
        }
        
        if (slots.needs_clarification) {
          // Missing information - ask clarifying question and save slots
          const question = slots.question || "I need more information to help you.";
          console.log(`❓ Slot extractor asking: ${question}`);
          
          // Save slots for next turn
          await storage.setSlotContext(sessionId, { ...slots, awaiting_country_for: slots.location } as any);
          
          appendMessage(sessionId, { role: "assistant", content: question });
          res.write(`data: ${JSON.stringify({ content: question })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
        
        // Check if position is missing - ASK for it (don't default to CEO)
        if (!slots.position) {
          const posQuestion = "What company position are you targeting? (e.g., CEO, Head of Sales, Director, Manager)";
          console.log(`❓ Position missing, asking: ${posQuestion}`);
          
          // Save slots for next turn
          await storage.setSlotContext(sessionId, { ...slots, awaiting_position: true } as any);
          
          appendMessage(sessionId, { role: "assistant", content: posQuestion });
          res.write(`data: ${JSON.stringify({ content: posQuestion })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
        
        // All slots filled - clear context and DIRECTLY trigger workflow
        await storage.clearSlotContext(sessionId);
        console.log(`✅ Slots extracted:`, slots);
        console.log(`📍 Will search for: ${slots.query} (${slots.position}) in ${slots.location || slots.country} (${slots.country_code})`);
        
        // Build location string for Bubble - use country code only
        const locationForBubble = slots.location 
          ? `${slots.location}, ${slots.country_code}` 
          : (slots.country || 'Unknown');
        
        // Generate confirmation preview
        const roles = [slots.position.toUpperCase()]; // Position is required now
        
        const previewText = `📋 **Batch Workflow Preview**\n\n` +
          `I'll make **1 API call** to the autogen endpoint:\n\n` +
          `• ${roles[0]} @ ${slots.query} in **${locationForBubble} (${slots.country_code})**\n\n` +
          `**Parameters:**\n` +
          `- Delay: 4000ms\n` +
          `- Smarlead ID: 2354720\n\n` +
          `✅ Type **"yes"** to confirm or **"no"** to cancel`;
        
        // Store for confirmation
        await storage.setPendingConfirmation(sessionId, {
          business_types: [slots.query],
          roles,
          delay_ms: 4000,
          number_countiestosearch: 1,
          smarlead_id: '2354720',
          counties: [locationForBubble],
          country: slots.country_code || 'UNKNOWN',
          timestamp: new Date().toISOString()
        });
        
        appendMessage(sessionId, { role: "assistant", content: previewText });
        res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        return res.end();
      }

      // Prepare messages array with system prompt (DON'T mutate memoryMessages)
      const systemPrompt = {
        role: "system" as const,
        content: `You are Wyshbone AI, a global business discovery assistant. You help users discover businesses worldwide and trigger backend workflows.

HOW WYSHBONE WORKS:
When you help users search for business contacts, here's what happens:
- Wyshbone AI finds businesses matching the search criteria anywhere in the world
- For each business, it searches for emails associated with the company position you specify
- All found emails are ranked by how likely they are to match that position
- The most relevant emails are sent to Smartlead for outreach campaigns

CRITICAL VALIDATION RULES:
Before using bubble_run_batch tool, you MUST have ALL of these:
1. business_types (required) - what businesses to find
2. roles (required) - target job positions (CEO, Head of Sales, Director, Manager, etc.)
3. country (required) - location to search (NEVER GUESS - always ask if not provided)

If ANY field is missing, DO NOT call the tool. Instead, ask conversationally for the missing information.

WHEN ASKING FOR MISSING FIELDS:
- For business_types: Simply ask "What type of businesses are you looking for?"
- For roles/position: Ask "What company position are you targeting?" and explain: "Wyshbone AI will find and rank emails most likely to be associated with that position, then send them to Smartlead."
- For location: Ask "What location would you like to search in?"

LOCATION POLICY - NEVER GUESS:
- NEVER infer or guess locations (e.g., don't assume any country)
- If location is missing, ALWAYS ask: "What location would you like to search in?"
- Location must be explicitly stated by the user
- Support worldwide locations: UK, US, Canada, Australia, Vietnam, Thailand, India, Europe, Asia, Africa, Latin America, etc.

Tool Usage Guidelines:
- Extract business_types from request (e.g., "pubs", "dentists", "ice cream makers")
- Extract roles ONLY if explicitly mentioned - DO NOT assume or default
- Extract location ONLY if explicitly mentioned (e.g., "Chichester", "Texas", "Toronto", "Vietnam", "Hanoi")
- The system will auto-detect the country code for any worldwide location

Examples:
- "find pubs in Chichester for CEOs" → roles: ["CEO"], business_types: ["pubs"], country: "Chichester" ✅
- "find ice cream makers in Vietnam for CEOs" → roles: ["CEO"], business_types: ["ice cream makers"], country: "Vietnam" ✅
- "find pubs in Toronto" → MISSING ROLES - Ask: "What company position are you targeting? Wyshbone AI will find and rank emails most likely to be associated with that position, then send them to Smartlead." ❌
- "find CEOs for dentists" → MISSING LOCATION - Ask: "What location would you like to search in?" ❌
- "search Head of Sales for restaurants in Bangkok" → roles: ["Head of Sales"], business_types: ["restaurants"], country: "Bangkok" ✅

Be concise, practical, and action-oriented. Support business searches anywhere in the world.`
      };

      
      let chatMessages = [systemPrompt, ...memoryMessages];
      
      // If URLs detected, fetch and inject content WITHOUT mutating stored conversation
      if (useDirectFetch) {
        console.log(`🚀 Fast URL mode: Detected ${urls.length} URL(s) - using direct fetch`);
        
        try {
          // Fetch content from all URLs
          const urlContents = await Promise.all(
            urls.map(url => fetchUrlContent(url).catch(err => {
              console.warn(`⚠️ Failed to fetch ${url}: ${err.message}`);
              return `[Could not fetch ${url}: ${err.message}]`;
            }))
          );
          
          // Create a NEW messages array with URL content (don't mutate stored memory)
          const urlContentMessage = {
            role: "system" as const,
            content: `URL Content Retrieved:\n${urlContents.join('\n\n---\n\n')}\n\nPlease provide a helpful response based on the above URL content.`
          };
          chatMessages = [systemPrompt, ...memoryMessages, urlContentMessage];
          
        } catch (err: any) {
          console.error("❌ URL fetch error:", err.message);
          // Continue anyway without URL content
        }
      }
      
      // Define tools: bubble_run_batch function + web_search
      const bubbleTool = {
        type: "function" as const,
        function: {
          name: "bubble_run_batch",
          description: "Trigger Wyshbone backend workflows in batch for business types and roles",
          parameters: {
            type: "object",
            properties: {
              business_types: {
                type: "array",
                items: { type: "string" },
                description: "List of business types to search for (e.g., ['dentistry supplies', 'veterinary supplies'])"
              },
              roles: {
                type: "array",
                items: { type: "string" },
                description: "Roles to target (default: ['Head of Sales'])"
              },
              delay_ms: {
                type: "number",
                description: "Delay between workflow runs in milliseconds (default: 4000)"
              },
              number_countiestosearch: {
                type: "number",
                description: "Number of counties/regions to search (default: 1)"
              },
              smarlead_id: {
                type: "string",
                description: "Smarlead campaign ID (default: '2354720')"
              },
              counties: {
                type: "array",
                items: { type: "string" },
                description: "Specific counties to search (optional, auto-selected if not provided)"
              },
              country: {
                type: "string",
                description: "Country or region (e.g., 'UK', 'Texas', 'Ireland'). REQUIRED - never guess, always ask user if not provided."
              }
            },
            required: ["business_types", "country"]
          }
        }
      };

      // Note: Chat Completions API doesn't support web_search tool type (only 'function' and 'custom')
      // For now, only bubble_run_batch tool is available. Web search would need to be a separate function.
      const tools: any[] = [bubbleTool];

      console.log(`🌐 Calling Chat Completions API with function calling...`);
      
      try {
        // Call OpenAI Chat Completions API with streaming
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: chatMessages as any,
          tools,
          stream: true,
        });

        console.log("✅ Chat Completions API stream started");
        
        let toolCallBuffer = { name: "", arguments: "" };
        let isToolCall = false;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          
          // Handle tool calls
          if (delta.tool_calls) {
            isToolCall = true;
            const toolCall = delta.tool_calls[0];
            if (toolCall.function?.name) {
              toolCallBuffer.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCallBuffer.arguments += toolCall.function.arguments;
            }
          }
          // Handle content streaming
          else if (delta.content) {
            aiBuffer += delta.content;
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
            // @ts-ignore
            if (res.flush) res.flush();
          }
        }

        // Process tool call if detected
        if (isToolCall && toolCallBuffer.name === "bubble_run_batch") {
          console.log("🔧 Tool call detected:", toolCallBuffer.name);
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            const params = JSON.parse(toolCallBuffer.arguments);
            
            // VALIDATION: Check for required fields before proceeding
            const missingFields: string[] = [];
            
            if (!params.business_types || params.business_types.length === 0) {
              missingFields.push("business type");
            }
            if (!params.roles || params.roles.length === 0) {
              missingFields.push("target job role/position");
            }
            if (!params.country) {
              missingFields.push("location");
            }
            
            // If missing required fields, ask conversationally
            if (missingFields.length > 0) {
              let clarificationMsg = "";
              
              if (missingFields.includes("target job role/position")) {
                clarificationMsg = "What job role are you targeting for the pubs in Chichester? (e.g., CEO, Head of Sales, Director, Manager)";
              } else if (missingFields.includes("location")) {
                clarificationMsg = "Which location would you like to search in?";
              } else if (missingFields.includes("business type")) {
                clarificationMsg = "What type of businesses are you looking for?";
              }
              
              console.log(`❓ Missing required fields: ${missingFields.join(', ')}`);
              appendMessage(sessionId, { role: "assistant", content: clarificationMsg });
              res.write(`data: ${JSON.stringify({ content: clarificationMsg, done: true })}\n\n`);
              res.write(`data: [DONE]\n\n`);
              return res.end();
            }
            
            const { bubbleRunBatch } = await import("./bubble");
            const { getRegionCode } = await import("./regions");
            
            // Use provided values (no defaults for required fields)
            const roles = params.roles;
            const delayMs = params.delay_ms || 4000;
            const smarleadId = params.smarlead_id || '2354720';
            const rawCountry = params.country;
            const numCounties = params.number_countiestosearch || 1;
            
            // Normalize country code to ISO alpha-2 (US, GB, IE, AU, CA)
            const countryCode = getRegionCode(rawCountry);
            
            // Load regions if not provided based on country
            let selectedCounties = params.counties;
            let granularity = 'county'; // Default granularity
            let resolvedCountryCode = countryCode; // Use the resolved code
            let confidenceNote = ''; // For confidence-based prompting
            
            if (!selectedCounties) {
              const { getRegions } = await import("./regions");
              const { resolveLocation } = await import("./location-resolver");
              
              // Use intelligent location resolver (local hints + geocoding fallback)
              const resolved = await resolveLocation(rawCountry);
              
              console.log(`📍 Resolved location: ${rawCountry} → ${resolved.country_code}${resolved.region_filter ? `, ${resolved.region_filter}` : ''} (confidence: ${resolved.confidence}${resolved.source ? `, source: ${resolved.source}` : ''})`);
              
              // Update country code and granularity based on resolution
              resolvedCountryCode = resolved.country_code;
              granularity = resolved.granularity;
              
              // CRITICAL: If country is UNKNOWN, STOP and ask user for clarification
              if (resolvedCountryCode === 'UNKNOWN' || resolvedCountryCode.toUpperCase() === rawCountry.toUpperCase()) {
                console.log(`❌ Cannot determine country for "${rawCountry}" - asking user for clarification`);
                aiBuffer = `I couldn't determine which country "${rawCountry}" is in. Could you please specify the country? For example, you could say "UK" or "United States" or "India".`;
                res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
              } else if (resolved.confidence < 0.4) {
                // Low confidence: ask for clarification
                console.log(`❌ Low confidence (${resolved.confidence}) for "${rawCountry}" - asking user for clarification`);
                const locationDesc = resolved.region_filter 
                  ? `${resolved.region_filter}, ${resolved.country}` 
                  : resolved.country;
                aiBuffer = `I think "${rawCountry}" might be ${locationDesc}, but I'm not certain. Could you confirm or specify the exact country?`;
                res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
              } else {
                // Good confidence - proceed with workflow
                
                // Add note based on confidence level (per spec)
                if (resolved.confidence >= 0.7) {
                  // High confidence: proceed silently
                  confidenceNote = '';
                } else if (resolved.confidence >= 0.4) {
                  // Medium confidence: add assumption note
                  const locationDesc = resolved.region_filter 
                    ? `${resolved.region_filter}, ${resolved.country}` 
                    : resolved.country;
                  confidenceNote = `\n\n*Note: assuming ${locationDesc}*`;
                }
                
                // IMPORTANT: Determine if user specified a specific location or just a country
                // If only country specified (no city/region), use "-" as placeholder
                const isCountryOnly = resolved.country_code === resolved.country || 
                                     !resolved.region_filter ||
                                     resolved.region_filter.toLowerCase() === resolved.country.toLowerCase();
                
                let locationToUse: string;
                if (isCountryOnly) {
                  // Just a country specified (e.g., "India", "Scotland") → use user's input, not resolved country name
                  const capitalizedCountry = rawCountry.split(' ').map((word: string) => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ');
                  locationToUse = capitalizedCountry;
                  console.log(`✅ Country-only search: using user's input "${locationToUse}" for whole country ${resolvedCountryCode}`);
                } else {
                  // Specific city/region specified → use exact user input
                  const capitalizedLocation = rawCountry.split(' ').map((word: string) => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ');
                  locationToUse = capitalizedLocation;
                  console.log(`✅ Using user's exact location: "${locationToUse}" in ${resolvedCountryCode}`);
                }
                
                selectedCounties = [locationToUse];
                
                // Build preview and store pending confirmation (use ISO country code)
                await storage.setPendingConfirmation(sessionId, {
                  business_types: params.business_types,
                  roles,
                  delay_ms: delayMs,
                  number_countiestosearch: selectedCounties.length,
                  smarlead_id: smarleadId,
                  counties: selectedCounties,
                  country: resolvedCountryCode,  // Use resolved ISO alpha-2 code
                  timestamp: new Date().toISOString()
                });

                let previewText = `📋 **Batch Workflow Preview**\n\n`;
                previewText += `I'll make **${selectedCounties.length} API call(s)** to the autogen endpoint:\n\n`;
                
                for (const county of selectedCounties) {
                  for (const businessType of params.business_types) {
                    for (const role of roles) {
                      previewText += `• ${role} @ ${businessType} in **${county}, ${resolvedCountryCode}**\n`;  // Use resolved ISO code
                    }
                  }
                }
                
                previewText += `\n**Parameters:**\n`;
                previewText += `- Delay: ${delayMs}ms\n`;
                previewText += `- Smarlead ID: ${smarleadId}\n`;
                previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;
                
                // Append confidence note if present
                if (confidenceNote) {
                  previewText += confidenceNote;
                }

                aiBuffer = previewText;
                res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
              }
            } else {
              // Counties were provided, just build preview
              await storage.setPendingConfirmation(sessionId, {
                business_types: params.business_types,
                roles,
                delay_ms: delayMs,
                number_countiestosearch: selectedCounties.length,
                smarlead_id: smarleadId,
                counties: selectedCounties,
                country: resolvedCountryCode,
                timestamp: new Date().toISOString()
              });

              let previewText = `📋 **Batch Workflow Preview**\n\n`;
              previewText += `I'll make **${selectedCounties.length} API call(s)** to the autogen endpoint:\n\n`;
              
              for (const county of selectedCounties) {
                for (const businessType of params.business_types) {
                  for (const role of roles) {
                    previewText += `• ${role} @ ${businessType} in **${county}, ${resolvedCountryCode}**\n`;
                  }
                }
              }
              
              previewText += `\n**Parameters:**\n`;
              previewText += `- Delay: ${delayMs}ms\n`;
              previewText += `- Smarlead ID: ${smarleadId}\n`;
              previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;

              aiBuffer = previewText;
              res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
            }
            
          } catch (toolErr: any) {
            console.error("❌ Tool execution error:", toolErr.message);
            aiBuffer = `Error processing workflow: ${toolErr.message}`;
            res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
          }
        }
        
        if (!aiBuffer) {
          aiBuffer = "I apologize, but I couldn't generate a response.";
          res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
        }
        
      } catch (err: any) {
        console.error("❌ Chat Completions API error:", err.message);
        console.error("Error details:", JSON.stringify(err, null, 2));
        throw err;
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

        // Add Google Places results to cache with all fields
        if (placesResults.length > 0) {
          addVenuesToCache(
            sessionId,
            placesResults.map((v) => ({
              placeId: v.placeId,
              name: v.name,
              address: v.address,
              businessStatus: v.businessStatus,
              phone: v.phone,
              website: v.website,
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
          content: `Available venues to show (not yet served): ${JSON.stringify(availableVenues)}\n\nCreate a response using these venues. Format as json: {"query": "...", "verified": true, "results": [{placeId, name, address, businessStatus, phone, website}], "generated_at": "ISO timestamp"}\n\nIMPORTANT: Include ALL available fields (placeId, name, address, businessStatus, phone, website) for each venue in the results array. Do not omit any fields.`
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

  // =========================================
  // POST /api/tool/bubble_run_batch – Trigger Bubble workflows in batch
  // =========================================
  app.post("/api/tool/bubble_run_batch", async (req, res) => {
    try {
      const { bubbleRunBatchRequestSchema } = await import("@shared/schema");
      const validation = bubbleRunBatchRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const { bubbleRunBatch } = await import("./bubble");
      const result = await bubbleRunBatch(validation.data);

      res.json(result);
    } catch (error: any) {
      console.error("Bubble batch error:", error);
      res
        .status(500)
        .json({ error: "Failed to run Bubble batch", message: error.message });
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

  // ===========================
  // Region API Endpoints
  // ===========================
  
  // GET /api/regions/list
  app.get("/api/regions/list", async (req, res) => {
    try {
      const country = req.query.country as string;
      const granularity = req.query.granularity as string;
      const region_filter = req.query.region_filter as string | undefined;

      if (!country || !granularity) {
        return res.status(400).json({ 
          error: "country and granularity are required query parameters" 
        });
      }

      const { getRegions } = await import('./regions');
      const result = await getRegions(country, granularity, region_filter);

      return res.json(result);
    } catch (e: any) {
      console.error("regions/list error:", e);
      return res.status(500).json({ error: e.message || "Failed to fetch regions" });
    }
  });

  // GET /api/regions/debug/supported
  app.get("/api/regions/debug/supported", async (req, res) => {
    try {
      const { getSupportedDatasets } = await import('./regions');
      const datasets = await getSupportedDatasets();

      return res.json({
        datasets,
        total_datasets: Object.keys(datasets).length,
        total_regions: Object.values(datasets).reduce((sum, count) => sum + count, 0)
      });
    } catch (e: any) {
      console.error("regions/debug/supported error:", e);
      return res.status(500).json({ error: e.message || "Failed to get supported datasets" });
    }
  });

  // POST /api/regions/clear-cache
  app.post("/api/regions/clear-cache", async (req, res) => {
    try {
      const { clearRegionCache } = await import('./regions');
      const count = await clearRegionCache();

      return res.json({
        success: true,
        cleared_files: count,
        message: `Cleared ${count} cached region file(s)`
      });
    } catch (e: any) {
      console.error("regions/clear-cache error:", e);
      return res.status(500).json({ error: e.message || "Failed to clear cache" });
    }
  });

  // ===========================
  // Country Preference Routes
  // ===========================
  
  // GET /api/country/preference
  app.get("/api/country/preference", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const preference = await storage.getCountryPreference(sessionId);
      
      // Default to UK if no preference set
      if (!preference) {
        return res.json({ code: 'GB', name: 'United Kingdom' });
      }
      
      return res.json(preference);
    } catch (e: any) {
      console.error("country/preference GET error:", e);
      return res.status(500).json({ error: e.message || "Failed to get country preference" });
    }
  });
  
  // POST /api/country/preference
  app.post("/api/country/preference", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const { code, name } = req.body;
      
      if (!code || !name) {
        return res.status(400).json({ error: "code and name are required" });
      }
      
      await storage.setCountryPreference(sessionId, code, name);
      return res.json({ success: true, code, name });
    } catch (e: any) {
      console.error("country/preference POST error:", e);
      return res.status(500).json({ error: e.message || "Failed to set country preference" });
    }
  });

  // ===========================
  // POST /api/jobs/create
  // ===========================
  app.post("/api/jobs/create", async (req, res) => {
    try {
      const { jobCreateRequestSchema } = await import('@shared/schema');
      const validation = jobCreateRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }

      const { business_type, country, granularity, region_filter, userEmail } = validation.data;

      // Get regions
      const { getRegions } = await import('./regions');
      const regionsResult = await getRegions(country, granularity, region_filter);

      if (regionsResult.regions.length === 0) {
        return res.status(400).json({ 
          error: "No regions found matching the criteria" 
        });
      }

      // Create job
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();
      
      const job = {
        id: jobId,
        business_type,
        country,
        granularity,
        region_ids: regionsResult.regions.map(r => r.id),
        cursor: 0,
        processed: [],
        failed: [],
        status: "pending" as const,
        created_by_email: userEmail,
        created_at: now,
        updated_at: now,
      };

      const { storage } = await import('./storage');
      await storage.createJob(job);

      return res.json({
        jobId,
        total_regions: regionsResult.regions.length
      });
    } catch (e: any) {
      console.error("jobs/create error:", e);
      return res.status(500).json({ error: e.message || "Failed to create job" });
    }
  });

  // ===========================
  // POST /api/jobs/start
  // ===========================
  app.post("/api/jobs/start", async (req, res) => {
    try {
      const { jobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status === "done") {
        return res.status(400).json({ error: "Job is already completed" });
      }

      // Update job status to running
      await storage.updateJob(jobId, { status: "running" });

      // Start the background worker
      const { startJobWorker } = await import('./jobWorker');
      startJobWorker(jobId);

      return res.json({ ok: true, jobId, status: "running" });
    } catch (e: any) {
      console.error("jobs/start error:", e);
      return res.status(500).json({ error: e.message || "Failed to start job" });
    }
  });

  // ===========================
  // POST /api/jobs/stop
  // ===========================
  app.post("/api/jobs/stop", async (req, res) => {
    try {
      const { jobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Update job status to paused
      await storage.updateJob(jobId, { status: "paused" });

      // Stop the worker (it will check status and pause)
      const { stopJobWorker } = await import('./jobWorker');
      stopJobWorker(jobId);

      return res.json({ ok: true, jobId, status: "paused" });
    } catch (e: any) {
      console.error("jobs/stop error:", e);
      return res.status(500).json({ error: e.message || "Failed to stop job" });
    }
  });

  // ===========================
  // GET /api/jobs/status
  // ===========================
  app.get("/api/jobs/status", async (req, res) => {
    try {
      const { jobId } = req.query;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(String(jobId));
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get region name for the most recent processed region
      let recent_region: string | undefined;
      if (job.processed.length > 0) {
        const { getRegions } = await import('./regions');
        const regionsResult = await getRegions(job.country, job.granularity);
        const lastProcessed = job.processed[job.processed.length - 1];
        const region = regionsResult.regions.find(r => r.id === lastProcessed);
        recent_region = region?.name;
      }

      const percent = job.region_ids.length > 0 
        ? Math.round((job.processed.length / job.region_ids.length) * 100)
        : 0;

      return res.json({
        jobId: job.id,
        business_type: job.business_type,
        status: job.status,
        processed_count: job.processed.length,
        total: job.region_ids.length,
        percent,
        recent_region,
        failed: job.failed || [],
        created_at: job.created_at,
        updated_at: job.updated_at,
      });
    } catch (e: any) {
      console.error("jobs/status error:", e);
      return res.status(500).json({ error: e.message || "Failed to get job status" });
    }
  });

  // ===========================
  // GET /api/regions/list
  // ===========================
  app.get("/api/regions/list", async (req, res) => {
    try {
      const { country, granularity, region_filter } = req.query;

      if (!country || !granularity) {
        return res.status(400).json({ 
          error: "Missing required parameters: country and granularity" 
        });
      }

      if (country !== 'UK' && country !== 'US') {
        return res.status(400).json({ 
          error: "Invalid country. Must be 'UK' or 'US'" 
        });
      }

      if (!['county', 'borough', 'state'].includes(String(granularity))) {
        return res.status(400).json({ 
          error: "Invalid granularity. Must be 'county', 'borough', or 'state'" 
        });
      }

      const { getRegions } = await import('./regions');
      const regionsResult = await getRegions(
        country as string,
        granularity as string,
        region_filter as string | undefined
      );

      return res.json(regionsResult);
    } catch (e: any) {
      console.error("regions/list error:", e);
      return res.status(500).json({ error: e.message || "Failed to load regions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
