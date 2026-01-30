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
 * - JSON inside ```json or ``` fences (iterates through ALL fences)
 * - Prose before/after JSON
 * - Multiple JSON blocks (iterates through ALL and returns first valid one)
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
  const errors: string[] = [];

  // Strategy 1: Try direct parse first (fastest path for clean JSON)
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return { success: true, data: parsed };
    }
  } catch {
    // Continue to other strategies
  }

  // Strategy 2: Extract from ALL code fences and try each (using global regex)
  const fencePatterns = [
    /```json\s*([\s\S]*?)```/gi,
    /```\s*([\s\S]*?)```/g
  ];

  for (const pattern of fencePatterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      if (match[1]) {
        const fenceContent = match[1].trim();
        try {
          const parsed = JSON.parse(fenceContent);
          if (typeof parsed === 'object' && parsed !== null) {
            return { success: true, data: parsed };
          }
        } catch (e: any) {
          // Log error but continue to next fence
          errors.push(`Code fence at position ${match.index}: ${e.message}`);
        }
      }
    }
  }

  // Strategy 3: Find ALL balanced JSON objects/arrays and try each
  const candidates = extractAllBalancedJsonCandidates(cleaned);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.text);
      if (typeof parsed === 'object' && parsed !== null) {
        return { success: true, data: parsed };
      }
    } catch (e: any) {
      errors.push(`Balanced block at position ${candidate.start}: ${e.message}`);
    }
  }

  // Strategy 4: Try to find JSON after common prefixes like "Here is the JSON:"
  const prefixPatterns = [
    /(?:here(?:'s| is)(?: the)? (?:json|response|output|data)[:\s]*)/gi,
    /(?:the (?:json|response|output|data) is[:\s]*)/gi,
    /(?:json[:\s]*)/gi
  ];

  for (const pattern of prefixPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      if (match.index !== undefined) {
        const afterPrefix = cleaned.slice(match.index + match[0].length).trim();
        const prefixCandidates = extractAllBalancedJsonCandidates(afterPrefix);
        for (const candidate of prefixCandidates) {
          try {
            const parsed = JSON.parse(candidate.text);
            if (typeof parsed === 'object' && parsed !== null) {
              return { success: true, data: parsed };
            }
          } catch {
            // Continue to next candidate
          }
        }
      }
    }
  }

  // No valid JSON found - build error message
  let errorMessage = describeFailure(originalInput);
  if (errors.length > 0) {
    errorMessage += `. Attempted: ${errors.slice(0, 3).join('; ')}`;
    if (errors.length > 3) {
      errorMessage += ` (and ${errors.length - 3} more)`;
    }
  }

  return {
    success: false,
    data: null,
    error: errorMessage,
    rawInput: originalInput.slice(0, 500)
  };
}

interface JsonCandidate {
  text: string;
  start: number;
  end: number;
}

/**
 * Extract ALL balanced JSON objects {} and arrays [] from a string
 * Returns them in order of appearance
 */
function extractAllBalancedJsonCandidates(input: string): JsonCandidate[] {
  const candidates: JsonCandidate[] = [];
  let searchStart = 0;

  while (searchStart < input.length) {
    // Find the next { or [
    let startIndex = -1;
    let startChar = '';
    let endChar = '';

    for (let i = searchStart; i < input.length; i++) {
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
      // No more { or [ found
      break;
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

    if (endIndex !== -1) {
      // Found a balanced block
      candidates.push({
        text: input.slice(startIndex, endIndex + 1),
        start: startIndex,
        end: endIndex
      });
      // Continue searching after this block
      searchStart = endIndex + 1;
    } else {
      // Unbalanced - skip this opening bracket and continue
      searchStart = startIndex + 1;
    }
  }

  return candidates;
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
    return 'Found code fence markers but could not extract valid JSON from any of them';
  }

  if (hasOpenBrace && !hasCloseBrace) {
    return 'Found opening { but no closing } - incomplete JSON object';
  }

  if (hasOpenBracket && !hasCloseBracket) {
    return 'Found opening [ but no closing ] - incomplete JSON array';
  }

  if (hasOpenBrace || hasOpenBracket) {
    return 'Found JSON-like structures but none parsed successfully';
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
