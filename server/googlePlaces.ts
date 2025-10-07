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
// New search function for Places v1 discovery (primary prospecting)
export async function searchPlaces({
  query,
  locationText,
  lat,
  lng,
  radiusMeters,
  maxResults = 30,
  typesFilter,
  apiKey = process.env.GOOGLE_MAPS_API_KEY!,
  region = "GB",
}: {
  query: string;
  locationText?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  maxResults?: number;
  typesFilter?: string[];
  apiKey?: string;
  region?: string;
}) {
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  let locationBias: { lat: number; lng: number; radiusMeters: number } | undefined;

  // Determine location bias
  if (lat !== undefined && lng !== undefined && radiusMeters !== undefined) {
    // Use provided coordinates
    locationBias = { lat, lng, radiusMeters };
  } else if (locationText) {
    // Resolve location text to coordinates
    console.log(`🌍 Resolving location: "${locationText}"`);
    const locationQuery = locationText;
    const body = {
      textQuery: locationQuery,
      languageCode: "en",
      regionCode: region,
    };

    const resp = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location",
      },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = (await resp.json()) as any;
      if (data.places && data.places.length > 0) {
        const bestLocation = data.places[0];
        if (bestLocation.location) {
          locationBias = {
            lat: bestLocation.location.latitude,
            lng: bestLocation.location.longitude,
            radiusMeters: radiusMeters || 12000, // Default 12km
          };
          console.log(`✓ Using location: ${bestLocation.displayName?.text || locationText} (${locationBias.lat}, ${locationBias.lng})`);
        }
      }
    }
  }

  // Now search for the query with location bias
  console.log(`🔍 Searching for: "${query}" with location bias`);
  
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.types,places.rating,places.userRatingCount,places.location";
  
  const body: Record<string, any> = {
    textQuery: query,
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
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places API error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as SearchResp;
  let places = data.places || [];

  // Filter to OPERATIONAL only
  places = places.filter(p => p.businessStatus === "OPERATIONAL");

  // Apply types filter if provided
  if (typesFilter && typesFilter.length > 0) {
    places = places.filter(p => {
      const placeTypes = p.types || [];
      return placeTypes.some(t => typesFilter.includes(t));
    });
  }

  // Normalize results
  const results = places.slice(0, maxResults).map(p => {
    const placeId = p.id.replace(/^places\//, ""); // Strip "places/" prefix
    return {
      placeId,
      resourceName: p.id, // Keep original with prefix
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      businessStatus: p.businessStatus || "UNKNOWN",
      phone: p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      types: p.types || [],
      rating: (p as any).rating || null,
      userRatingCount: (p as any).userRatingCount || null,
      location: (p as any).location ? {
        lat: (p as any).location.latitude,
        lng: (p as any).location.longitude,
      } : null,
    };
  });

  console.log(`✓ Found ${results.length} OPERATIONAL places`);
  return results;
}

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
  // Try multiple targeted searches:
  // 1. Name + full address (most complete)
  // 2. Name + postcode (specific)
  // 3. Name + street + town (medium specificity)
  
  const postcodeMatch = address?.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0];
  const streetMatch = address?.match(/(\d+\s+[^,]+)/)?.[1]?.trim();
  const townMatch = address?.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i)?.[1]?.trim();
  
  let allPlaces: GPlace[] = [];
  
  // Search 1: Name + Full Address
  if (address) {
    const query1 = `${name}, ${address}`;
    console.log(`   📍 Search #1: "${query1}"`);
    const results1 = await searchPlaceId({ apiKey, textQuery: query1, region, locationBias });
    allPlaces.push(...results1);
  }
  
  // Search 2: Name + Postcode
  if (postcodeMatch) {
    const query2 = `${name} ${postcodeMatch}`;
    console.log(`   📍 Search #2: "${query2}"`);
    const results2 = await searchPlaceId({ apiKey, textQuery: query2, region, locationBias });
    allPlaces.push(...results2);
  }
  
  // Search 3: Name + Street + Town
  if (streetMatch && townMatch) {
    const query3 = `${name}, ${streetMatch}, ${townMatch}`;
    console.log(`   📍 Search #3: "${query3}"`);
    const results3 = await searchPlaceId({ apiKey, textQuery: query3, region, locationBias });
    allPlaces.push(...results3);
  }
  
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
