/**
 * Batch Service - Google Places + Hunter.io + SalesHandy Pipeline
 * 
 * Reuses existing Bubble batch interaction pattern for cost-optimized contact discovery:
 * 1. Google Places New (Text Search) - get business names only (no Place Details)
 * 2. Hunter.io - find domain + list of emails for each business
 * 3. Rank emails by target position_type (Head of Sales, CEO, etc.)
 * 4. Verify best match via Hunter.io email verifier
 * 5. Push verified contacts to SalesHandy campaign with AI personal line
 */

import axios from "axios";
import PQueue from "p-queue";
import type { BatchJobItem } from "@shared/schema";

/* ========== INTERFACES ========== */

export interface PlacesTextSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  website?: string;
}

export interface HunterEmailContact {
  value?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  confidence?: number;
}

export interface HunterDomainSearchResult {
  domain: string;
  emails: HunterEmailContact[];
}

export interface HunterVerificationResult {
  status: string;
  email: string;
}

export interface SalesHandyProspect {
  name: string;
  email: string;
  company: string;
  website?: string;
  customFields?: {
    query?: string;
    location?: string;
    country?: string;
    personal_line?: string;
  };
}

/* ========== HELPER FUNCTIONS ========== */

/**
 * Extract domain from website URL
 * e.g. "https://www.example.com/path" -> "example.com"
 */
function extractDomain(websiteUrl: string): string {
  if (!websiteUrl) return "";
  
  try {
    const url = new URL(websiteUrl);
    // Remove 'www.' prefix if present
    return url.hostname.replace(/^www\./, "");
  } catch {
    // If URL parsing fails, try to clean the string manually
    return websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();
  }
}

/* ========== GOOGLE PLACES TEXT SEARCH (NEW API WITH FIELD MASK) ========== */

export async function placesTextSearchLite(
  query: string,
  apiKey: string
): Promise<PlacesTextSearchResult[]> {
  // Use NEW Places API with field mask to get website URLs directly
  const url = "https://places.googleapis.com/v1/places:searchText";
  const results: PlacesTextSearchResult[] = [];
  let pageToken: string | undefined;

  // Fetch up to 3 pages (20 results per page = 60 total max)
  for (let i = 0; i < 3; i++) {
    const body: any = { 
      textQuery: query,
      maxResultCount: 20,
      languageCode: "en",
      regionCode: "uk"
    };
    
    if (pageToken) {
      body.pageToken = pageToken;
    }

    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // CRITICAL: Only request name and website - no address needed for email outreach
        "X-Goog-FieldMask": "places.id,places.displayName.text,places.websiteUri,nextPageToken"
      }
    });
    
    const data = response.data;

    if (data?.places?.length) {
      results.push(
        ...data.places.map((x: any) => ({
          place_id: x.id,
          name: x.displayName?.text || "",
          formatted_address: x.formattedAddress || "",
          website: x.websiteUri || "",
        }))
      );
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;

    // Wait 2 seconds before fetching next page (Google requirement)
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`📍 Google Places found ${results.length} results, ${results.filter(r => r.website).length} with websites`);
  return results;
}

/* ========== HUNTER.IO DOMAIN SEARCH & EMAIL VERIFICATION ========== */

export async function hunterFindDomainAndEmails(
  company: string,
  country: string | undefined,
  apiKey: string
): Promise<HunterDomainSearchResult> {
  const url = "https://api.hunter.io/v2/domain-search";
  const params: any = { company, api_key: apiKey };
  if (country) {
    params.country = country;
  }

  const response = await axios.get(url, { params });
  const data = response.data?.data || {};

  return {
    domain: data.domain || "",
    emails: Array.isArray(data.emails) ? data.emails : [],
  };
}

export async function hunterVerifyEmail(
  email: string,
  apiKey: string
): Promise<HunterVerificationResult> {
  const url = "https://api.hunter.io/v2/email-verifier";
  const params = { email, api_key: apiKey };

  const response = await axios.get(url, { params });
  return response.data?.data || { status: "unknown", email };
}

/* ========== CONTACT RANKING ========== */

function scoreContact(targetRole: string, contact: HunterEmailContact): number {
  const role = targetRole.toLowerCase();
  const position = (contact.position || "").toLowerCase();
  const department = (contact.department || "").toLowerCase();
  const email = (contact.value || contact.email || "").toLowerCase();

  let score = 0;

  // Position matching
  if (position === role) score += 100;
  if (position.includes(role)) score += 60;

  // Department bonuses
  if (department.includes("sales")) score += 20;

  // Seniority indicators
  if (/(head|director|vp|chief|lead)/.test(position)) score += 18;
  if (/manager/.test(position)) score += 10;
  if (/(assistant|intern)/.test(position)) score -= 6;

  // Generic email penalty
  if (/^info@|^hello@|^sales@/.test(email)) score -= 8;

  // Confidence score from Hunter.io
  score += Math.round((contact.confidence || 0) / 10);

  return score;
}

export function rankContacts(
  targetRole: string,
  contacts: HunterEmailContact[] = []
): HunterEmailContact[] {
  return contacts
    .slice()
    .sort((a, b) => scoreContact(targetRole, b) - scoreContact(targetRole, a));
}

/* ========== AI PERSONAL LINE ========== */

export async function generatePersonalLine(params: {
  company: string;
  domain?: string;
  location: string;
  query: string;
  openaiKey: string;
}): Promise<string> {
  const { company, domain, location, query, openaiKey } = params;

  if (!openaiKey) return "";

  const prompt = `Write ONE conversational opener for ${company} in ${location} who work in "${query}".

Follow this exact pattern:
"I can see you are [observation about their specific business/industry] - are you looking to [relevant business benefit/question]?"

Examples:
- "I can see you are in the hospitality trade - are you looking to increase sales?"
- "I can see you are running a local pub - are you looking to attract more customers?"
- "I can see you are in the dental practice space - are you looking to grow your patient base?"

Keep it under 20 words. Natural UK tone. Make it specific to "${query}".`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 60,
      },
      {
        headers: { Authorization: `Bearer ${openaiKey}` },
      }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("Failed to generate personal line:", error);
    return "";
  }
}

/* ========== SALES HANDY ========== */

export async function salesHandyBatchImport(
  prospects: any[],
  sequenceId: string,
  apiToken: string,
  baseUrl: string = "https://open-api.saleshandy.com"
): Promise<{ success: boolean; requestId?: string }> {
  try {
    const payload = {
      prospectList: prospects,
      stepId: sequenceId,
      verifyProspects: false,
      conflictAction: "overwrite"
    };

    console.log(`📤 Sending to SalesHandy: stepId="${sequenceId}", prospects=${prospects.length}`);
    console.log(`📦 Sample prospect:`, JSON.stringify(prospects[0], null, 2));

    const response = await axios.post(
      `${baseUrl}/v1/sequences/prospects/import-with-field-name`,
      payload,
      {
        headers: {
          'x-api-key': apiToken,
          'Content-Type': 'application/json'
        },
      }
    );

    console.log("✅ SalesHandy batch import response:", response.data);
    const requestId = response.data?.payload?.requestId;
    return { 
      success: response.status === 200 || response.status === 201,
      requestId 
    };
  } catch (error: any) {
    console.error("❌ SalesHandy API Error:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Headers:", error.response?.headers);
    return { success: false };
  }
}

export async function salesHandyCheckImportStatus(
  requestId: string,
  apiToken: string,
  baseUrl: string = "https://open-api.saleshandy.com"
): Promise<any> {
  try {
    const response = await axios.get(
      `${baseUrl}/v1/prospects/import-status/${requestId}`,
      {
        headers: {
          'x-api-key': apiToken,
          'Content-Type': 'application/json'
        },
      }
    );

    console.log(`📊 Import Status for ${requestId}:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error(`❌ Failed to check import status for ${requestId}:`, error.response?.data || error.message);
    return null;
  }
}

export async function salesHandyAddToCampaign(
  prospectId: string,
  campaignId: string,
  apiToken: string,
  senderId?: string,
  baseUrl: string = "https://open-api.saleshandy.com"
): Promise<boolean> {
  try {
    const payload: any = { prospectId };
    if (senderId) {
      payload.senderId = senderId;
    }

    await axios.post(
      `${baseUrl}/api/v1/sequences/${campaignId}/prospects`,
      payload,
      {
        headers: {
          'x-api-key': apiToken
        },
      }
    );

    return true;
  } catch (error) {
    console.error("Failed to add to campaign:", error);
    return false;
  }
}

/* ========== UTILITY ========== */

export function guessFirstName(email: string): string {
  const local = email.split("@")[0];
  const match = local.match(/^([a-z]+)/i);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : "";
}

/* ========== MAIN BATCH PIPELINE ========== */

export async function executeBatchJob(params: {
  query: string;
  location: string;
  country: string;
  targetRole: string;
  limit: number;
  personalize: boolean;
  campaignId?: string;
  googleApiKey: string;
  hunterApiKey: string;
  salesHandyToken: string;
  salesHandyCampaignId: string;
  salesHandySenderId?: string;
  openaiKey?: string;
}): Promise<{
  items: BatchJobItem[];
  created: BatchJobItem[];
  skipped: BatchJobItem[];
}> {
  const {
    query,
    location,
    country,
    targetRole,
    limit,
    personalize,
    campaignId,
    googleApiKey,
    hunterApiKey,
    salesHandyToken,
    salesHandyCampaignId,
    salesHandySenderId,
    openaiKey,
  } = params;

  // Step 1: Get business names from Google Places
  const searchQuery = `${query} in ${location} ${country}`;
  const rawResults = await placesTextSearchLite(searchQuery, googleApiKey);
  const items: BatchJobItem[] = rawResults
    .slice(0, limit)
    .map((result) => ({
      place_id: result.place_id,
      name: result.name,
      address: result.formatted_address,
      domain: result.website ? extractDomain(result.website) : undefined,
    }));

  // Step 2: Generate AI personal lines (if enabled)
  if (personalize && openaiKey) {
    const personalLineQueue = new PQueue({ concurrency: 4 });
    await Promise.all(
      items.map((item) =>
        personalLineQueue.add(async () => {
          item.personal_line = await generatePersonalLine({
            company: item.name,
            domain: item.domain,
            location,
            query,
            openaiKey,
          });
        })
      )
    );
  }

  // Step 3: Find domain + emails + verify for each business
  const hunterQueue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 9 });
  await Promise.all(
    items.map((item) =>
      hunterQueue.add(async () => {
        try {
          // Find domain and emails
          const { domain, emails } = await hunterFindDomainAndEmails(
            item.name,
            country,
            hunterApiKey
          );
          
          // Only use Hunter.io domain if Google Places didn't provide one
          if (!item.domain && domain) {
            item.domain = domain;
          }

          // Rank emails by target role
          const ranked = rankContacts(targetRole, emails);

          // Save all Hunter.io contacts with their scores for UI display
          item.hunter_contacts = ranked.map(contact => ({
            email: contact.email || contact.value || "",
            first_name: contact.first_name,
            last_name: contact.last_name,
            position: contact.position,
            department: contact.department,
            confidence: contact.confidence,
            score: scoreContact(targetRole, contact), // Calculate and save score
          })).filter(c => c.email); // Only include contacts with emails

          // Try to verify emails until we find a valid one
          for (const contact of ranked) {
            const email = contact.email || contact.value;
            if (!email) continue;

            const verification = await hunterVerifyEmail(email, hunterApiKey);
            if (
              verification.status &&
              verification.status.toLowerCase() === "valid"
            ) {
              item.selected_email = email;
              item.selected_status = "valid";
              item.first_name = contact.first_name || guessFirstName(email);
              item.last_name = contact.last_name || "";
              item.position = contact.position || "";
              break;
            }
          }
        } catch (error) {
          console.error(`Failed to process ${item.name}:`, error);
        }
      })
    )
  );

  // Step 4: Send verified contacts to SalesHandy in one batch
  const created: BatchJobItem[] = [];
  const skipped: BatchJobItem[] = [];

  // Collect all prospects with verified emails
  const prospectsToSend: any[] = [];
  const itemsWithEmails: BatchJobItem[] = [];

  for (const item of items) {
    if (!item.selected_email) {
      skipped.push(item);
      continue;
    }

    const prospectFields: any = {
      Email: item.selected_email,
      "First Name": item.first_name || guessFirstName(item.selected_email),
      "Last Name": item.last_name || "",
      Company: item.name,
      Website: item.domain ? `https://${item.domain}` : "",
      "Personal Line": item.personal_line || "", // AI-generated custom field
    };

    prospectsToSend.push(prospectFields);
    itemsWithEmails.push(item);
  }

  // Send all prospects in one batch request
  if (prospectsToSend.length > 0) {
    try {
      const result = await salesHandyBatchImport(
        prospectsToSend,
        campaignId || salesHandyCampaignId,
        salesHandyToken
      );

      if (result.success && result.requestId) {
        console.log(`🔄 Batch import initiated. Request ID: ${result.requestId}`);
        console.log(`⏳ Waiting for SalesHandy to process ${itemsWithEmails.length} prospects...`);
        
        // Poll for import status (with timeout after 30 seconds)
        let attempts = 0;
        const maxAttempts = 10;
        let importStatus: any = null;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between polls
          importStatus = await salesHandyCheckImportStatus(result.requestId, salesHandyToken);
          
          // Handle both API response formats: { status: 'completed' } or { isCompleted: true }
          const isComplete = importStatus?.payload?.status === 'completed' || importStatus?.payload?.isCompleted === true;
          const isFailed = importStatus?.payload?.status === 'failed';
          
          if (isComplete) {
            const accepted = importStatus.payload.successCount || importStatus.payload.acceptedCount || 0;
            const rejected = importStatus.payload.failureCount || importStatus.payload.rejectedCount || 0;
            
            // If there's a failedProspectsURL but no counts, assume all failed
            if (importStatus.payload.failedProspectsURL && accepted === 0 && rejected === 0) {
              console.log(`❌ All ${itemsWithEmails.length} prospects rejected by SalesHandy`);
              console.log(`📄 Error report: ${importStatus.payload.failedProspectsURL}`);
              skipped.push(...itemsWithEmails);
              break;
            }
            
            console.log(`✅ Import completed: ${accepted} accepted, ${rejected} rejected`);
            
            if (rejected > 0 && importStatus.payload.failures) {
              console.log(`❌ Rejection reasons:`, JSON.stringify(importStatus.payload.failures.slice(0, 5), null, 2));
            }
            
            // Only mark as created the ones that were actually accepted
            const acceptedItems = itemsWithEmails.slice(0, accepted);
            const rejectedItems = itemsWithEmails.slice(accepted);
            
            created.push(...acceptedItems);
            skipped.push(...rejectedItems);
            break;
          } else if (isFailed) {
            console.log(`❌ Import failed:`, importStatus.payload);
            skipped.push(...itemsWithEmails);
            break;
          }
          
          attempts++;
          console.log(`⏳ Still processing... (attempt ${attempts}/${maxAttempts})`);
        }

        if (attempts >= maxAttempts) {
          console.log(`⚠️ Import status check timed out. Check SalesHandy manually for request ${result.requestId}`);
          // Optimistically assume success but warn the user
          created.push(...itemsWithEmails);
        }

      } else if (result.success) {
        // Old behavior: no requestId returned
        created.push(...itemsWithEmails);
        console.log(`✅ Successfully sent ${itemsWithEmails.length} prospects to SalesHandy in batch`);
      } else {
        skipped.push(...itemsWithEmails);
        console.log(`❌ Failed to send batch to SalesHandy`);
      }
    } catch (error) {
      console.error(`Failed to send batch to SalesHandy:`, error);
      skipped.push(...itemsWithEmails);
    }
  }

  return { items, created, skipped };
}
