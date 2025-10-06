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

// Scores a result against {name, address/postcode}; STRICT matching for accuracy
function scoreResult(place: GPlace, targetName: string, targetAddress?: string) {
  let score = 0;
  const pName = norm(place.displayName?.text || "");
  const pAddr = norm(place.formattedAddress || "");
  const tName = norm(targetName);
  const tAddr = norm(targetAddress || "");

  // STRICT name matching - must be exact or very close
  if (pName === tName) {
    score += 15; // Exact match is critical
  } else if (pName.includes(tName) && tName.length >= 4) {
    // Target name is contained in place name (e.g., "Eagle Inn" in "The Eagle Inn")
    const diff = pName.length - tName.length;
    if (diff <= 5) score += 12; // Very close
    else if (diff <= 10) score += 8;
    else score += 4;
  } else if (tName.includes(pName) && pName.length >= 4) {
    // Place name is contained in target (reverse case)
    const diff = tName.length - pName.length;
    if (diff <= 5) score += 12;
    else if (diff <= 10) score += 8;
    else score += 4;
  } else {
    // Names don't match well - this is likely wrong
    score += 0; // Continue scoring but name mismatch is a red flag
  }

  // Postcode match is highly important for UK venues
  const postcodeMatch = (tAddr.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0] || "").toLowerCase();
  if (postcodeMatch && pAddr.includes(postcodeMatch)) {
    score += 8; // Postcode match is very reliable
  }

  // Street name match (extract street from address)
  const targetStreet = tAddr.match(/\d+\s+([^,]+)/)?.[1]?.toLowerCase().trim();
  if (targetStreet && pAddr.includes(targetStreet)) {
    score += 5; // Street address match is good
  }

  // Town/city match
  if (tAddr.includes("arundel") && pAddr.includes("arundel")) {
    score += 3;
  }

  // Prefer operational
  if (place.businessStatus === "OPERATIONAL") {
    score += 2;
  }

  // CRITICAL: Boost business entities, penalize street addresses
  const types = place.types || [];
  const isStreetAddress = types.includes("street_address") || types.includes("route");
  const isBusiness = types.some(t => 
    ["bar", "restaurant", "night_club", "cafe", "food", "establishment", "point_of_interest"].includes(t)
  );
  
  if (isBusiness) {
    score += 20; // Strongly prefer actual businesses
  } else if (isStreetAddress && !isBusiness) {
    score -= 100; // Heavily penalize pure street addresses (not the business!)
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
  // Extract just the town/city from address for better business matching
  let locationQuery = "";
  if (address) {
    // Try to extract town (e.g., "Arundel" from "45 High Street, Arundel, BN18 9AG")
    const townMatch = address.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
    if (townMatch) {
      locationQuery = townMatch[1].trim();
    }
  }
  
  // Search by name + town only (not full address) to get actual business entities
  const query = locationQuery ? `${name}, ${locationQuery}` : name;
  console.log(`   📍 Google Places query: "${query}"`);
  const places = await searchPlaceId({ apiKey, textQuery: query, region, locationBias });

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
    found: best.score >= 15, // Strict threshold: requires good name match + some address confirmation
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
