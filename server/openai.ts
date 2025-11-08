import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./memory";
import type { SessionContext } from "./lib/context";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
export const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export const WYSHBONE_SYSTEM_PROMPT = "You are Wyshbone AI. Be concise, practical, UK-focused. When you need data, call tools first.";

/**
 * Generate a personalized system prompt based on user context
 * Layers personalization ON TOP of the detailed SYSTEM_PROMPT to preserve all tool instructions
 * Progressive context gathering: start with basic info, adapt based on what we learn
 */
export function buildPersonalizedSystemPrompt(context?: SessionContext): string {
  // Start with the full detailed system prompt from memory.ts
  let prompt = SYSTEM_PROMPT.content;
  
  if (!context) {
    return prompt;
  }
  
  // Layer personalization on top of existing instructions
  // If we have company context, add personalized guidance
  if (context.companyName || context.companyDomain || context.inferredIndustry) {
    prompt += "\n\nCONTEXT AWARENESS:";
    
    if (context.companyName) {
      prompt += `\n- User works for: ${context.companyName}`;
    }
    
    if (context.companyDomain) {
      prompt += `\n- Company domain: ${context.companyDomain}`;
    }
    
    if (context.inferredIndustry) {
      prompt += `\n- Industry: ${context.inferredIndustry}`;
    }
    
    if (context.roleHint) {
      prompt += `\n- User role: ${context.roleHint}`;
    }
    
    if (context.primaryObjective) {
      prompt += `\n- Primary goal: ${context.primaryObjective}`;
    }
  }
  
  // CRITICAL: Add user's top facts for personalized suggestions
  if (context.topFacts && context.topFacts.length > 0) {
    prompt += "\n\nUSER'S KEY FACTS (RANKED BY IMPORTANCE):";
    prompt += "\nThese are the most important facts I've learned about this user. USE THESE when making suggestions.";
    
    // Group facts by category for better organization
    const factsByCategory: Record<string, typeof context.topFacts> = {};
    for (const fact of context.topFacts) {
      const category = fact.category || 'general';
      if (!factsByCategory[category]) {
        factsByCategory[category] = [];
      }
      factsByCategory[category].push(fact);
    }
    
    // Add facts grouped by category
    const categoryOrder = ['place', 'industry', 'subject', 'preference', 'general'];
    for (const category of categoryOrder) {
      const facts = factsByCategory[category];
      if (facts && facts.length > 0) {
        prompt += `\n\n${category.toUpperCase()}:`;
        for (const fact of facts) {
          prompt += `\n- ${fact.fact} (importance: ${fact.score}/100)`;
        }
      }
    }
    
    prompt += "\n\nIMPORTANT: When suggesting locations or industries, CHECK THESE FACTS FIRST.";
    prompt += "\nDo NOT suggest locations/industries that contradict or aren't mentioned in the user's facts.";
    prompt += "\nIf the user asks for suggestions and you have relevant facts, use THOSE facts - don't use generic knowledge.";
  }
  
  // Action-first guidance based on industry
  if (context.inferredIndustry && context.confidence && context.confidence > 50) {
    prompt += "\n\nPERSONALIZED GUIDANCE:";
    prompt += `\nWhen providing recommendations, prioritize solutions relevant to the ${context.inferredIndustry} industry.`;
    prompt += "\nSuggest specific, actionable next steps tailored to their business context.";
    prompt += "\nUse industry-specific terminology and examples when appropriate.";
  }
  
  // Progressive disclosure reminder
  prompt += "\n\nPROGRESSIVE CONTEXT:";
  prompt += "\n- Gather context naturally through conversation";
  prompt += "\n- Ask for clarification when recommendations require business-specific details";
  prompt += "\n- Confirm assumptions before acting on inferred context";
  prompt += "\n- ALWAYS check the user's key facts above before making suggestions about locations or industries";
  
  return prompt;
}
