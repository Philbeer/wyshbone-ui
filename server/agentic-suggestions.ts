/**
 * AGENTIC SUGGESTION ENGINE
 * 
 * This module implements proactive monitor suggestions based on business context analysis.
 * The AI analyzes user facts and existing monitors to suggest strategic new monitoring opportunities.
 */

import OpenAI from 'openai';
import { storage } from './storage';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export interface MonitorSuggestion {
  label: string;
  description: string;
  monitorType: 'deep_research' | 'business_search' | 'wyshbone_database';
  schedule: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  scheduleDay?: string;
  scheduleTime?: string;
  reasoning: string;
  strategicValue: string; // Why this helps the business
  config?: any;
}

export interface SuggestionThrottleCheck {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  maxAllowed: number;
}

/**
 * Check if user can receive more monitor suggestions (throttling)
 */
export async function canSuggestMonitors(userId: string): Promise<SuggestionThrottleCheck> {
  const MAX_ACTIVE_SUGGESTIONS = 3;
  const currentCount = await storage.countActiveSuggestions(userId);
  
  if (currentCount >= MAX_ACTIVE_SUGGESTIONS) {
    return {
      allowed: false,
      reason: `Already have ${currentCount} pending suggestions. Approve or reject existing suggestions first.`,
      currentCount,
      maxAllowed: MAX_ACTIVE_SUGGESTIONS,
    };
  }
  
  return {
    allowed: true,
    currentCount,
    maxAllowed: MAX_ACTIVE_SUGGESTIONS,
  };
}

/**
 * Generate strategic monitor suggestions based on business context
 */
export async function generateMonitorSuggestions(
  userId: string,
  trigger: 'conversation' | 'daily_analysis' = 'conversation'
): Promise<MonitorSuggestion[]> {
  console.log(`🤖 [SUGGESTIONS] Generating monitor suggestions for user ${userId} (trigger: ${trigger})`);
  
  // Load business context
  const userFacts = await storage.listTopFacts(userId, 20);
  const existingMonitors = await storage.listScheduledMonitors(userId);
  
  if (userFacts.length === 0) {
    console.log(`ℹ️ [SUGGESTIONS] No facts available for user ${userId} - cannot generate suggestions`);
    return [];
  }
  
  console.log(`📊 [SUGGESTIONS] Context: ${userFacts.length} facts, ${existingMonitors.length} existing monitors`);
  
  // Build context for AI
  const businessContext = userFacts
    .filter(f => ['industry', 'place', 'subject', 'preference'].includes(f.category))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)
    .map(f => f.fact)
    .join('\n   - ');
  
  const monitorSummary = existingMonitors
    .filter(m => m.status === 'active')
    .map(m => `${m.label}: ${m.description} (${m.schedule})`)
    .join('\n   - ');
  
  const suggestionPrompt = `You are an agentic AI assistant analyzing a business owner's profile to suggest strategic monitoring opportunities.

**User's Business Context:**
${businessContext || '(No specific business context available)'}

**Current Active Monitors:**
${monitorSummary || '(No monitors set up yet)'}

**Your Task:**
Analyze this business and suggest 1-3 NEW monitor ideas that would help them find customers or business opportunities. Think strategically:

1. **Geographic Expansion**: If they're in one area, suggest adjacent regions (e.g., West Sussex → East Sussex)
2. **Complementary Opportunities**: Related business types or events (e.g., brewery → beer festivals)
3. **Market Intelligence**: Track competitors, suppliers, or industry trends
4. **Seasonal Opportunities**: Events, festivals, or seasonal business opportunities

**Critical Rules:**
- DO NOT suggest monitors that duplicate existing ones
- Focus on NEW CUSTOMER opportunities aligned with their business
- Be specific with search descriptions (not vague)
- Consider their geographic location and delivery radius
- Prioritize high-value opportunities

Respond with a JSON array of suggestions (0-3 suggestions):

[
  {
    "label": "Short descriptive label",
    "description": "Specific search query (what to monitor)",
    "monitorType": "deep_research",
    "schedule": "daily" | "weekly" | "biweekly" | "monthly",
    "scheduleTime": "09:00" (optional),
    "reasoning": "Why this is strategically valuable - reference their business context",
    "strategicValue": "What customer opportunities this could uncover",
    "config": {} (optional, e.g., {"intensity": "standard"})
  }
]

If you can't think of valuable suggestions, return an empty array [].`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: suggestionPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    
    const result = JSON.parse(response.choices[0]?.message?.content || '{"suggestions":[]}');
    const suggestions: MonitorSuggestion[] = result.suggestions || result || [];
    
    console.log(`✅ [SUGGESTIONS] Generated ${suggestions.length} monitor suggestions`);
    return Array.isArray(suggestions) ? suggestions : [];
    
  } catch (error) {
    console.error(`❌ [SUGGESTIONS] Error generating suggestions:`, error);
    return [];
  }
}

/**
 * Create suggested monitors in the database
 */
export async function createSuggestedMonitors(
  userId: string,
  suggestions: MonitorSuggestion[]
): Promise<string[]> {
  const createdIds: string[] = [];
  
  for (const suggestion of suggestions) {
    const monitorId = `monitor_suggested_${crypto.randomUUID()}`;
    
    await storage.createScheduledMonitor({
      id: monitorId,
      userId,
      label: suggestion.label,
      description: suggestion.description,
      monitorType: suggestion.monitorType,
      schedule: suggestion.schedule,
      scheduleDay: suggestion.scheduleDay || null,
      scheduleTime: suggestion.scheduleTime || '09:00',
      config: suggestion.config || {},
      isActive: 0, // Inactive until approved
      status: 'suggested',
      suggestedBy: 'ai',
      suggestedReason: suggestion.reasoning,
      suggestionMetadata: {
        strategicValue: suggestion.strategicValue,
        generatedAt: Date.now(),
      },
      emailNotifications: 0,
      emailAddress: null,
      conversationId: null,
      nextRunAt: null,
      lastRunAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    createdIds.push(monitorId);
    console.log(`✅ [SUGGESTIONS] Created suggested monitor: ${suggestion.label} (${monitorId})`);
  }
  
  return createdIds;
}

/**
 * Main entry point: Analyze context and create suggestions
 */
export async function analyzeAndSuggestMonitors(
  userId: string,
  trigger: 'conversation' | 'daily_analysis' = 'conversation'
): Promise<{
  suggested: boolean;
  suggestionsCreated: number;
  reason?: string;
}> {
  // Check throttling
  const throttleCheck = await canSuggestMonitors(userId);
  if (!throttleCheck.allowed) {
    return {
      suggested: false,
      suggestionsCreated: 0,
      reason: throttleCheck.reason,
    };
  }
  
  // Generate suggestions
  const suggestions = await generateMonitorSuggestions(userId, trigger);
  
  if (suggestions.length === 0) {
    return {
      suggested: false,
      suggestionsCreated: 0,
      reason: 'No valuable suggestions generated based on current context',
    };
  }
  
  // Create suggested monitors
  const createdIds = await createSuggestedMonitors(userId, suggestions);
  
  return {
    suggested: true,
    suggestionsCreated: createdIds.length,
  };
}
