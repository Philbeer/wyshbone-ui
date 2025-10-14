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

function norm(s?: string) {
  return (s || "").trim().toLowerCase();
}

function isUK(s: string) {
  return UK_SYNONYMS.has(norm(s));
}

function matchesDefault(countries: string[], defCountry: string) {
  const def = norm(defCountry);
  if (isUK(def)) {
    // if any candidate is a UK synonym, treat as default match
    return countries.some(isUK);
  }
  return countries.map(norm).includes(def);
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
