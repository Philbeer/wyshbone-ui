// Deterministic location resolver using strict matching rules
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCountryCode, getCountryName } from './countryLoader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CityHint {
  city: string;
  country_code: string;
  admin1: string;
  preferred_granularity: string;
}

export interface ResolvedLocation {
  business_type: string;
  country: string;
  country_code: string;
  granularity: 'country' | 'state' | 'province' | 'county' | 'borough' | 'region' | 'prefecture' | 'municipality' | 'city';
  region_filter?: string;
  confidence: number;
  note?: string;
  needs_clarification?: boolean;
  options?: Array<{country: string; country_code: string; region_filter?: string}>;
}

// City hints loaded at startup
const CITY_MAP = new Map<string, CityHint>();

// Default granularity per country
const GRANULARITY_MAP: Record<string, string> = {
  'GB': 'county',
  'US': 'state',
  'AU': 'state',
  'IE': 'county',
  'CA': 'province',
  'NZ': 'region',
  'VN': 'region',
  'TH': 'region',
  'IN': 'state',
  'CN': 'municipality',
  'JP': 'prefecture',
  'KR': 'city',
  'FR': 'region',
  'DE': 'state',
  'ES': 'region',
  'IT': 'region',
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function loadCityHints() {
  try {
    const jsonPath = join(__dirname, 'data', 'city_hints.json');
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const cities: CityHint[] = JSON.parse(jsonContent);
    
    for (const city of cities) {
      CITY_MAP.set(normalize(city.city), city);
    }
    
    console.log(`✅ Loaded ${CITY_MAP.size} city hints`);
  } catch (error: any) {
    console.error('❌ Failed to load city hints:', error.message);
  }
}

/**
 * Extract business and place from free-text input
 * Handles patterns like "X in Y", "X, Y", "X Y"
 */
function extractParts(input: string): { business_text: string; place_text: string } {
  const trimmed = input.trim();
  
  // Pattern: "X in Y"
  const inMatch = trimmed.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    return { business_text: inMatch[1].trim(), place_text: inMatch[2].trim() };
  }
  
  // Pattern: "X, Y" (comma-separated)
  const commaMatch = trimmed.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    return { business_text: commaMatch[1].trim(), place_text: commaMatch[2].trim() };
  }
  
  // Try to detect if last 1-2 words are a location
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    // Check if last word is a country or city
    const lastWord = words[words.length - 1];
    const last2Words = words.slice(-2).join(' ');
    
    if (getCountryCode(lastWord) || CITY_MAP.has(normalize(lastWord))) {
      return {
        business_text: words.slice(0, -1).join(' '),
        place_text: lastWord
      };
    }
    
    if (getCountryCode(last2Words) || CITY_MAP.has(normalize(last2Words))) {
      return {
        business_text: words.slice(0, -2).join(' '),
        place_text: last2Words
      };
    }
  }
  
  // Default: treat entire input as business_text, no place
  return { business_text: trimmed, place_text: '' };
}

/**
 * Deterministic location resolver
 */
export async function resolveLocation(input: {
  business_text?: string;
  place_text?: string;
  raw_message?: string;
}): Promise<ResolvedLocation> {
  
  let business_text = input.business_text || '';
  let place_text = input.place_text || '';
  
  // If raw_message provided, extract parts
  if (input.raw_message && !business_text && !place_text) {
    const extracted = extractParts(input.raw_message);
    business_text = extracted.business_text;
    place_text = extracted.place_text;
  }
  
  // Normalize
  business_text = business_text.trim();
  place_text = place_text.trim();
  
  // STEP 1: If no business type, needs clarification
  if (!business_text) {
    return {
      business_type: '',
      country: '',
      country_code: '',
      granularity: 'country',
      confidence: 0,
      needs_clarification: true,
      note: 'Missing business type'
    };
  }
  
  // STEP 2: Try strict country resolution
  const countryCode = getCountryCode(place_text);
  if (countryCode) {
    const countryName = getCountryName(countryCode) || place_text;
    const granularity = GRANULARITY_MAP[countryCode] || 'region';
    
    return {
      business_type: business_text,
      country: countryName,
      country_code: countryCode,
      granularity: granularity as any,
      confidence: 1.0,
      note: `Country match: ${countryName}`
    };
  }
  
  // STEP 3: Try city hints
  const cityHint = CITY_MAP.get(normalize(place_text));
  if (cityHint) {
    const countryName = getCountryName(cityHint.country_code) || cityHint.country_code;
    
    // Special case: London should use borough granularity
    const granularity = cityHint.admin1 === 'London' 
      ? 'borough' 
      : (cityHint.preferred_granularity as any);
    
    return {
      business_type: business_text,
      country: countryName,
      country_code: cityHint.country_code,
      granularity,
      region_filter: cityHint.admin1,
      confidence: 1.0,
      note: `City match: ${cityHint.city} in ${cityHint.admin1}, ${countryName}`
    };
  }
  
  // STEP 4: If no place provided, needs clarification
  if (!place_text) {
    return {
      business_type: business_text,
      country: '',
      country_code: '',
      granularity: 'country',
      confidence: 0,
      needs_clarification: true,
      note: 'Missing location'
    };
  }
  
  // STEP 5: Unknown location - needs clarification
  return {
    business_type: business_text,
    country: '',
    country_code: '',
    granularity: 'country',
    confidence: 0.3,
    needs_clarification: true,
    note: `Unknown location: ${place_text}`
  };
}

/**
 * Format a resolved location for display
 */
export function formatResolution(res: ResolvedLocation): string {
  if (!res.country_code) {
    return `${res.business_type} (location unknown)`;
  }
  
  if (res.region_filter) {
    return `${res.business_type} in ${res.region_filter}, ${res.country} (${res.country_code})`;
  }
  
  return `${res.business_type} in ${res.country} (${res.country_code})`;
}
