// Load country codes from CSV and provide deterministic lookup
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CountryRecord {
  country: string;
  code: string;
}

// In-memory maps loaded at startup
export const COUNTRY_MAP = new Map<string, string>(); // normalized name -> code
export const CODE_TO_NAME = new Map<string, string>(); // code -> canonical name

// Common aliases for countries
const COUNTRY_ALIASES: Record<string, string> = {
  // UK variations
  'uk': 'GB',
  'united kingdom': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'great britain': 'GB',
  'britain': 'GB',
  
  // US variations
  'usa': 'US',
  'united states': 'US',
  'united states of america': 'US',
  'america': 'US',
  
  // Korea variations
  'south korea': 'KR',
  'korea south': 'KR',
  'korea': 'KR',
  'north korea': 'KP',
  'korea north': 'KP',
  
  // Other common variations
  'myanmar': 'MM',
  'burma': 'MM',
  'czechia': 'CZ',
  'czech republic': 'CZ',
  'ivory coast': 'CI',
  'swaziland': 'SZ',
  'uae': 'AE',
  'emirates': 'AE',
};

// Normalize text for matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ');    // collapse whitespace
}

// Load country codes from CSV
export function loadCountryCodes() {
  try {
    const csvPath = join(__dirname, 'data', 'country_codes.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1); // Skip header
    
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const [country, code] = trimmed.split(',').map(s => s.trim());
      if (!country || !code) continue;
      
      const normalizedCountry = normalize(country);
      COUNTRY_MAP.set(normalizedCountry, code);
      CODE_TO_NAME.set(code, country);
      count++;
    }
    
    // Add aliases
    for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
      COUNTRY_MAP.set(normalize(alias), code);
    }
    
    console.log(`✅ Loaded ${count} countries with ${Object.keys(COUNTRY_ALIASES).length} aliases`);
  } catch (error: any) {
    console.error('❌ Failed to load country codes:', error.message);
  }
}

/**
 * Get country code from input text (deterministic)
 * Returns uppercase 2-letter ISO code or null
 */
export function getCountryCode(inputText: string): string | null {
  if (!inputText) return null;
  
  const normalized = normalize(inputText);
  
  // 1. Try exact match in COUNTRY_MAP
  const code = COUNTRY_MAP.get(normalized);
  if (code) return code;
  
  // 2. If input is already a 2-letter code, return uppercase
  if (/^[a-z]{2}$/i.test(inputText.trim())) {
    return inputText.trim().toUpperCase();
  }
  
  // 3. No match
  return null;
}

/**
 * Get canonical country name from code
 */
export function getCountryName(code: string): string | null {
  return CODE_TO_NAME.get(code.toUpperCase()) || null;
}
