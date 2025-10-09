import type { BubbleRunBatchRequest, BubbleRunBatchResponse } from "@shared/schema";

const BASE = process.env.BUBBLE_BASE_URL || "";
const SLUG = process.env.WORKFLOW_SLUG || "ai-big-wysh-front-end-now-backend";
const TOKEN = process.env.BUBBLE_TOKEN || "";
const GOOGLE_API_KEY_DEFAULT = process.env.GOOGLE_API_KEY_DEFAULT || "";
const RUN_DELAY_DEFAULT_MS = Number(process.env.RUN_DELAY_DEFAULT_MS || 4000);

if (!BASE) {
  console.warn("⚠️ Set BUBBLE_BASE_URL in Secrets, e.g. https://wyshbone.bubbleapps.io/version-test");
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

function payloadFor(businessType: string, role: string) {
  // Keep keys EXACTLY as Bubble expects (including spaces)
  return {
    "Input Google Value": "",
    "Input API key": GOOGLE_API_KEY_DEFAULT,
    "Index_counter": 1,
    "Dynamic Location": "Greater London",
    "Dynamic Business Type": businessType,
    "Dynamic Country Countries": "United Kingdom",
    "Schedule ID 2": "2354720",
    "Target Email Position": role || "Head of Sales"
  };
}

async function callBubbleOnce(businessType: string, role: string) {
  if (!BASE) {
    throw new Error("BUBBLE_BASE_URL is not configured. Please set it in Replit Secrets.");
  }

  const url = `${BASE}/api/1.1/wf/${SLUG}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }

  const payload = payloadFor(businessType, role);
  
  console.log(`🔄 Calling Bubble workflow for: ${role} @ ${businessType}`);
  
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

  console.log(`${resp.ok ? '✅' : '❌'} Bubble response (${resp.status}):`, 
    JSON.stringify(data).substring(0, 200));

  return { ok: resp.ok, status: resp.status, data };
}

export async function bubbleRunBatch(params: BubbleRunBatchRequest): Promise<BubbleRunBatchResponse> {
  const { business_types, roles, delay_ms } = params;

  const bt = business_types.map(s => String(s).trim()).filter(Boolean);
  if (!bt.length) {
    throw new Error("business_types is required (non-empty).");
  }

  const rl = (roles && roles.length ? roles : ["Head of Sales"])
              .map(s => String(s).trim()).filter(Boolean);

  const wait = Math.max(0, delay_ms ?? RUN_DELAY_DEFAULT_MS);

  console.log(`🚀 Starting Bubble batch run:`, {
    business_types: bt,
    roles: rl,
    delay_ms: wait,
    total_calls: bt.length * rl.length
  });

  const results: BubbleRunBatchResponse['results'] = [];
  
  for (const role of rl) {
    for (const b of bt) {
      try {
        const r = await callBubbleOnce(b, role);
        results.push({ 
          business_type: b, 
          role, 
          ok: r.ok, 
          status: r.status 
        });
        
        // Wait between calls (except for the last one)
        if (wait && (role !== rl[rl.length - 1] || b !== bt[bt.length - 1])) {
          await sleep(wait);
        }
      } catch (error: any) {
        console.error(`❌ Error calling Bubble for ${role} @ ${b}:`, error.message);
        results.push({ 
          business_type: b, 
          role, 
          ok: false, 
          status: 500 
        });
      }
    }
  }

  console.log(`✅ Bubble batch run completed: ${results.filter(r => r.ok).length}/${results.length} successful`);

  return { ok: true, results };
}
