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

/* ========== GOOGLE PLACES TEXT SEARCH (LITE) ========== */

export async function placesTextSearchLite(
  query: string,
  apiKey: string
): Promise<PlacesTextSearchResult[]> {
  const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const results: PlacesTextSearchResult[] = [];
  let pagetoken: string | undefined;

  // Fetch up to 3 pages (20 results per page = 60 total max)
  for (let i = 0; i < 3; i++) {
    const params: any = { query, key: apiKey, region: "uk" };
    if (pagetoken) {
      params.pagetoken = pagetoken;
    }

    const response = await axios.get(url, { params });
    const data = response.data;

    if (data?.results?.length) {
      results.push(
        ...data.results.map((x: any) => ({
          place_id: x.place_id,
          name: x.name || "",
          formatted_address: x.formatted_address || "",
        }))
      );
    }

    pagetoken = data.next_page_token;
    if (!pagetoken) break;

    // Wait 2 seconds before fetching next page (Google requirement)
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

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

  const prompt = `Write ONE short opener (<=18 words) for ${company}${
    domain ? ` (${domain})` : ""
  } in ${location}.
They work in "${query}". Reference a plausible buyer or use-case. UK tone. No flattery.`;

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
): Promise<boolean> {
  try {
    const payload = {
      prospectList: prospects,
      stepId: sequenceId,
      verifyProspects: false,
      conflictAction: "overwrite"
    };

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
    return response.status === 200 || response.status === 201;
  } catch (error: any) {
    console.error("❌ SalesHandy API Error:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Headers:", error.response?.headers);
    return false;
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
          item.domain = domain;

          // Rank emails by target role
          const ranked = rankContacts(targetRole, emails);

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
      "Custom Field 1": query,
      "Custom Field 2": location,
      "Custom Field 3": country,
      "Custom Field 4": item.personal_line || "",
    };

    prospectsToSend.push(prospectFields);
    itemsWithEmails.push(item);
  }

  // Send all prospects in one batch request
  if (prospectsToSend.length > 0) {
    try {
      const success = await salesHandyBatchImport(
        prospectsToSend,
        campaignId || salesHandyCampaignId,
        salesHandyToken
      );

      if (success) {
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
