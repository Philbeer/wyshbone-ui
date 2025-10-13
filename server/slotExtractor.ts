// Deterministic slot extractor for business search queries
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Slots {
  query: string;
  position?: string;
  location?: string;
  country?: string;
  country_code?: string;
  granularity?: string;
  region_filter?: string;
  needs_clarification?: boolean;
  question?: string;
}

// Maps for country resolution
const NAME_TO_CODE = new Map<string, string>();
const CODE_TO_NAME = new Map<string, string>();

// City hints for quick lookup
let CITY_HINTS: Array<{city: string; country_code: string; admin1: string; preferred_granularity: string}> = [];

/**
 * Load country codes from CSV
 */
export function loadCountryCodes() {
  const csvPath = join(__dirname, 'data', 'country_codes.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    const [country, code] = lines[i].split(',').map(s => s.trim());
    if (country && code) {
      const normalized = country.toLowerCase();
      NAME_TO_CODE.set(normalized, code.toUpperCase());
      CODE_TO_NAME.set(code.toUpperCase(), country);
    }
  }
  
  console.log(`✅ Slot extractor loaded ${NAME_TO_CODE.size} country mappings`);
}

/**
 * Load city hints (optional)
 */
export function loadCityHints() {
  try {
    const hintsPath = join(__dirname, 'data', 'city_hints.json');
    const hintsContent = readFileSync(hintsPath, 'utf-8');
    CITY_HINTS = JSON.parse(hintsContent);
    console.log(`✅ Slot extractor loaded ${CITY_HINTS.length} city hints`);
  } catch (err) {
    console.log('⚠️  No city_hints.json found, skipping city inference');
  }
}

/**
 * Parse free text into raw components
 */
function parseFreeText(message: string): {
  raw_query: string;
  raw_position?: string;
  raw_place?: string;
} {
  const normalized = message.toLowerCase().trim();
  let workingMessage = message;
  
  // Extract position first (CEO, director, owner, manager, etc.)
  const positions = ['head of sales', 'ceo', 'director', 'owner', 'manager', 'cfo', 'cto', 'coo'];
  let raw_position: string | undefined;
  
  for (const pos of positions) {
    if (normalized.includes(pos)) {
      raw_position = pos;
      // Remove position from working message
      workingMessage = workingMessage.replace(new RegExp(pos, 'gi'), '').trim();
      break;
    }
  }
  
  // Extract location using "in <place>" pattern first
  let raw_place: string | undefined;
  const inPattern = /\b(?:in|at)\s+([^,]+(?:,\s*[^,]+)?)/i;
  const inMatch = workingMessage.match(inPattern);
  if (inMatch) {
    raw_place = inMatch[1].trim();
    workingMessage = workingMessage.replace(inPattern, '').trim();
  } else {
    // Try to find a country or known city at the end of the message
    const words = workingMessage.split(/\s+/);
    const lastWord = words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, '');
    const lastTwoWords = words.slice(-2).join(' ').toLowerCase();
    
    // Check if last word(s) is a country
    if (NAME_TO_CODE.has(lastWord)) {
      raw_place = words[words.length - 1];
      workingMessage = words.slice(0, -1).join(' ').trim();
    } else if (NAME_TO_CODE.has(lastTwoWords)) {
      raw_place = words.slice(-2).join(' ');
      workingMessage = words.slice(0, -2).join(' ').trim();
    } else if (CITY_HINTS.some(hint => hint.city.toLowerCase() === lastTwoWords)) {
      // Known city at the end
      raw_place = words.slice(-2).join(' ');
      workingMessage = words.slice(0, -2).join(' ').trim();
    } else if (CITY_HINTS.some(hint => hint.city.toLowerCase() === lastWord)) {
      raw_place = words[words.length - 1];
      workingMessage = words.slice(0, -1).join(' ').trim();
    }
  }
  
  // Extract query (what remains after removing position and location)
  let raw_query = workingMessage
    .replace(/\b(find|search|look for|get|show me|for)\b/gi, '') // Remove action verbs
    .trim();
  
  // Clean up extra spaces and commas
  raw_query = raw_query.replace(/\s+/g, ' ').replace(/^,+|,+$/g, '').trim();
  
  return { raw_query, raw_position, raw_place };
}

/**
 * Fill slots from parsed components
 */
export function fillSlots(message: string, previousContext?: Partial<Slots>): Slots {
  const parsed = parseFreeText(message);
  
  const slots: Slots = {
    query: parsed.raw_query || previousContext?.query || '',
    position: parsed.raw_position || previousContext?.position,
    location: previousContext?.location,
    country: previousContext?.country,
    country_code: previousContext?.country_code,
  };
  
  // Try to resolve raw_place
  if (parsed.raw_place) {
    const placeLower = parsed.raw_place.toLowerCase().trim();
    
    // Check if it's a direct country match
    if (NAME_TO_CODE.has(placeLower)) {
      slots.country_code = NAME_TO_CODE.get(placeLower);
      slots.country = CODE_TO_NAME.get(slots.country_code!);
      slots.granularity = 'country';
      // No location - this is a country-level search
    } else {
      // Check for "city, country" pattern
      const parts = parsed.raw_place.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const [city, countryPart] = parts;
        const countryLower = countryPart.toLowerCase();
        
        if (NAME_TO_CODE.has(countryLower)) {
          slots.location = city;
          slots.country_code = NAME_TO_CODE.get(countryLower);
          slots.country = CODE_TO_NAME.get(slots.country_code!);
          slots.granularity = 'city'; // Will be refined later
        } else {
          // Unknown country in "city, country" format
          slots.location = city;
          slots.needs_clarification = true;
          slots.question = `Which country is "${countryPart}" in? For example, you could say "United Kingdom" or "GB".`;
        }
      } else {
        // Single token - treat as location, try to infer country from city hints
        slots.location = parsed.raw_place;
        
        // Check city hints
        const cityHint = CITY_HINTS.find(
          hint => hint.city.toLowerCase() === placeLower
        );
        if (cityHint) {
          slots.country_code = cityHint.country_code.toUpperCase();
          slots.country = CODE_TO_NAME.get(slots.country_code);
          slots.granularity = cityHint.preferred_granularity;
        } else {
          // Can't determine country - need clarification
          slots.needs_clarification = true;
          slots.question = `Which country is "${parsed.raw_place}" in? For example, you could say "United Kingdom (GB)" or just "UK".`;
        }
      }
    }
  }
  
  // Check if message contains a country mention elsewhere (not after "in")
  if (!slots.country_code) {
    const words = message.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (NAME_TO_CODE.has(cleaned)) {
        slots.country_code = NAME_TO_CODE.get(cleaned);
        slots.country = CODE_TO_NAME.get(slots.country_code!);
        if (!slots.location) {
          slots.granularity = 'country';
        }
        break;
      }
    }
  }
  
  // Determine granularity based on country_code and location
  if (slots.country_code && !slots.granularity) {
    if (slots.location) {
      // Check if location is a known state/region
      const locLower = slots.location.toLowerCase();
      
      // US states
      if (slots.country_code === 'US') {
        const usStates = ['california', 'texas', 'new york', 'florida', 'illinois', 'ohio'];
        if (usStates.includes(locLower) || locLower.includes('texas')) {
          slots.granularity = 'state';
          slots.region_filter = slots.location;
        } else {
          slots.granularity = 'city';
        }
      }
      // UK counties/cities
      else if (slots.country_code === 'GB') {
        slots.granularity = 'city'; // Default to city for UK
      }
      // Other countries
      else {
        slots.granularity = 'city';
      }
    } else {
      slots.granularity = 'country';
    }
  }
  
  return slots;
}

/**
 * Handle clarification response
 */
export function handleClarification(originalSlots: Slots, clarificationMessage: string): Slots {
  const clarLower = clarificationMessage.toLowerCase().trim();
  
  // Try to extract country from clarification
  if (NAME_TO_CODE.has(clarLower)) {
    const country_code = NAME_TO_CODE.get(clarLower);
    const country = CODE_TO_NAME.get(country_code!);
    
    return {
      ...originalSlots,
      country,
      country_code,
      granularity: originalSlots.location ? 'city' : 'country',
      needs_clarification: false,
      question: undefined
    };
  }
  
  // Try words in the message
  const words = clarificationMessage.split(/\s+/);
  for (const word of words) {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (NAME_TO_CODE.has(cleaned)) {
      const country_code = NAME_TO_CODE.get(cleaned);
      const country = CODE_TO_NAME.get(country_code!);
      
      return {
        ...originalSlots,
        country,
        country_code,
        granularity: originalSlots.location ? 'city' : 'country',
        needs_clarification: false,
        question: undefined
      };
    }
  }
  
  // Still couldn't determine - ask again
  return {
    ...originalSlots,
    needs_clarification: true,
    question: `I still couldn't determine the country. Please provide a country name like "United Kingdom", "India", or "Vietnam".`
  };
}

/**
 * Test the slot extractor
 */
export function testSlotExtractor() {
  console.log('\n🧪 Testing Slot Extractor:');
  
  const tests = [
    'find pubs in Kendal',
    'find pubs in Kendal, United Kingdom',
    'ice cream makers in Vietnam',
    'CEO ice cream manufacturer Vietnam',
    'dentists new york'
  ];
  
  for (const test of tests) {
    const result = fillSlots(test);
    console.log(`\n   Input: "${test}"`);
    console.log(`   → Query: "${result.query}"`);
    if (result.position) console.log(`   → Position: "${result.position}"`);
    if (result.location) console.log(`   → Location: "${result.location}"`);
    if (result.country) console.log(`   → Country: "${result.country}" (${result.country_code})`);
    if (result.granularity) console.log(`   → Granularity: "${result.granularity}"`);
    if (result.needs_clarification) {
      console.log(`   → ❓ Question: "${result.question}"`);
    } else {
      console.log(`   → ✅ Ready`);
    }
  }
  
  console.log('');
}
