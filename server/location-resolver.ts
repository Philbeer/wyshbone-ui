// Intelligent location resolver with local dictionaries and remote geocoding fallback
import { geocodePlace, type GeocodeResult } from './geocode';
import { getRegionCode } from './regions';

export interface ResolvedLocation {
  country: string;
  country_code: string;
  region_filter?: string;
  granularity: string;
  confidence: number;
  note?: string;
  source?: 'local_dictionary' | 'city_hints' | 'geocoder';
}

// Granularity mapping by country
const GRANULARITY_BY_COUNTRY: Record<string, string> = {
  'GB': 'county',
  'US': 'state',
  'AU': 'state',
  'IE': 'county',
  'CA': 'province',
  'NZ': 'region',
  'DE': 'state',
  'FR': 'department',
  'ES': 'province',
  'IT': 'region',
  'JP': 'prefecture',
  'CN': 'province',
  'IN': 'state',
  'BR': 'state',
  'MX': 'state',
  'AR': 'province',
  'CL': 'region',
  'CO': 'department',
  'PE': 'region',
  'ZA': 'province',
  'KE': 'county',
  'NG': 'state',
  'EG': 'governorate',
  'SA': 'region',
  'AE': 'emirate',
  'TR': 'province',
  'RU': 'oblast',
  'PL': 'voivodeship',
  'NL': 'province',
  'BE': 'province',
  'SE': 'county',
  'NO': 'county',
  'DK': 'region',
  'FI': 'region',
  'CH': 'canton',
  'AT': 'state',
  'PT': 'district',
  'GR': 'region',
  'CZ': 'region',
  'HU': 'county',
  'RO': 'county',
  'BG': 'region',
  'HR': 'county',
  'RS': 'district',
  'UA': 'oblast',
  'SK': 'region',
  'SI': 'region',
  'LT': 'county',
  'LV': 'region',
  'EE': 'county',
  'IS': 'region',
  'LU': 'canton',
  'MT': 'region',
  'CY': 'district',
};

// Special cases: London is a city that should use boroughs
const SPECIAL_GRANULARITY: Record<string, { country_code: string; granularity: string }> = {
  'london': { country_code: 'GB', granularity: 'borough' },
  'greater london': { country_code: 'GB', granularity: 'borough' },
  'tokyo': { country_code: 'JP', granularity: 'ward' },
  'paris': { country_code: 'FR', granularity: 'arrondissement' },
  'new york city': { country_code: 'US', granularity: 'borough' },
  'nyc': { country_code: 'US', granularity: 'borough' },
};

// City hints for common cities (high confidence local matches)
const CITY_HINTS: Record<string, { country_code: string; region?: string; confidence: number }> = {
  // UK Cities
  'london': { country_code: 'GB', region: 'London', confidence: 0.95 },
  'manchester': { country_code: 'GB', region: 'Greater Manchester', confidence: 0.9 },
  'birmingham': { country_code: 'GB', region: 'West Midlands', confidence: 0.9 },
  'liverpool': { country_code: 'GB', region: 'Merseyside', confidence: 0.9 },
  'leeds': { country_code: 'GB', region: 'West Yorkshire', confidence: 0.9 },
  'bristol': { country_code: 'GB', region: 'Bristol', confidence: 0.9 },
  'glasgow': { country_code: 'GB', region: 'Glasgow City', confidence: 0.9 },
  'edinburgh': { country_code: 'GB', region: 'City of Edinburgh', confidence: 0.9 },
  
  // US Cities & States
  'new york': { country_code: 'US', region: 'New York', confidence: 0.95 },
  'los angeles': { country_code: 'US', region: 'California', confidence: 0.9 },
  'chicago': { country_code: 'US', region: 'Illinois', confidence: 0.9 },
  'houston': { country_code: 'US', region: 'Texas', confidence: 0.9 },
  'miami': { country_code: 'US', region: 'Florida', confidence: 0.9 },
  'san francisco': { country_code: 'US', region: 'California', confidence: 0.9 },
  'seattle': { country_code: 'US', region: 'Washington', confidence: 0.9 },
  'boston': { country_code: 'US', region: 'Massachusetts', confidence: 0.9 },
  'texas': { country_code: 'US', region: 'Texas', confidence: 0.95 },
  'california': { country_code: 'US', region: 'California', confidence: 0.95 },
  'florida': { country_code: 'US', region: 'Florida', confidence: 0.9 },
  
  // Australian Cities & States
  'sydney': { country_code: 'AU', region: 'New South Wales', confidence: 0.95 },
  'melbourne': { country_code: 'AU', region: 'Victoria', confidence: 0.95 },
  'brisbane': { country_code: 'AU', region: 'Queensland', confidence: 0.9 },
  'perth': { country_code: 'AU', region: 'Western Australia', confidence: 0.9 },
  'adelaide': { country_code: 'AU', region: 'South Australia', confidence: 0.9 },
  'victoria': { country_code: 'AU', region: 'Victoria', confidence: 0.9 },
  'queensland': { country_code: 'AU', region: 'Queensland', confidence: 0.9 },
  'new south wales': { country_code: 'AU', region: 'New South Wales', confidence: 0.9 },
  'nsw': { country_code: 'AU', region: 'New South Wales', confidence: 0.9 },
  
  // European Cities & Regions
  'paris': { country_code: 'FR', region: 'Île-de-France', confidence: 0.95 },
  'lyon': { country_code: 'FR', region: 'Auvergne-Rhône-Alpes', confidence: 0.9 },
  'marseille': { country_code: 'FR', region: 'Provence-Alpes-Côte d\'Azur', confidence: 0.9 },
  'berlin': { country_code: 'DE', region: 'Berlin', confidence: 0.95 },
  'munich': { country_code: 'DE', region: 'Bavaria', confidence: 0.9 },
  'hamburg': { country_code: 'DE', region: 'Hamburg', confidence: 0.9 },
  'bavaria': { country_code: 'DE', region: 'Bavaria', confidence: 0.9 },
  'rome': { country_code: 'IT', region: 'Lazio', confidence: 0.95 },
  'milan': { country_code: 'IT', region: 'Lombardy', confidence: 0.9 },
  'florence': { country_code: 'IT', region: 'Tuscany', confidence: 0.9 },
  'barcelona': { country_code: 'ES', region: 'Catalonia', confidence: 0.9 },
  'madrid': { country_code: 'ES', region: 'Community of Madrid', confidence: 0.95 },
  'amsterdam': { country_code: 'NL', region: 'North Holland', confidence: 0.95 },
  'vienna': { country_code: 'AT', region: 'Vienna', confidence: 0.95 },
  
  // Asian Cities
  'tokyo': { country_code: 'JP', region: 'Tokyo', confidence: 0.95 },
  'osaka': { country_code: 'JP', region: 'Osaka', confidence: 0.9 },
  'kyoto': { country_code: 'JP', region: 'Kyoto Prefecture', confidence: 0.9 },
  'singapore': { country_code: 'SG', confidence: 0.95 },
  'hong kong': { country_code: 'HK', confidence: 0.95 },
  'shanghai': { country_code: 'CN', region: 'Shanghai', confidence: 0.9 },
  'beijing': { country_code: 'CN', region: 'Beijing', confidence: 0.9 },
  'seoul': { country_code: 'KR', region: 'Seoul', confidence: 0.95 },
  'bangkok': { country_code: 'TH', region: 'Bangkok', confidence: 0.95 },
  'mumbai': { country_code: 'IN', region: 'Maharashtra', confidence: 0.9 },
  'delhi': { country_code: 'IN', region: 'Delhi', confidence: 0.9 },
  
  // Latin American Cities
  'mexico city': { country_code: 'MX', region: 'Mexico City', confidence: 0.95 },
  'buenos aires': { country_code: 'AR', region: 'Buenos Aires', confidence: 0.95 },
  'são paulo': { country_code: 'BR', region: 'São Paulo', confidence: 0.9 },
  'rio de janeiro': { country_code: 'BR', region: 'Rio de Janeiro', confidence: 0.9 },
  'bogotá': { country_code: 'CO', region: 'Cundinamarca', confidence: 0.9 },
  'bogota': { country_code: 'CO', region: 'Cundinamarca', confidence: 0.9 },
  'medellín': { country_code: 'CO', region: 'Antioquia', confidence: 0.9 },
  'medellin': { country_code: 'CO', region: 'Antioquia', confidence: 0.9 },
  'santiago': { country_code: 'CL', region: 'Santiago Metropolitan', confidence: 0.9 },
  'lima': { country_code: 'PE', region: 'Lima', confidence: 0.9 },
  
  // Ireland & New Zealand
  'dublin': { country_code: 'IE', region: 'Dublin', confidence: 0.95 },
  'cork': { country_code: 'IE', region: 'Cork', confidence: 0.9 },
  'auckland': { country_code: 'NZ', region: 'Auckland Region', confidence: 0.95 },
  'wellington': { country_code: 'NZ', region: 'Wellington Region', confidence: 0.9 },
  
  // Canadian Cities
  'toronto': { country_code: 'CA', region: 'Ontario', confidence: 0.95 },
  'vancouver': { country_code: 'CA', region: 'British Columbia', confidence: 0.9 },
  'montreal': { country_code: 'CA', region: 'Quebec', confidence: 0.9 },
};

/**
 * Resolve a location string to structured location data
 * Uses local dictionaries first, then falls back to GeoNames geocoding
 */
export async function resolveLocation(text: string): Promise<ResolvedLocation> {
  let normalized = text.toLowerCase().trim();
  
  // Extract location from phrases like "pubs in Melbourne", "bars in Texas"
  const inMatch = normalized.match(/\bin\s+(.+)$/i);
  if (inMatch) {
    normalized = inMatch[1].trim();
  }
  
  // Handle country abbreviations and context
  // e.g., "Auckland NZ" -> "auckland", "Victoria Australia" -> "victoria"
  const countryAbbrevs: Record<string, string> = {
    'nz': 'new zealand',
    'uk': 'united kingdom', 
    'us': 'united states',
    'usa': 'united states',
    'au': 'australia',
    'ca': 'canada'
  };
  
  // Try to extract city/region with country context
  for (const [abbrev, fullCountry] of Object.entries(countryAbbrevs)) {
    if (normalized.endsWith(` ${abbrev}`)) {
      const place = normalized.slice(0, -(abbrev.length + 1)).trim();
      // Try with just the place name first
      const testHint = CITY_HINTS[place];
      if (testHint) {
        normalized = place; // Use the extracted place
        break;
      }
    }
    if (normalized.endsWith(` ${fullCountry}`)) {
      const place = normalized.slice(0, -(fullCountry.length + 1)).trim();
      const testHint = CITY_HINTS[place];
      if (testHint) {
        normalized = place;
        break;
      }
    }
  }
  
  // Step 1: Check special granularity cases
  const special = SPECIAL_GRANULARITY[normalized];
  if (special) {
    const defaultGranularity = GRANULARITY_BY_COUNTRY[special.country_code] || 'region';
    return {
      country: special.country_code,
      country_code: special.country_code,
      region_filter: normalized.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      granularity: special.granularity,
      confidence: 0.95,
      source: 'local_dictionary'
    };
  }

  // Step 2: Check city hints (high-confidence local matches)
  const cityHint = CITY_HINTS[normalized];
  if (cityHint && cityHint.confidence >= 0.7) {
    const granularity = GRANULARITY_BY_COUNTRY[cityHint.country_code] || 'region';
    return {
      country: cityHint.country_code,
      country_code: cityHint.country_code,
      region_filter: cityHint.region,
      granularity,
      confidence: cityHint.confidence,
      source: 'city_hints'
    };
  }

  // Step 3: Try existing region code mapper
  const mappedCode = getRegionCode(text);
  if (mappedCode && mappedCode.length === 2 && !mappedCode.includes(' ')) {
    // Successfully mapped to ISO alpha-2
    const granularity = GRANULARITY_BY_COUNTRY[mappedCode] || 'region';
    return {
      country: mappedCode,
      country_code: mappedCode,
      granularity,
      confidence: 0.85,
      source: 'local_dictionary'
    };
  }

  // Step 4: Fallback to GeoNames geocoding
  try {
    console.log(`🔍 No local match for "${text}", falling back to GeoNames geocoding...`);
    const geocoded: GeocodeResult = await geocodePlace(text);
    
    // Determine granularity based on country and admin levels
    let granularity = GRANULARITY_BY_COUNTRY[geocoded.country_code] || 'region';
    
    // Special case: London uses boroughs
    if (geocoded.admin1?.toLowerCase().includes('london') && geocoded.country_code === 'GB') {
      granularity = 'borough';
    }
    
    // Use admin1 as region filter, fallback to admin2
    const regionFilter = geocoded.admin1 || geocoded.admin2;
    
    return {
      country: geocoded.country,
      country_code: geocoded.country_code,
      region_filter: regionFilter,
      granularity,
      confidence: geocoded.confidence,
      source: 'geocoder'
    };
  } catch (error: any) {
    console.error(`❌ Failed to resolve location "${text}":`, error.message);
    
    // Ultimate fallback: return as-is with low confidence
    return {
      country: text,
      country_code: text.toUpperCase().substring(0, 2),
      granularity: 'region',
      confidence: 0.3,
      source: 'local_dictionary'
    };
  }
}
