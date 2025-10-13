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
  source?: 'local_dictionary' | 'city_hints' | 'geocoder' | 'explicit_country';
}

// Country code to full name mapping
const COUNTRY_NAMES: Record<string, string> = {
  'GB': 'United Kingdom',
  'US': 'United States',
  'IN': 'India',
  'AU': 'Australia',
  'CA': 'Canada',
  'IE': 'Ireland',
  'NZ': 'New Zealand',
  'DE': 'Germany',
  'FR': 'France',
  'ES': 'Spain',
  'IT': 'Italy',
  'JP': 'Japan',
  'CN': 'China',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'AR': 'Argentina',
  'CL': 'Chile',
  'CO': 'Colombia',
  'PE': 'Peru',
  'ZA': 'South Africa',
  'KE': 'Kenya',
  'NG': 'Nigeria',
  'EG': 'Egypt',
  'SA': 'Saudi Arabia',
  'AE': 'United Arab Emirates',
  'TR': 'Turkey',
  'RU': 'Russia',
  'PL': 'Poland',
  'NL': 'Netherlands',
  'BE': 'Belgium',
  'SE': 'Sweden',
  'NO': 'Norway',
  'DK': 'Denmark',
  'FI': 'Finland',
  'SG': 'Singapore',
  'VN': 'Vietnam',
  'TH': 'Thailand',
  'KR': 'South Korea',
  'ID': 'Indonesia',
  'MY': 'Malaysia',
  'PH': 'Philippines',
  'PK': 'Pakistan',
  'BD': 'Bangladesh',
};

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
  // UK Cities & Regions
  'london': { country_code: 'GB', region: 'London', confidence: 0.95 },
  'manchester': { country_code: 'GB', region: 'Greater Manchester', confidence: 0.9 },
  'birmingham': { country_code: 'GB', region: 'West Midlands', confidence: 0.9 },
  'liverpool': { country_code: 'GB', region: 'Merseyside', confidence: 0.9 },
  'leeds': { country_code: 'GB', region: 'West Yorkshire', confidence: 0.9 },
  'bristol': { country_code: 'GB', region: 'Bristol', confidence: 0.9 },
  'glasgow': { country_code: 'GB', region: 'Glasgow City', confidence: 0.9 },
  'edinburgh': { country_code: 'GB', region: 'City of Edinburgh', confidence: 0.9 },
  'aberdeen': { country_code: 'GB', region: 'Aberdeen City', confidence: 0.9 },
  'chichester': { country_code: 'GB', region: 'West Sussex', confidence: 0.9 },
  'brighton': { country_code: 'GB', region: 'East Sussex', confidence: 0.9 },
  'oxford': { country_code: 'GB', region: 'Oxfordshire', confidence: 0.9 },
  'cambridge': { country_code: 'GB', region: 'Cambridgeshire', confidence: 0.9 },
  'beckington': { country_code: 'GB', region: 'Somerset', confidence: 0.9 },
  'devizes': { country_code: 'GB', region: 'Wiltshire', confidence: 0.9 },
  'scotland': { country_code: 'GB', confidence: 0.95 },
  'wales': { country_code: 'GB', confidence: 0.95 },
  'northern ireland': { country_code: 'GB', confidence: 0.95 },
  'england': { country_code: 'GB', confidence: 0.95 },
  
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
  'hanoi': { country_code: 'VN', region: 'Hanoi', confidence: 0.95 },
  'ho chi minh': { country_code: 'VN', region: 'Ho Chi Minh City', confidence: 0.95 },
  'ho chi minh city': { country_code: 'VN', region: 'Ho Chi Minh City', confidence: 0.95 },
  'saigon': { country_code: 'VN', region: 'Ho Chi Minh City', confidence: 0.95 },
  'jakarta': { country_code: 'ID', region: 'Jakarta', confidence: 0.95 },
  'manila': { country_code: 'PH', region: 'Metro Manila', confidence: 0.95 },
  'kuala lumpur': { country_code: 'MY', region: 'Kuala Lumpur', confidence: 0.95 },
  
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
  
  // Country-level hints (no specific region, for whole-country searches)
  'india': { country_code: 'IN', confidence: 0.95 },
  'france': { country_code: 'FR', confidence: 0.95 },
  'germany': { country_code: 'DE', confidence: 0.95 },
  'spain': { country_code: 'ES', confidence: 0.95 },
  'italy': { country_code: 'IT', confidence: 0.95 },
  'japan': { country_code: 'JP', confidence: 0.95 },
  'china': { country_code: 'CN', confidence: 0.95 },
  'brazil': { country_code: 'BR', confidence: 0.95 },
  'mexico': { country_code: 'MX', confidence: 0.95 },
  'argentina': { country_code: 'AR', confidence: 0.95 },
  'south africa': { country_code: 'ZA', confidence: 0.95 },
  'nigeria': { country_code: 'NG', confidence: 0.95 },
  'egypt': { country_code: 'EG', confidence: 0.95 },
  'turkey': { country_code: 'TR', confidence: 0.95 },
  'russia': { country_code: 'RU', confidence: 0.95 },
  'poland': { country_code: 'PL', confidence: 0.95 },
  'netherlands': { country_code: 'NL', confidence: 0.95 },
  'belgium': { country_code: 'BE', confidence: 0.95 },
  'sweden': { country_code: 'SE', confidence: 0.95 },
  'norway': { country_code: 'NO', confidence: 0.95 },
  'denmark': { country_code: 'DK', confidence: 0.95 },
  'finland': { country_code: 'FI', confidence: 0.95 },
  'switzerland': { country_code: 'CH', confidence: 0.95 },
  'austria': { country_code: 'AT', confidence: 0.95 },
  'portugal': { country_code: 'PT', confidence: 0.95 },
  'greece': { country_code: 'GR', confidence: 0.95 },
  'vietnam': { country_code: 'VN', confidence: 0.95 },
  'thailand': { country_code: 'TH', confidence: 0.95 },
  'south korea': { country_code: 'KR', confidence: 0.95 },
  'korea': { country_code: 'KR', confidence: 0.95 },
  'indonesia': { country_code: 'ID', confidence: 0.95 },
  'malaysia': { country_code: 'MY', confidence: 0.95 },
  'philippines': { country_code: 'PH', confidence: 0.95 },
  'pakistan': { country_code: 'PK', confidence: 0.95 },
  'bangladesh': { country_code: 'BD', confidence: 0.95 },
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
  
  // Try to extract city/region with country context (handles "city, UK" or "city UK")
  let extractedCountry: string | null = null;
  let extractedPlace: string | null = null;
  
  for (const [abbrev, fullCountry] of Object.entries(countryAbbrevs)) {
    // Handle patterns with comma: "Tring, UK"
    if (normalized.endsWith(`, ${abbrev}`)) {
      extractedPlace = normalized.slice(0, -(abbrev.length + 2)).trim();
      extractedCountry = abbrev;
      break;
    }
    if (normalized.endsWith(`, ${fullCountry}`)) {
      extractedPlace = normalized.slice(0, -(fullCountry.length + 2)).trim();
      extractedCountry = abbrev;
      break;
    }
    // Handle patterns with space: "Tring UK"
    if (normalized.endsWith(` ${abbrev}`)) {
      extractedPlace = normalized.slice(0, -(abbrev.length + 1)).trim();
      extractedCountry = abbrev;
      break;
    }
    if (normalized.endsWith(` ${fullCountry}`)) {
      extractedPlace = normalized.slice(0, -(fullCountry.length + 1)).trim();
      extractedCountry = abbrev;
      break;
    }
  }
  
  // If we extracted a place and country, return with high confidence
  if (extractedPlace && extractedCountry) {
    // Check if the place is in CITY_HINTS first
    const testHint = CITY_HINTS[extractedPlace];
    if (testHint) {
      normalized = extractedPlace;
    } else {
      // Place not in hints, but we know the country - return with medium-high confidence
      const countryCode = getRegionCode(extractedCountry);
      const granularity = GRANULARITY_BY_COUNTRY[countryCode] || 'county';
      
      return {
        country_code: countryCode,
        country: COUNTRY_NAMES[countryCode] || extractedCountry.toUpperCase(),
        region_filter: extractedPlace.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        granularity,
        confidence: 0.8, // High confidence because country was explicitly stated
        source: 'explicit_country'
      };
    }
  }
  
  // Step 1: Check special granularity cases
  const special = SPECIAL_GRANULARITY[normalized];
  if (special) {
    const defaultGranularity = GRANULARITY_BY_COUNTRY[special.country_code] || 'region';
    return {
      country: COUNTRY_NAMES[special.country_code] || special.country_code,
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
      country: COUNTRY_NAMES[cityHint.country_code] || cityHint.country_code,
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
      country: COUNTRY_NAMES[mappedCode] || mappedCode,
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
    
    // Ultimate fallback: Use text as region filter but set country_code to 'UNKNOWN'
    // This prevents accidentally creating invalid ISO codes (e.g., "CH" from "Chichester")
    return {
      country: 'Unknown',
      country_code: 'UNKNOWN',
      region_filter: text,
      granularity: 'region',
      confidence: 0.2,
      note: `Could not determine country for location "${text}". Please specify the country.`,
      source: 'local_dictionary'
    };
  }
}
