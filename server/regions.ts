// Hybrid Region Service with ISO-safe country codes for Google Places
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY_DEFAULT || "";

export interface Region {
  id: string;
  name: string;
  code?: string;
  country_code: string;
}

export interface RegionsResult {
  source: 'local' | 'remote_cached';
  country_code: string;
  regions: Region[];
}

// Helper: Slugify name for ID fallback
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Helper: Ensure code is uppercase and trimmed (guards against " gb" issues)
export function toCodeSafe(value: string): string {
  return value.trim().toUpperCase();
}

// ISO country code mapping
export function getRegionCode(countryText: string): string {
  const normalized = countryText.toLowerCase().trim();
  
  const mapping: Record<string, string> = {
    'uk': 'GB',
    'united kingdom': 'GB',
    'england': 'GB',
    'scotland': 'GB',
    'wales': 'GB',
    'northern ireland': 'GB',
    'britain': 'GB',
    'great britain': 'GB',
    // UK cities map to GB
    'london': 'GB',
    'manchester': 'GB',
    'birmingham': 'GB',
    'liverpool': 'GB',
    'leeds': 'GB',
    'bristol': 'GB',
    'glasgow': 'GB',
    'edinburgh': 'GB',
    'cardiff': 'GB',
    'belfast': 'GB',
    'us': 'US',
    'usa': 'US',
    'united states': 'US',
    'america': 'US',
    'fr': 'FR',
    'france': 'FR',
    'au': 'AU',
    'australia': 'AU',
    // Australian cities map to AU
    'melbourne': 'AU',
    'sydney': 'AU',
    'brisbane': 'AU',
    'perth': 'AU',
    'adelaide': 'AU',
    'gold coast': 'AU',
    'canberra': 'AU',
    'newcastle': 'AU',
    'hobart': 'AU',
    'darwin': 'AU',
    'ca': 'CA',
    'canada': 'CA',
    // Canadian provinces map to CA
    'ontario': 'CA',
    'quebec': 'CA',
    'british columbia': 'CA',
    'alberta': 'CA',
    'manitoba': 'CA',
    'saskatchewan': 'CA',
    'nova scotia': 'CA',
    'new brunswick': 'CA',
    'newfoundland and labrador': 'CA',
    'prince edward island': 'CA',
    'northwest territories': 'CA',
    'yukon': 'CA',
    'nunavut': 'CA',
    'ie': 'IE',
    'ireland': 'IE',
    'eire': 'IE',
    'de': 'DE',
    'germany': 'DE',
    // German states map to DE
    'bavaria': 'DE',
    'bayern': 'DE',
    'baden-württemberg': 'DE',
    'berlin': 'DE',
    'brandenburg': 'DE',
    'bremen': 'DE',
    'hamburg': 'DE',
    'hesse': 'DE',
    'hessen': 'DE',
    'lower saxony': 'DE',
    'niedersachsen': 'DE',
    'mecklenburg-vorpommern': 'DE',
    'north rhine-westphalia': 'DE',
    'nordrhein-westfalen': 'DE',
    'rhineland-palatinate': 'DE',
    'rheinland-pfalz': 'DE',
    'saarland': 'DE',
    'saxony': 'DE',
    'sachsen': 'DE',
    'saxony-anhalt': 'DE',
    'sachsen-anhalt': 'DE',
    'schleswig-holstein': 'DE',
    'thuringia': 'DE',
    'thüringen': 'DE',
    'es': 'ES',
    'spain': 'ES',
    // Spanish regions map to ES
    'catalonia': 'ES',
    'catalunya': 'ES',
    'andalusia': 'ES',
    'andalucía': 'ES',
    'madrid': 'ES',
    'valencia': 'ES',
    'basque country': 'ES',
    'país vasco': 'ES',
    'galicia': 'ES',
    'it': 'IT',
    'italy': 'IT',
    // Italian regions map to IT
    'tuscany': 'IT',
    'toscana': 'IT',
    'lombardy': 'IT',
    'lombardia': 'IT',
    'lazio': 'IT',
    'rome': 'IT',
    'roma': 'IT',
    'sicily': 'IT',
    'sicilia': 'IT',
    'veneto': 'IT',
    'venice': 'IT',
    'venezia': 'IT',
    'piedmont': 'IT',
    'piemonte': 'IT',
    'nl': 'NL',
    'netherlands': 'NL',
    'be': 'BE',
    'belgium': 'BE',
    'pt': 'PT',
    'portugal': 'PT',
    // US states map to US
    'alabama': 'US', 'alaska': 'US', 'arizona': 'US', 'arkansas': 'US', 'california': 'US', 'colorado': 'US', 'connecticut': 'US', 'delaware': 'US', 'florida': 'US', 'georgia': 'US', 'hawaii': 'US', 'idaho': 'US', 'illinois': 'US', 'indiana': 'US', 'iowa': 'US', 'kansas': 'US', 'kentucky': 'US', 'louisiana': 'US', 'maine': 'US', 'maryland': 'US', 'massachusetts': 'US', 'michigan': 'US', 'minnesota': 'US', 'mississippi': 'US', 'missouri': 'US', 'montana': 'US', 'nebraska': 'US', 'nevada': 'US', 'new hampshire': 'US', 'new jersey': 'US', 'new mexico': 'US', 'new york': 'US', 'north carolina': 'US', 'north dakota': 'US', 'ohio': 'US', 'oklahoma': 'US', 'oregon': 'US', 'pennsylvania': 'US', 'rhode island': 'US', 'south carolina': 'US', 'south dakota': 'US', 'tennessee': 'US', 'texas': 'US', 'utah': 'US', 'vermont': 'US', 'virginia': 'US', 'washington': 'US', 'west virginia': 'US', 'wisconsin': 'US', 'wyoming': 'US',
    // Australian states map to AU
    'new south wales': 'AU',
    'nsw': 'AU',
    'victoria': 'AU',
    'vic': 'AU',
    'queensland': 'AU',
    'qld': 'AU',
    'south australia': 'AU',
    'sa': 'AU',
    'western australia': 'AU',
    'wa': 'AU',
    'tasmania': 'AU',
    'tas': 'AU',
    'northern territory': 'AU',
    'nt': 'AU',
    'australian capital territory': 'AU',
    'act': 'AU',
  };

  if (mapping[normalized]) {
    return mapping[normalized];
  }

  // Check if it contains ", AU" (e.g., "New South Wales, AU")
  if (normalized.includes(', au')) {
    return 'AU';
  }

  // Fallback: use as-is with warning
  const fallback = toCodeSafe(countryText);
  console.warn(`⚠️ Unknown country "${countryText}", using fallback code: ${fallback}`);
  return fallback;
}

// Dynamic region lookup using Google Places API Text Search
export async function fetchRegionsDynamically(
  countryCode: string,
  granularity: string,
  regionFilter?: string
): Promise<Region[]> {
  if (!GOOGLE_API_KEY) {
    console.warn("⚠️ GOOGLE_API_KEY_DEFAULT not set, cannot perform dynamic region lookup");
    return [];
  }

  try {
    // Build search query based on granularity
    let query = '';
    if (regionFilter) {
      query = `${granularity}s in ${regionFilter}, ${countryCode}`;
    } else {
      const granularityMap: Record<string, string> = {
        'county': 'counties',
        'state': 'states',
        'province': 'provinces',
        'city': 'cities',
        'borough': 'boroughs',
        'municipality': 'municipalities',
        'district': 'districts'
      };
      const plural = granularityMap[granularity] || granularity;
      query = `${plural} in ${countryCode}`;
    }

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=administrative_area_level_2&key=${GOOGLE_API_KEY}`;
    
    console.log(`🌐 Fetching regions dynamically from Google Places API: "${query}"`);
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`⚠️ Google Places API returned status: ${data.status}`);
      return [];
    }

    if (!data.results || data.results.length === 0) {
      console.log(`📍 No dynamic regions found for: ${query}`);
      return [];
    }

    // Extract region names from Google Places results
    const regions: Region[] = data.results.map((place: any, index: number) => {
      const name = place.name || place.formatted_address?.split(',')[0] || `Region ${index + 1}`;
      return {
        id: slugifyName(name),
        name: name,
        country_code: toCodeSafe(countryCode)
      };
    });

    console.log(`✅ Found ${regions.length} regions dynamically from Google Places API`);
    return regions;
  } catch (error: any) {
    console.error(`❌ Error fetching regions dynamically:`, error.message);
    return [];
  }
}

// Load local regions from JSON datasets
export async function loadLocalRegions(
  country: string,
  granularity: string,
  regionFilter?: string
): Promise<Region[] | null> {
  const dataDir = path.join(process.cwd(), 'server', 'data');
  
  // Map (country, granularity, regionFilter?) to dataset file
  const countryNorm = country.toLowerCase().trim();
  const granNorm = granularity.toLowerCase().trim();
  const filterNorm = regionFilter?.toLowerCase().trim();

  let dataFile: string | null = null;

  // UK mappings
  if (countryNorm === 'uk' || countryNorm === 'united kingdom' || countryNorm === 'gb') {
    if (granNorm === 'county') {
      dataFile = 'uk_counties.json';
    } else if (granNorm === 'borough' && filterNorm === 'london') {
      dataFile = 'london_boroughs.json';
    } else if (granNorm === 'devolved' || granNorm === 'council') {
      dataFile = 'gb_devolved.json';
    }
  }
  // US mappings
  else if (countryNorm === 'us' || countryNorm === 'usa' || countryNorm === 'united states') {
    if (granNorm === 'state') {
      dataFile = 'us_states.json';
    } else if (granNorm === 'county' && regionFilter) {
      // Check if we have a state-specific county file
      const stateFile = `us_counties_by_state/${regionFilter}.json`;
      const statePath = path.join(dataDir, stateFile);
      try {
        await fs.access(statePath);
        dataFile = stateFile;
      } catch {
        return null; // State county file doesn't exist
      }
    }
  }
  // Ireland
  else if (countryNorm === 'ie' || countryNorm === 'ireland') {
    if (granNorm === 'county') {
      dataFile = 'ie_counties.json';
    }
  }
  // Australia
  else if (countryNorm === 'au' || countryNorm === 'australia') {
    if (granNorm === 'state' || granNorm === 'territory') {
      dataFile = 'au_states.json';
    }
  }
  // Canada
  else if (countryNorm === 'ca' || countryNorm === 'canada') {
    if (granNorm === 'province' || granNorm === 'territory') {
      dataFile = 'ca_provinces.json';
    }
  }

  if (!dataFile) {
    return null; // No local dataset available
  }

  try {
    const filePath = path.join(dataDir, dataFile);
    const content = await fs.readFile(filePath, 'utf-8');
    const regions: Region[] = JSON.parse(content);
    console.log(`✅ Loaded ${regions.length} regions from local dataset: ${dataFile}`);
    return regions;
  } catch (error: any) {
    console.warn(`⚠️ Failed to load local dataset ${dataFile}:`, error.message);
    return null;
  }
}

// Fetch remote regions using GeoNames or Google Places API lookup
export async function fetchRemoteRegions(
  country: string,
  granularity: string,
  regionFilter?: string
): Promise<Region[]> {
  const country_code = getRegionCode(country);
  console.log(`🌐 Using dynamic region lookup for ${country}/${granularity}/${regionFilter || 'all'}`);
  
  // Try GeoNames first (better for administrative regions)
  const { fetchGeoNamesRegions } = await import('./geocode');
  
  // Per-country admin level mapping (overrides default granularity mapping)
  const countryAdminLevels: Record<string, Record<string, number>> = {
    'JP': { 'prefecture': 1 },  // Japanese prefectures are ADM1
    'CO': { 'department': 1 },  // Colombian departments are ADM1
    'FR': { 'department': 2, 'region': 1 },  // French departments are ADM2, regions are ADM1
    'ES': { 'province': 2, 'region': 1 },  // Spanish provinces are ADM2, autonomous communities are ADM1
    'IT': { 'province': 2, 'region': 1 },  // Italian provinces are ADM2, regions are ADM1
    'US': { 'county': 2, 'state': 1 },  // US counties are ADM2, states are ADM1
    'GB': { 'county': 2 },  // UK counties are ADM2
    'DE': { 'state': 1 },  // German states are ADM1
  };
  
  // Determine admin level based on country-specific mapping or default granularity
  let adminLevel = 1; // default
  if (countryAdminLevels[country_code]?.[granularity] !== undefined) {
    adminLevel = countryAdminLevels[country_code][granularity];
  } else {
    // Default mapping: states/provinces/regions → ADM1, counties/departments/districts → ADM2
    adminLevel = granularity === 'state' || granularity === 'province' || granularity === 'region' ? 1 :
                 granularity === 'county' || granularity === 'department' || granularity === 'prefecture' ||
                 granularity === 'district' || granularity === 'governorate' || granularity === 'emirate' ? 2 : 1;
  }
  
  try {
    const geoNamesRegions = await fetchGeoNamesRegions(country_code, adminLevel);
    if (geoNamesRegions.length > 0) {
      console.log(`✅ Using GeoNames data: ${geoNamesRegions.length} regions`);
      return geoNamesRegions as Region[];
    }
  } catch (error: any) {
    console.warn(`⚠️ GeoNames lookup failed, falling back to Google Places:`, error.message);
  }
  
  // Fallback to Google Places API for dynamic region discovery
  return await fetchRegionsDynamically(country_code, granularity, regionFilter);
}

// Get cache file path for remote results
function getCachePath(country: string, granularity: string, regionFilter?: string): string {
  const cacheDir = path.join(process.cwd(), 'server', 'cache', 'regions');
  const key = `${country}_${granularity}_${regionFilter || 'all'}`;
  const hash = crypto.createHash('md5').update(key).digest('hex');
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

// Load cached regions
async function loadCache(cachePath: string): Promise<Region[] | null> {
  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    const data = JSON.parse(content);
    console.log(`✅ Loaded ${data.regions.length} regions from cache`);
    return data.regions;
  } catch {
    return null;
  }
}

// Save to cache
async function saveCache(cachePath: string, regions: Region[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({ regions, cached_at: new Date().toISOString() }, null, 2));
    console.log(`✅ Saved ${regions.length} regions to cache`);
  } catch (error: any) {
    console.warn(`⚠️ Failed to save cache:`, error.message);
  }
}

// Main function: Get regions with fallback logic
export async function getRegions(
  country: string,
  granularity: string,
  regionFilter?: string
): Promise<RegionsResult> {
  const country_code = getRegionCode(country);

  // 1) Try local dataset
  const localRegions = await loadLocalRegions(country, granularity, regionFilter);
  if (localRegions && localRegions.length > 0) {
    return {
      source: 'local',
      country_code,
      regions: localRegions,
    };
  }

  // 2) Try cache
  const cachePath = getCachePath(country, granularity, regionFilter);
  if (await isCacheValid(cachePath)) {
    const cachedRegions = await loadCache(cachePath);
    if (cachedRegions && cachedRegions.length > 0) {
      return {
        source: 'remote_cached',
        country_code,
        regions: cachedRegions,
      };
    }
  }

  // 3) Fetch remote, save to cache, return
  const remoteRegions = await fetchRemoteRegions(country, granularity, regionFilter);
  if (remoteRegions.length > 0) {
    await saveCache(cachePath, remoteRegions);
  }

  return {
    source: 'remote_cached',
    country_code,
    regions: remoteRegions,
  };
}

// Get supported local datasets
export async function getSupportedDatasets(): Promise<Record<string, number>> {
  const dataDir = path.join(process.cwd(), 'server', 'data');
  const datasets: Record<string, number> = {};

  const files = [
    'uk_counties.json',
    'london_boroughs.json',
    'gb_devolved.json',
    'us_states.json',
    'us_counties_by_state/Texas.json',
    'ie_counties.json',
    'au_states.json',
    'ca_provinces.json',
  ];

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
      const data = JSON.parse(content);
      datasets[file] = Array.isArray(data) ? data.length : 0;
    } catch {
      // File doesn't exist or can't be read
    }
  }

  return datasets;
}

// Clear region cache
export async function clearRegionCache(): Promise<number> {
  const cacheDir = path.join(process.cwd(), 'server', 'cache', 'regions');
  try {
    const files = await fs.readdir(cacheDir);
    let count = 0;
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(cacheDir, file));
        count++;
      }
    }
    console.log(`✅ Cleared ${count} cached region files`);
    return count;
  } catch {
    return 0;
  }
}
