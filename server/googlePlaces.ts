// server/googlePlaces.ts
// Uses Google Places New (v1) "places:searchText" with a minimal field mask (cheap)

type GPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[]; // e.g., ["bar", "restaurant", "establishment"] vs ["street_address"]
};

type SearchResp = {
  places?: GPlace[];
};

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Enhanced cleaner for comparisons - handles common variations
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[''\u2019]/g, "") // Remove apostrophes
    .replace(/[.,]/g, "") // Remove periods and commas
    .replace(/\bthe\b/g, "") // Remove "the" prefix/suffix
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

// Simplified, robust scoring
function scoreResult(place: GPlace, targetName: string, targetAddress?: string) {
  let score = 0;
  const pName = norm(place.displayName?.text || "");
  const pAddr = norm(place.formattedAddress || "");
  const tName = norm(targetName);
  const tAddr = norm(targetAddress || "");

  // Name similarity
  if (pName === tName) {
    score += 5; // Exact match
  } else if (pName && tName && (pName.includes(tName) || tName.includes(pName))) {
    score += 3; // Partial match
  }

  // Postcode is very reliable for UK
  const postcodeMatch = (tAddr.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0] || "").toLowerCase();
  if (postcodeMatch && pAddr.includes(postcodeMatch)) {
    score += 4;
  }

  // Town/location match
  const townMatch = tAddr.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
  if (townMatch) {
    const town = townMatch[1].trim().toLowerCase();
    if (pAddr.includes(town)) {
      score += 2;
    }
  }

  // Prefer operational businesses
  if (place.businessStatus === "OPERATIONAL") {
    score += 3;
  }

  // CRITICAL: Favor actual business entities over addresses/routes
  const types = place.types || [];
  const isBusiness = types.some(t => 
    ["bar", "restaurant", "night_club", "cafe", "food", "point_of_interest", "establishment"].includes(t)
  );
  const isAddressOnly = types.includes("street_address") || types.includes("premise");
  
  if (isBusiness && !isAddressOnly) {
    score += 5; // Strongly prefer businesses
  } else if (isAddressOnly && !isBusiness) {
    score -= 10; // Penalize pure addresses
  }

  // Penalize if address doesn't match at all
  if (tAddr && pAddr && !pAddr.includes(tAddr.substring(0, 20)) && !tAddr.includes(pAddr.substring(0, 20))) {
    score -= 2;
  }

  return score;
}

export async function searchPlaceId({
  apiKey = process.env.GOOGLE_MAPS_API_KEY!,
  textQuery,          // e.g., "The Fisherman's Joy, 43 Queen Street, Arundel BN18 9JG"
  region = "GB",      // bias/normalization
  locationBias,       // optional: { lat, lng, radiusMeters }
  fieldMask = "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.types",
}: {
  apiKey?: string;
  textQuery: string;
  region?: string;
  locationBias?: { lat: number; lng: number; radiusMeters: number };
  fieldMask?: string;
}) {
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const body: Record<string, any> = {
    textQuery,
    languageCode: "en",
    regionCode: region,
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusMeters,
      },
    };
  }

  const resp = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask, // keep costs low!
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places API error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as SearchResp;
  return data.places || [];
}

// Convenience: verify by separate name + address and pick best match
export async function verifyVenue({
  name,
  address,
  apiKey = process.env.GOOGLE_MAPS_API_KEY!,
  region = "GB",
  locationBias,
}: {
  name: string;
  address?: string;
  apiKey?: string;
  region?: string;
  locationBias?: { lat: number; lng: number; radiusMeters: number };
}) {
  // Try TWO searches to maximize coverage:
  // 1. Name + postcode (most specific)
  // 2. Just name (broadest, catches all entities)
  
  const postcodeMatch = address?.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0];
  
  let allPlaces: GPlace[] = [];
  
  // Search 1: Name + Postcode (if available)
  if (postcodeMatch) {
    const query1 = `${name} ${postcodeMatch}`;
    console.log(`   📍 Search #1: "${query1}"`);
    const results1 = await searchPlaceId({ apiKey, textQuery: query1, region, locationBias });
    allPlaces.push(...results1);
  }
  
  // Search 2: Just the name (broad search)
  console.log(`   📍 Search #2: "${name}"`);
  const results2 = await searchPlaceId({ apiKey, textQuery: name, region, locationBias });
  allPlaces.push(...results2);
  
  // Deduplicate by Place ID
  const uniquePlaces = Array.from(
    new Map(allPlaces.map(p => [p.id, p])).values()
  );
  
  const places = uniquePlaces;

  if (places.length === 0) {
    return {
      found: false,
      reason: "No matches from Places",
      best: null,
    };
  }

  // rank results
  const ranked = places
    .map((p) => ({
      place: p,
      score: scoreResult(p, name, address),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return {
    found: best.score >= 8, // Balanced threshold: name + postcode/location + operational
    best: {
      placeId: best.place.id,
      name: best.place.displayName?.text || "",
      address: best.place.formattedAddress || "",
      businessStatus: best.place.businessStatus || "UNKNOWN",
      phone: best.place.nationalPhoneNumber || null,
      website: best.place.websiteUri || null,
      score: best.score,
    },
    candidates: ranked.slice(0, 5).map((r) => ({
      placeId: r.place.id,
      name: r.place.displayName?.text || "",
      address: r.place.formattedAddress || "",
      businessStatus: r.place.businessStatus || "UNKNOWN",
      types: r.place.types || [],
      score: r.score,
    })),
  };
}
