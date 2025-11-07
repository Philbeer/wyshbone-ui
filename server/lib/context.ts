import type { User } from "@shared/schema";

export interface SessionContext {
  hasProfile: boolean;
  companyName?: string;
  companyDomain?: string;
  inferredIndustry?: string;
  primaryObjective?: string;
  roleHint?: string;
  confidence: number;
}

export function buildSessionContext(user: User | null): SessionContext {
  if (!user) {
    return { hasProfile: false, confidence: 0 };
  }

  const inferredIndustry =
    user.inferredIndustry ??
    inferIndustryFromDomain(user.companyDomain) ??
    inferIndustryFromName(user.companyName);

  const confidence = inferredIndustry ? 70 : 30;

  return {
    hasProfile: !!(user.companyName || user.companyDomain),
    companyName: user.companyName ?? undefined,
    companyDomain: user.companyDomain ?? undefined,
    inferredIndustry,
    primaryObjective: user.primaryObjective ?? undefined,
    roleHint: user.roleHint ?? undefined,
    confidence,
  };
}

// Lightweight heuristics for industry inference
// In production, this could be enhanced with external enrichment services
function inferIndustryFromDomain(domain: string | null | undefined): string | undefined {
  if (!domain) return undefined;
  const d = domain.toLowerCase();
  
  if (d.includes("brew") || d.includes("ale") || d.includes("beer")) return "Brewery";
  if (d.includes("charity") || d.includes("cancer") || d.includes("ngo") || d.includes("foundation")) return "Charity";
  if (d.includes("coffee") || d.includes("roast")) return "Coffee Roaster";
  if (d.includes("logistics") || d.includes("freight") || d.includes("shipping")) return "Logistics";
  if (d.includes("restaurant") || d.includes("cafe") || d.includes("bakery")) return "Food & Beverage";
  if (d.includes("tech") || d.includes("software") || d.includes("saas")) return "Technology";
  if (d.includes("retail") || d.includes("shop") || d.includes("store")) return "Retail";
  
  return undefined;
}

function inferIndustryFromName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  
  if (n.includes("brew") || n.includes("ale") || n.includes("beer")) return "Brewery";
  if (n.includes("charity") || n.includes("foundation") || n.includes("trust")) return "Charity";
  if (n.includes("coffee") || n.includes("roast")) return "Coffee Roaster";
  if (n.includes("logistics") || n.includes("freight")) return "Logistics";
  if (n.includes("restaurant") || n.includes("cafe") || n.includes("bakery")) return "Food & Beverage";
  if (n.includes("tech") || n.includes("software")) return "Technology";
  if (n.includes("retail") || n.includes("shop") || n.includes("store")) return "Retail";
  
  return undefined;
}

// Generate personalized opening message based on context
export function generatePersonalizedOpening(ctx: SessionContext): string {
  if (!ctx.hasProfile) {
    return "I can personalize if you share your company or website (optional). Want to skip and start with a generic search?";
  }

  const company = ctx.companyName || ctx.companyDomain || "your organization";
  const industry = ctx.inferredIndustry;

  // Confidence-based framing
  const confidencePhrase = ctx.confidence < 60 
    ? `It looks like you might be with ${company}. ` 
    : `Great to meet you. I see you're with ${company}. `;

  if (industry === "Brewery") {
    return `${confidencePhrase}Want me to focus on brewery growth? Should I start by finding pubs buying cask, or bottle shops taking cans? (I can spin up a quick list now.)`;
  }
  
  if (industry === "Charity") {
    return `${confidencePhrase}For ${company}, should I begin with potential corporate partners, local fundraising events, or donor research?`;
  }
  
  if (industry === "Coffee Roaster") {
    return `${confidencePhrase}Should I focus on finding cafes for wholesale partnerships, or retail shops carrying specialty coffee?`;
  }
  
  if (industry === "Logistics") {
    return `${confidencePhrase}Want me to find potential clients needing freight services, or suppliers to partner with?`;
  }
  
  if (industry === "Food & Beverage") {
    return `${confidencePhrase}Should I help you find suppliers, wholesale partners, or potential retail locations?`;
  }
  
  if (industry === "Technology") {
    return `${confidencePhrase}Want me to focus on finding potential clients, partners, or investors?`;
  }
  
  if (industry === "Retail") {
    return `${confidencePhrase}Should I help you find suppliers, wholesale partners, or potential locations for expansion?`;
  }

  // Generic fallback
  return `${confidencePhrase}Shall I tailor results for ${company}? What's the main thing you want to achieve today? (I can also suggest a couple of quick starting points.)`;
}

// Update user's inferred industry in the database
export async function updateInferredIndustry(user: User): Promise<string | null> {
  const inferredIndustry =
    inferIndustryFromDomain(user.companyDomain) ??
    inferIndustryFromName(user.companyName);
  
  return inferredIndustry ?? null;
}
