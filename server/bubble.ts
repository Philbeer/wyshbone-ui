import type { BubbleRunBatchRequest, BubbleRunBatchResponse } from "@shared/schema";
import { getRegions } from "./regions";

const BASE = process.env.BUBBLE_BASE_URL || "";
const SLUG = process.env.WORKFLOW_SLUG || "ai-big-wysh-front-end-now-backend";
const SLUG_AUTOGEN = "replit-triggered-wyshautogen";  // New autogen endpoint
const TOKEN = process.env.BUBBLE_TOKEN || "";
const GOOGLE_API_KEY_DEFAULT = process.env.GOOGLE_API_KEY_DEFAULT || "";
const RUN_DELAY_DEFAULT_MS = Number(process.env.RUN_DELAY_DEFAULT_MS || 4000);
const LOGIN_EMAIL = process.env.LOGIN_EMAIL || "";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "";

if (!BASE) {
  console.warn("⚠️ Set BUBBLE_BASE_URL in Secrets, e.g. https://wyshbone.bubbleapps.io/version-test");
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

// Generate a 20-character lowercase alphanumeric unique ID
function generateUniqueId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Payload for old endpoint (uses IDs)
function payloadForOldEndpoint(
  businessType: string, 
  role: string,
  numberCountiesToSearch?: number,
  smarleadId?: string
) {
  return {
    "Input Google Value": "",
    "Input API key": GOOGLE_API_KEY_DEFAULT,
    "Index_counter": 1,
    "Dynamic Location": "1757507977753x173405489735527500",
    "Dynamic Business Type": businessType,
    "Dynamic Country": "1737717013652x858387822128022500",
    "Schedule ID 2": smarleadId || "2354720",
    "Target Email Position": role || "Head of Sales",
    "number_countiestosearch": numberCountiesToSearch || 1,
    "login email": LOGIN_EMAIL,
    "login password": LOGIN_PASSWORD
  };
}

// Payload for autogen endpoint (uses text)
function payloadForAutogenEndpoint(
  businessType: string, 
  role: string,
  county: string,
  country: string,
  smarleadId?: string,
  userEmail?: string
) {
  return {
    "Input Google Value": "",
    "Input API key": GOOGLE_API_KEY_DEFAULT,
    "Index_counter": 1,
    "Dynamic Location": county,
    "Dynamic Business Type": businessType,
    "Dynamic Country": country,
    "Schedule ID 2": smarleadId || "2354720",
    "Target Email Position": role || "Head of Sales",
    "number_countiestosearch": 1,  // Always 1 for autogen
    "login email": userEmail || LOGIN_EMAIL, // Use current user's email or fallback to env
    "login password": LOGIN_PASSWORD,
    "replit_gen_uniqueid": generateUniqueId(),
    "call_source": "replit"
  };
}

// Call autogen endpoint with text values
async function callBubbleAutogen(
  businessType: string, 
  role: string,
  county: string,
  country: string,
  smarleadId?: string,
  userEmail?: string
) {
  if (!BASE) {
    throw new Error("BUBBLE_BASE_URL is not configured. Please set it in Replit Secrets.");
  }

  const url = `${BASE}/api/1.1/wf/${SLUG_AUTOGEN}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }

  const payload = payloadForAutogenEndpoint(businessType, role, county, country, smarleadId, userEmail);
  
  console.log(`🔄 Calling Bubble autogen workflow for: ${role} @ ${businessType} in ${county}, ${country}`);
  console.log(`📦 Autogen payload (STRICTLY 3 FIELDS):`, {
    "Dynamic Business Type": payload["Dynamic Business Type"],
    "Dynamic Location": payload["Dynamic Location"],
    "Dynamic Country": payload["Dynamic Country"]
  });
  console.log(`📦 Full payload:`, JSON.stringify(payload, null, 2));
  
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  
  const text = await resp.text();
  let data: any;
  try { 
    data = JSON.parse(text); 
  } catch { 
    data = { raw: text }; 
  }

  console.log(`${resp.ok ? '✅' : '❌'} Bubble autogen response (${resp.status}):`, 
    JSON.stringify(data).substring(0, 200));

  return { ok: resp.ok, status: resp.status, data };
}

export async function bubbleRunBatch(params: BubbleRunBatchRequest): Promise<BubbleRunBatchResponse> {
  const { business_types, roles, delay_ms, number_countiestosearch, smarlead_id, counties: explicitCounties, country: requestCountry, userEmail } = params;

  const bt = business_types.map(s => String(s).trim()).filter(Boolean);
  if (!bt.length) {
    throw new Error("business_types is required (non-empty).");
  }

  const rl = (roles && roles.length ? roles : ["Head of Sales"])
              .map(s => String(s).trim()).filter(Boolean);

  const wait = Math.max(0, delay_ms ?? RUN_DELAY_DEFAULT_MS);
  
  // Use ISO alpha-2 country code (already mapped by getRegionCode)
  // requestCountry is already ISO alpha-2: "US", "GB", "AU", "IE", "CA"
  const country = requestCountry || "GB";  // Default to GB (UK)

  // Use explicit counties if provided (from confirmation flow), otherwise auto-generate
  let counties: string[] = [];
  let countyCount = number_countiestosearch || 1;
  
  if (explicitCounties && explicitCounties.length > 0) {
    counties = explicitCounties;
    countyCount = counties.length;
    console.log(`📍 Using explicit counties from confirmation:`, counties);
  } else if (countyCount > 1) {
    const ukCountiesResult = await getRegions('UK', 'county');
    counties = ukCountiesResult.regions.slice(0, countyCount).map(r => r.name);
    console.log(`🗺️ Auto-selected ${counties.length} counties:`, counties);
  }

  const totalCalls = countyCount > 1 
    ? bt.length * rl.length * counties.length 
    : bt.length * rl.length;

  console.log(`🚀 Starting Bubble batch run:`, {
    business_types: bt,
    roles: rl,
    delay_ms: wait,
    number_countiestosearch: countyCount,
    counties: countyCount > 1 ? counties : ['N/A - single call mode'],
    country,
    smarlead_id: smarlead_id || "2354720 (default)",
    userEmail: userEmail || `${LOGIN_EMAIL} (fallback)`,
    total_calls: totalCalls
  });

  const results: BubbleRunBatchResponse['results'] = [];
  
  // If counties are auto-generated, use autogen endpoint
  if (countyCount > 1 && counties.length > 0) {
    for (const county of counties) {
      for (const role of rl) {
        for (const b of bt) {
          try {
            console.log(`📍 Calling autogen endpoint for county: ${county}`);
            const r = await callBubbleAutogen(b, role, county, country, smarlead_id, userEmail);
            results.push({ 
              business_type: b, 
              role, 
              ok: r.ok, 
              status: r.status,
              county
            });
            
            // Wait between calls (except for the last one)
            const isLast = county === counties[counties.length - 1] && 
                          role === rl[rl.length - 1] && 
                          b === bt[bt.length - 1];
            if (wait && !isLast) {
              await sleep(wait);
            }
          } catch (error: any) {
            console.error(`❌ Error calling Bubble autogen for ${role} @ ${b} in ${county}:`, error.message);
            results.push({ 
              business_type: b, 
              role, 
              ok: false, 
              status: 500,
              county
            });
          }
        }
      }
    }
  } else {
    // Single call mode - use explicit county if provided, otherwise default to Bedfordshire
    const singleCounty = (explicitCounties && explicitCounties.length > 0) 
      ? explicitCounties[0] 
      : "Bedfordshire";
    
    for (const role of rl) {
      for (const b of bt) {
        try {
          console.log(`🔄 Calling Bubble autogen workflow for: ${role} @ ${b} in ${singleCounty}, ${country}`);
          const r = await callBubbleAutogen(b, role, singleCounty, country, smarlead_id, userEmail);
          results.push({ 
            business_type: b, 
            role, 
            ok: r.ok, 
            status: r.status,
            county: singleCounty
          });
          
          // Wait between calls (except for the last one)
          if (wait && (role !== rl[rl.length - 1] || b !== bt[bt.length - 1])) {
            await sleep(wait);
          }
        } catch (error: any) {
          console.error(`❌ Error calling Bubble autogen for ${role} @ ${b}:`, error.message);
          results.push({ 
            business_type: b, 
            role, 
            ok: false, 
            status: 500,
            county: singleCounty
          });
        }
      }
    }
  }

  console.log(`✅ Bubble batch run completed: ${results.filter(r => r.ok).length}/${results.length} successful`);

  return { ok: true, results };
}
