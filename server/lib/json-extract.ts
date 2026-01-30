/**
 * Robust JSON extraction utility for parsing model output
 * Handles common model formats: raw JSON, code fences, prose, multiple blocks
 */

export interface JsonExtractResult {
  success: boolean;
  data: any;
  error?: string;
  rawInput?: string;
}

/**
 * Extract and parse the first valid JSON object or array from model output
 * 
 * Handles:
 * - Raw JSON
 * - JSON inside ```json or ``` fences
 * - Prose before/after JSON
 * - Multiple JSON blocks (returns first valid one)
 * - Leading/trailing whitespace and BOM
 * - Both objects {} and arrays []
 * 
 * Does NOT silently accept partial JSON - must fully parse.
 */
export function extractJson(input: string): JsonExtractResult {
  if (!input || typeof input !== 'string') {
    return {
      success: false,
      data: null,
      error: 'Input is empty or not a string',
      rawInput: String(input).slice(0, 500)
    };
  }

  // Remove BOM and trim whitespace
  let cleaned = input.replace(/^\uFEFF/, '').trim();
  const originalInput = cleaned;

  // Strategy 1: Try direct parse first (fastest path for clean JSON)
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return { success: true, data: parsed };
    }
  } catch {
    // Continue to other strategies
  }

  // Strategy 2: Extract from code fences (```json ... ``` or ``` ... ```)
  const fencePatterns = [
    /```json\s*([\s\S]*?)```/i,
    /```\s*([\s\S]*?)```/
  ];

  for (const pattern of fencePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const fenceContent = match[1].trim();
      try {
        const parsed = JSON.parse(fenceContent);
        if (typeof parsed === 'object' && parsed !== null) {
          return { success: true, data: parsed };
        }
      } catch (e: any) {
        // Found code fence but invalid JSON inside
        return {
          success: false,
          data: null,
          error: `Found code fence but invalid JSON inside: ${e.message}`,
          rawInput: originalInput.slice(0, 500)
        };
      }
    }
  }

  // Strategy 3: Find first balanced JSON object or array
  const result = extractFirstBalancedJson(cleaned);
  if (result.success) {
    return result;
  }

  // Strategy 4: Try to find JSON after common prefixes like "Here is the JSON:"
  const prefixPatterns = [
    /(?:here(?:'s| is)(?: the)? (?:json|response|output|data)[:\s]*)/i,
    /(?:the (?:json|response|output|data) is[:\s]*)/i,
    /(?:json[:\s]*)/i
  ];

  for (const pattern of prefixPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      const afterPrefix = cleaned.slice(match.index + match[0].length).trim();
      const prefixResult = extractFirstBalancedJson(afterPrefix);
      if (prefixResult.success) {
        return prefixResult;
      }
    }
  }

  // No valid JSON found
  return {
    success: false,
    data: null,
    error: describeFailure(originalInput),
    rawInput: originalInput.slice(0, 500)
  };
}

/**
 * Extract the first balanced JSON object {} or array [] from a string
 */
function extractFirstBalancedJson(input: string): JsonExtractResult {
  // Find the first { or [
  let startIndex = -1;
  let startChar = '';
  let endChar = '';

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '{') {
      startIndex = i;
      startChar = '{';
      endChar = '}';
      break;
    }
    if (input[i] === '[') {
      startIndex = i;
      startChar = '[';
      endChar = ']';
      break;
    }
  }

  if (startIndex === -1) {
    return {
      success: false,
      data: null,
      error: 'No JSON object or array found (no { or [ character)',
      rawInput: input.slice(0, 500)
    };
  }

  // Count brackets to find the matching end
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = startIndex; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === startChar) {
      depth++;
    } else if (char === endChar) {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return {
      success: false,
      data: null,
      error: `Found ${startChar} at position ${startIndex} but brackets are unbalanced (unclosed)`,
      rawInput: input.slice(0, 500)
    };
  }

  const jsonCandidate = input.slice(startIndex, endIndex + 1);

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (typeof parsed === 'object' && parsed !== null) {
      return { success: true, data: parsed };
    }
    return {
      success: false,
      data: null,
      error: 'Parsed value is not an object or array',
      rawInput: input.slice(0, 500)
    };
  } catch (e: any) {
    return {
      success: false,
      data: null,
      error: `Found balanced braces but JSON parse failed: ${e.message}`,
      rawInput: input.slice(0, 500)
    };
  }
}

/**
 * Generate a descriptive error message based on what was found in the input
 */
function describeFailure(input: string): string {
  const hasCodeFence = /```/.test(input);
  const hasOpenBrace = input.includes('{');
  const hasOpenBracket = input.includes('[');
  const hasCloseBrace = input.includes('}');
  const hasCloseBracket = input.includes(']');

  if (hasCodeFence) {
    return 'Found code fence markers but could not extract valid JSON from inside';
  }

  if (hasOpenBrace && !hasCloseBrace) {
    return 'Found opening { but no closing } - incomplete JSON object';
  }

  if (hasOpenBracket && !hasCloseBracket) {
    return 'Found opening [ but no closing ] - incomplete JSON array';
  }

  if (hasOpenBrace || hasOpenBracket) {
    return 'Found JSON-like structure but could not parse - possibly malformed';
  }

  if (input.length === 0) {
    return 'Input is empty';
  }

  if (input.length < 10) {
    return `Input too short to be valid JSON: "${input}"`;
  }

  return 'No JSON object or array structure found in input';
}

/**
 * Convenience function that throws on failure with a detailed error
 */
export function extractJsonOrThrow(input: string): any {
  const result = extractJson(input);
  if (!result.success) {
    const error = new Error(result.error || 'JSON extraction failed');
    (error as any).rawInput = result.rawInput;
    throw error;
  }
  return result.data;
}
