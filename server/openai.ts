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
  
  return prompt;
}
