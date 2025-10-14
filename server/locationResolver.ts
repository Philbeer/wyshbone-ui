import { neon } from "@neondatabase/serverless";

export type LocationCheck = {
  action: "use_default" | "auto_switch" | "ask_user" | "no_match";
  chosenCountry?: string;
  candidates?: string[];
  note?: string;
};

const UK_SYNONYMS = new Set([
  "united kingdom","uk","great britain","gb","england","scotland","wales","northern ireland"
]);

// ISO code to full country name mapping
const ISO_TO_COUNTRY: Record<string, string> = {
  "fr": "france",
  "us": "united states",
  "gb": "united kingdom",
  "uk": "united kingdom",
  "de": "germany",
  "it": "italy",
  "es": "spain",
  "ca": "canada",
  "au": "australia",
  "nz": "new zealand",
  "jp": "japan",
  "cn": "china",
  "in": "india",
  "br": "brazil",
  "mx": "mexico",
  "ar": "argentina",
  "cl": "chile",
  "co": "colombia",
  "pe": "peru",
  "ie": "ireland",
  "nl": "netherlands",
  "be": "belgium",
  "ch": "switzerland",
  "at": "austria",
  "se": "sweden",
  "no": "norway",
  "dk": "denmark",
  "fi": "finland",
  "pl": "poland",
  "pt": "portugal",
  "gr": "greece",
  "tr": "turkey",
  "ru": "russian federation",
  "za": "south africa",
  "eg": "egypt",
  "ng": "nigeria",
  "ke": "kenya",
  "sa": "saudi arabia",
  "ae": "united arab emirates",
  "il": "israel",
  "sg": "singapore",
  "th": "thailand",
  "vn": "viet nam",
  "ph": "philippines",
  "id": "indonesia",
  "my": "malaysia",
  "kr": "korea, republic of",
  "tw": "taiwan"
};

function norm(s?: string) {
  return (s || "").trim().toLowerCase();
}

function isUK(s: string) {
  return UK_SYNONYMS.has(norm(s));
}

function normalizeCountry(country: string): string {
  const normalized = norm(country);
  // Check if it's an ISO code
  if (ISO_TO_COUNTRY[normalized]) {
    return ISO_TO_COUNTRY[normalized];
  }
  return normalized;
}

function matchesDefault(countries: string[], defCountry: string) {
  const defNormalized = normalizeCountry(defCountry);
  
  // Check if default is UK-related
  if (isUK(defNormalized)) {
    // if any candidate is a UK synonym, treat as default match
    return countries.some(isUK);
  }
  
  // Normalize all country names (handles ISO codes)
  const normalizedCountries = countries.map(normalizeCountry);
  return normalizedCountries.includes(defNormalized);
}

/**
 * Load all countries that have a matching location (city/town) from the database.
 * Uses the existing location_hints table.
 */
async function getCountriesForLocation(locationQuery: string): Promise<string[]> {
  const cityKey = norm(locationQuery);
  if (!cityKey) return [];

  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    // Query the location_hints table for matching cities (exact match on town_city)
    const results = await sql`
      SELECT DISTINCT country
      FROM location_hints
      WHERE LOWER(town_city) = ${cityKey}
    `;

    // Extract unique countries
    const uniqueCountries = results.map((r: any) => r.country as string);
    return uniqueCountries;
  } catch (error) {
    console.error("Error querying location_hints:", error);
    return [];
  }
}

/**
 * Decide what to do with a user-provided location and a default country.
 * Rules:
 * - If no matches at all -> no_match
 * - If matches include default (incl. UK synonyms) -> use_default
 * - If matches exclude default and length == 1 -> auto_switch to that country
 * - If matches exclude default and length > 1 -> ask_user with candidates
 */
export async function resolveLocationAgainstDefault(
  locationQuery: string,
  defaultCountry: string
): Promise<LocationCheck> {
  const candidates = await getCountriesForLocation(locationQuery);
  
  if (candidates.length === 0) {
    return { action: "no_match" };
  }

  if (matchesDefault(candidates, defaultCountry)) {
    return { action: "use_default", chosenCountry: defaultCountry, candidates };
  }

  if (candidates.length === 1) {
    return { action: "auto_switch", chosenCountry: candidates[0], candidates };
  }

  // multiple non-default countries, need a quick user pick
  return { action: "ask_user", candidates };
}
