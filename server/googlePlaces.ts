// server/googlePlaces.ts
// Uses Google Places New (v1) "places:searchText" with a minimal field mask (cheap)

type GPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

type SearchResp = {
  places?: GPlace[];
};

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Simple cleaner for comparisons
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Scores a result against {name, address/postcode}; tweak as needed
function scoreResult(place: GPlace, targetName: string, targetAddress?: string) {
  let score = 0;
  const pName = norm(place.displayName?.text || "");
  const pAddr = norm(place.formattedAddress || "");
  const tName = norm(targetName);
  const tAddr = norm(targetAddress || "");

  if (pName === tName) score += 5;
  else if (pName.includes(tName) || tName.includes(pName)) score += 3;

  // postcode or town match helps a lot
  const postcodeMatch = (tAddr.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0] || "").toLowerCase();
  if (postcodeMatch && pAddr.includes(postcodeMatch)) score += 4;

  // loose address containment
  if (tAddr && (pAddr.includes(tAddr) || tAddr.includes(pAddr))) score += 2;

  // prefer operational
  if (place.businessStatus === "OPERATIONAL") score += 2;

  return score;
}

export async function searchPlaceId({
  apiKey = process.env.GOOGLE_MAPS_API_KEY!,
  textQuery,          // e.g., "The Fisherman's Joy, 43 Queen Street, Arundel BN18 9JG"
  region = "GB",      // bias/normalization
  locationBias,       // optional: { lat, lng, radiusMeters }
  fieldMask = "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.nationalPhoneNumber,places.websiteUri",
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
  const query = address ? `${name}, ${address}` : name;
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
    found: best.score >= 4, // threshold; adjust as you like
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
      score: r.score,
    })),
  };
}
