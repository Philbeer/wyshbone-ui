// GeoNames Geocoding Service with 24-hour caching
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const GEONAMES_USER = process.env.GEONAMES_USER || "";
const GEONAMES_BASE_URL = "http://api.geonames.org";

// Rate limiting: 1 request per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1000;

export interface GeocodeResult {
  country: string;
  country_code: string;
  admin1?: string;
  admin2?: string;
  confidence: number;
}

// Helper: Wait for rate limit
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
}

// Get cache file path
function getCachePath(query: string): string {
  const cacheDir = path.join(process.cwd(), 'server', 'cache', 'geocode');
  const hash = crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
  return path.join(cacheDir, `${hash}.json`);
}

// Check if cache is valid (< 24 hours old)
async function isCacheValid(cachePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(cachePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    return ageMs < maxAgeMs;
  } catch {
    return false;
  }
}

// Load from cache
async function loadCache(cachePath: string): Promise<GeocodeResult | null> {
  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    const data = JSON.parse(content);
    console.log(`✅ Loaded geocode result from cache: ${data.result.country}`);
    return data.result;
  } catch {
    return null;
  }
}

// Save to cache
async function saveCache(cachePath: string, result: GeocodeResult): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(
      cachePath,
      JSON.stringify({ result, cached_at: new Date().toISOString() }, null, 2)
    );
    console.log(`✅ Saved geocode result to cache: ${result.country}`);
  } catch (error: any) {
    console.warn(`⚠️ Failed to save geocode cache:`, error.message);
  }
}

// Fetch from GeoNames API with retry/backoff
async function fetchGeoNames(url: string, retries = 3): Promise<any> {
  await waitForRateLimit();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status?.message) {
        throw new Error(`GeoNames API error: ${data.status.message}`);
      }

      return data;
    } catch (error: any) {
      if (attempt === retries) throw error;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`⚠️ GeoNames request failed (attempt ${attempt}/${retries}), retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

// Main geocoding function
export async function geocodePlace(query: string): Promise<GeocodeResult> {
  const trimmedQuery = query.trim();
  
  if (!trimmedQuery) {
    throw new Error("Empty query provided to geocodePlace");
  }

  // Check cache first
  const cachePath = getCachePath(trimmedQuery);
  if (await isCacheValid(cachePath)) {
    const cached = await loadCache(cachePath);
    if (cached) return cached;
  }

  // Determine username (use demo if not configured)
  const username = GEONAMES_USER || "demo";
  if (!GEONAMES_USER) {
    console.warn("⚠️ GEONAMES_USER not set, using public demo endpoint (limited rate)");
    console.warn("   Set GEONAMES_USER in Secrets for better performance");
  }

  console.log(`🌐 Geocoding "${trimmedQuery}" via GeoNames API...`);

  try {
    // Search for place (name_equals is more precise than 'q')
    const searchUrl = `${GEONAMES_BASE_URL}/searchJSON?name_equals=${encodeURIComponent(trimmedQuery)}&maxRows=1&username=${username}`;
    const searchData = await fetchGeoNames(searchUrl);

    if (!searchData.geonames || searchData.geonames.length === 0) {
      // Try fuzzy search with 'q' parameter
      const fuzzyUrl = `${GEONAMES_BASE_URL}/searchJSON?q=${encodeURIComponent(trimmedQuery)}&maxRows=1&username=${username}`;
      const fuzzyData = await fetchGeoNames(fuzzyUrl);
      
      if (!fuzzyData.geonames || fuzzyData.geonames.length === 0) {
        throw new Error(`No results found for "${trimmedQuery}"`);
      }
      
      return await processGeoNameResult(fuzzyData.geonames[0], username, cachePath, 0.6); // Lower confidence for fuzzy
    }

    return await processGeoNameResult(searchData.geonames[0], username, cachePath, 0.9); // High confidence for exact match
  } catch (error: any) {
    console.error(`❌ Geocoding failed for "${trimmedQuery}":`, error.message);
    throw error;
  }
}

// Process GeoNames result and fetch hierarchy
async function processGeoNameResult(
  place: any,
  username: string,
  cachePath: string,
  baseConfidence: number
): Promise<GeocodeResult> {
  const countryCode = (place.countryCode || "").trim().toUpperCase();
  const countryName = place.countryName || "";

  if (!countryCode) {
    throw new Error("No country code in GeoNames response");
  }

  // Get administrative hierarchy
  let admin1 = place.adminName1 || undefined;
  let admin2 = place.adminName2 || undefined;

  // If we have geonameId, try to get more detailed hierarchy
  if (place.geonameId) {
    try {
      const hierarchyUrl = `${GEONAMES_BASE_URL}/hierarchyJSON?geonameId=${place.geonameId}&username=${username}`;
      const hierarchyData = await fetchGeoNames(hierarchyUrl);
      
      if (hierarchyData.geonames && hierarchyData.geonames.length > 0) {
        // Find admin levels in hierarchy
        const adminLevels = hierarchyData.geonames.filter((g: any) => 
          g.fcode?.startsWith('ADM') && g.geonameId !== place.geonameId
        );
        
        if (adminLevels.length > 0) {
          // Get the most specific admin level
          const mostSpecific = adminLevels[adminLevels.length - 1];
          if (mostSpecific.fcode === 'ADM1') {
            admin1 = mostSpecific.name;
          } else if (mostSpecific.fcode === 'ADM2') {
            admin2 = mostSpecific.name;
            // Get admin1 from hierarchy if available
            const admin1Level = adminLevels.find((g: any) => g.fcode === 'ADM1');
            if (admin1Level) admin1 = admin1Level.name;
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch hierarchy, using basic admin names");
    }
  }

  const result: GeocodeResult = {
    country: countryName,
    country_code: countryCode,
    admin1,
    admin2,
    confidence: baseConfidence
  };

  // Save to cache
  await saveCache(cachePath, result);

  console.log(`✅ Geocoded "${place.name}" → ${countryCode}${admin1 ? `, ${admin1}` : ''}${admin2 ? `, ${admin2}` : ''} (confidence: ${baseConfidence})`);

  return result;
}

// Fetch administrative regions for a country using GeoNames
export async function fetchGeoNamesRegions(
  countryCode: string,
  adminLevel: number = 1
): Promise<Array<{ id: string; name: string; code?: string; country_code: string }>> {
  const username = GEONAMES_USER || "demo";
  
  if (!GEONAMES_USER) {
    console.warn("⚠️ GEONAMES_USER not set, using public demo endpoint (limited rate)");
  }

  console.log(`🌐 Fetching admin level ${adminLevel} regions for ${countryCode} from GeoNames...`);

  try {
    await waitForRateLimit();
    
    // Try two approaches:
    // 1. First try to get country info and use childrenJSON (more reliable)
    try {
      const countryInfoUrl = `${GEONAMES_BASE_URL}/countryInfoJSON?country=${countryCode}&username=${username}`;
      const countryInfo = await fetchGeoNames(countryInfoUrl);
      
      if (countryInfo.geonames && countryInfo.geonames[0]?.geonameId) {
        const geonameId = countryInfo.geonames[0].geonameId;
        const childrenUrl = `${GEONAMES_BASE_URL}/childrenJSON?geonameId=${geonameId}&maxRows=500&username=${username}`;
        const childrenData = await fetchGeoNames(childrenUrl);
        
        if (childrenData.geonames && childrenData.geonames.length > 0) {
          // Filter by admin level
          const featureCode = `ADM${adminLevel}`;
          const regions = childrenData.geonames
            .filter((place: any) => place.fcode === featureCode)
            .map((place: any) => ({
              id: place.geonameId?.toString() || place.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
              name: place.name,
              code: place.adminCode1 || place.adminCode2 || undefined,
              country_code: countryCode.toUpperCase().trim()
            }));
          
          if (regions.length > 0) {
            console.log(`✅ Found ${regions.length} ${featureCode} regions for ${countryCode} via childrenJSON`);
            return regions;
          }
        }
      }
    } catch (childrenErr) {
      console.warn(`⚠️ childrenJSON approach failed, trying searchJSON...`);
    }
    
    // 2. For ADM2, we need to iterate over ADM1 children
    if (adminLevel === 2) {
      console.log(`📍 Fetching ADM2 regions by iterating ADM1 children for ${countryCode}...`);
      
      // First get ADM1 regions
      const adm1Regions = await fetchGeoNamesRegions(countryCode, 1);
      const adm2Regions: Array<{ id: string; name: string; code?: string; country_code: string }> = [];
      
      // For each ADM1, get its children (ADM2)
      for (const adm1 of adm1Regions) { // Fetch ALL ADM1 regions
        if (!adm1.id || isNaN(Number(adm1.id))) continue;
        
        await waitForRateLimit();
        const childrenUrl = `${GEONAMES_BASE_URL}/childrenJSON?geonameId=${adm1.id}&maxRows=100&username=${username}`;
        const childrenData = await fetchGeoNames(childrenUrl);
        
        if (childrenData.geonames) {
          const adm2Children = childrenData.geonames
            .filter((place: any) => place.fcode === 'ADM2')
            .map((place: any) => ({
              id: place.geonameId?.toString() || place.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
              name: place.name,
              code: place.adminCode2 || place.adminCode1 || undefined,
              country_code: countryCode.toUpperCase().trim()
            }));
          adm2Regions.push(...adm2Children);
        }
      }
      
      if (adm2Regions.length > 0) {
        console.log(`✅ Found ${adm2Regions.length} ADM2 regions for ${countryCode} via ADM1 iteration`);
        return adm2Regions;
      }
    }
    
    // 3. Final fallback: use searchJSON with name_startsWith wildcard
    const featureCode = `ADM${adminLevel}`;
    // Use name_startsWith to get broad results (GeoNames requires some query parameter)
    const searchUrl = `${GEONAMES_BASE_URL}/searchJSON?name_startsWith=&featureCode=${featureCode}&country=${countryCode}&maxRows=500&orderby=population&username=${username}`;
    const searchData = await fetchGeoNames(searchUrl);

    if (!searchData.geonames || searchData.geonames.length === 0) {
      console.log(`📍 No ${featureCode} regions found for ${countryCode}`);
      return [];
    }

    // Map to our region format
    const regions = searchData.geonames.map((place: any) => ({
      id: place.geonameId?.toString() || place.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: place.name,
      code: place.adminCode1 || place.adminCode2 || undefined,
      country_code: countryCode.toUpperCase().trim()
    }));

    console.log(`✅ Found ${regions.length} ${featureCode} regions for ${countryCode} via searchJSON`);
    return regions;
  } catch (error: any) {
    console.error(`❌ Failed to fetch GeoNames regions for ${countryCode}:`, error.message);
    return [];
  }
}
