// Slot-filling FSM for deterministic conversation flow
import { resolveLocation, formatResolution, type ResolvedLocation } from './locationResolver';

interface SlotContext {
  business_type?: string;
  place_text?: string;
  country?: string;
  country_code?: string;
  granularity?: string;
  region_filter?: string;
  raw_message?: string;
  last_question?: string;
  awaiting_country_for?: string; // Track location waiting for country clarification
}

interface SlotResult {
  ready: boolean;
  question?: string;
  slots?: {
    business_type: string;
    country: string;
    country_code: string;
    granularity: string;
    region_filter?: string;
  };
  resolution?: ResolvedLocation;
  nextContext?: SlotContext; // Context to save for next turn
}

/**
 * Ensure all required slots are filled
 * Returns either ready slots or a single clarifying question
 */
export async function ensureSlots(
  userMessage: string,
  prevContext?: SlotContext
): Promise<SlotResult> {
  
  // Merge context
  const context: SlotContext = {
    ...prevContext,
    raw_message: userMessage
  };
  
  // If we're awaiting country clarification and user just gave a country, combine them
  let messageToResolve = userMessage;
  let explicitBusinessType = context.business_type; // Preserve business type from context
  
  if (context.awaiting_country_for) {
    // User was asked about location, now they're providing country
    // Check if current message looks like just a country (no business type)
    const testResolution = await resolveLocation({ raw_message: userMessage });
    if (testResolution.country_code && !testResolution.business_type) {
      // They just said a country - combine with previous location AND business type
      const businessPrefix = explicitBusinessType ? `${explicitBusinessType} in ` : '';
      messageToResolve = `${businessPrefix}${context.awaiting_country_for}, ${userMessage}`;
      console.log(`🔗 Combining clarification: "${explicitBusinessType}" + "${context.awaiting_country_for}" + "${userMessage}" → "${messageToResolve}"`);
    }
  }
  
  // Try to resolve location from current message (or combined message)
  const resolution = await resolveLocation({
    raw_message: messageToResolve,
    business_text: explicitBusinessType,
    place_text: context.place_text
  });
  
  // Check if we have everything we need
  if (resolution.confidence >= 0.9 && resolution.business_type && resolution.country_code) {
    // All slots filled with high confidence
    return {
      ready: true,
      slots: {
        business_type: resolution.business_type,
        country: resolution.country,
        country_code: resolution.country_code,
        granularity: resolution.granularity,
        region_filter: resolution.region_filter
      },
      resolution
    };
  }
  
  // Need clarification - generate ONE question
  if (!resolution.business_type) {
    return {
      ready: false,
      question: "What type of businesses are you looking for?"
    };
  }
  
  if (!resolution.country_code || resolution.needs_clarification) {
    if (resolution.note && resolution.note.includes('Unknown location')) {
      const location = resolution.note.replace('Unknown location: ', '');
      return {
        ready: false,
        question: `I couldn't determine the country for "${location}". Could you please specify the country? For example, you could say "UK" or "United States" or "Vietnam".`,
        nextContext: {
          ...context,
          awaiting_country_for: location,
          business_type: resolution.business_type
        }
      };
    }
    
    return {
      ready: false,
      question: "What location would you like to search in?",
      nextContext: {
        ...context,
        business_type: resolution.business_type
      }
    };
  }
  
  // Medium confidence - ask for confirmation
  if (resolution.confidence < 0.9 && resolution.confidence >= 0.5) {
    const formatted = formatResolution(resolution);
    return {
      ready: false,
      question: `I'll search for ${formatted}. Is that correct?`
    };
  }
  
  // Low confidence - something is wrong
  return {
    ready: false,
    question: "I need more information. What type of businesses would you like to find, and in which location?"
  };
}

/**
 * Parse a confirmation response
 */
export function isConfirmation(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const confirmations = ['yes', 'yeah', 'yep', 'correct', 'right', 'ok', 'okay', 'sure', 'confirm'];
  return confirmations.some(conf => normalized.includes(conf));
}

/**
 * Parse a rejection response
 */
export function isRejection(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const rejections = ['no', 'nope', 'nah', 'wrong', 'incorrect', 'cancel'];
  return rejections.some(rej => normalized === rej || normalized.startsWith(rej + ' '));
}
