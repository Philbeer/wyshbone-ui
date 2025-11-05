import OpenAI from 'openai';
import type { ScheduledMonitor } from './monitor-executor';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AgenticAnalysisResult {
  significance: 'high' | 'medium' | 'low';
  requiresDeepDive: boolean;
  deepDivePrompt?: string;
  deepDiveFocus?: string;
  urgency: 'immediate' | 'normal'; // Removed 'batched' - no delivery mechanism yet
  reasoning: string;
  suggestedNextPrompt?: string; // Stored for review, not auto-applied
  keyFindings: string[];
}

/**
 * Agentic Analysis System
 * 
 * This uses GPT-4 to analyze monitor results and make autonomous decisions about:
 * - Whether findings are significant enough to warrant deeper research
 * - What specific aspects to investigate further
 * - Whether to send immediate alerts or batch notifications
 * - How to adapt the monitor for future runs
 */
export async function analyzeMonitorResults(
  monitor: ScheduledMonitor,
  results: any,
  runSequence: number
): Promise<AgenticAnalysisResult> {
  console.log(`🤖 [AGENTIC] Analyzing monitor results for: ${monitor.label}`);

  try {
    const analysisPrompt = `You are an agentic AI system analyzing the results of a scheduled monitoring job.

**Monitor Details:**
- Label: ${monitor.label}
- Description: ${monitor.description}
- Run Sequence: #${runSequence}
- Type: ${monitor.monitorType}

**Current Results:**
- Total Results: ${results.totalResults || 0}
- New Results: ${results.newResults || 0}
- Summary: ${results.summary || 'No summary available'}

**Full Output (first 2000 characters):**
${(results.fullOutput || '').substring(0, 2000)}

**Your Task:**
Analyze these results and make autonomous decisions about follow-up actions.

**Decision Framework:**
1. **Significance Assessment**: Rate the findings as 'high', 'medium', or 'low' based on:
   - Number of new results vs. total results
   - Quality and relevance of findings
   - Unexpected discoveries or patterns
   - Business impact potential

2. **Deep Dive Decision**: Determine if automatic deeper research is warranted:
   - If significance is 'high' and there are specific aspects worth investigating
   - If there are anomalies or unexpected patterns
   - If initial findings reveal a trend that needs more data
   
3. **Urgency Level**: Decide notification urgency:
   - 'immediate': Critical findings that user should know about right away
   - 'normal': Scheduled email is fine (default for most findings)

4. **Adaptive Learning**: Suggest how to refine the monitor for next run:
   - Should the prompt focus on different aspects?
   - Are there patterns that suggest narrowing or broadening scope?

Respond with a JSON object (and ONLY JSON, no other text):
{
  "significance": "high" | "medium" | "low",
  "requiresDeepDive": boolean,
  "deepDivePrompt": "specific research question to investigate" (only if requiresDeepDive is true),
  "deepDiveFocus": "what aspect to focus on" (only if requiresDeepDive is true),
  "urgency": "immediate" | "normal",
  "reasoning": "brief explanation of your decision",
  "suggestedNextPrompt": "refined version of the monitor prompt for next run" (optional - stored for user review, not auto-applied),
  "keyFindings": ["finding 1", "finding 2", ...] (array of 2-5 key insights)
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an agentic AI system that makes autonomous decisions about research follow-ups and alert urgency. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent decision-making
      response_format: { type: 'json_object' },
    });

    const analysisText = response.choices[0]?.message?.content;
    if (!analysisText) {
      throw new Error('No analysis response from GPT');
    }

    const analysis: AgenticAnalysisResult = JSON.parse(analysisText);
    
    console.log(`🤖 [AGENTIC] Analysis complete:`);
    console.log(`   - Significance: ${analysis.significance}`);
    console.log(`   - Requires Deep Dive: ${analysis.requiresDeepDive}`);
    console.log(`   - Urgency: ${analysis.urgency}`);
    console.log(`   - Reasoning: ${analysis.reasoning}`);
    
    if (analysis.requiresDeepDive) {
      console.log(`   - Deep Dive Focus: ${analysis.deepDiveFocus}`);
      console.log(`   - Deep Dive Prompt: ${analysis.deepDivePrompt}`);
    }

    return analysis;
  } catch (error) {
    console.error('❌ [AGENTIC] Analysis failed:', error);
    
    // Fallback to conservative defaults if analysis fails
    return {
      significance: 'low',
      requiresDeepDive: false,
      urgency: 'normal',
      reasoning: 'Analysis failed, using conservative defaults',
      keyFindings: ['Analysis system encountered an error'],
    };
  }
}

/**
 * Configuration for autonomous deep dive budget controls
 */
interface DeepDiveBudgetConfig {
  enabled: boolean;
  maxPerDay: number;
  intensity: 'standard' | 'ultra';
}

const DEEP_DIVE_CONFIG: DeepDiveBudgetConfig = {
  enabled: true, // Can be disabled to turn off autonomous deep dives
  maxPerDay: 3, // Maximum autonomous deep dives per monitor per day
  intensity: 'standard', // Default to 'standard' instead of 'ultra' for cost control
};

/**
 * Check if autonomous deep dive is allowed based on budget controls
 */
async function canExecuteDeepDive(monitorId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!DEEP_DIVE_CONFIG.enabled) {
    return { allowed: false, reason: 'Autonomous deep dives are disabled' };
  }

  const { storage } = await import('./storage');
  
  // Check how many deep dives have run today for this monitor
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  
  const config = await storage.getScheduledMonitor(monitorId);
  const deepDiveCount = (config?.config as any)?.autonomousDeepDiveCount || 0;
  const lastResetDate = (config?.config as any)?.deepDiveCountResetDate || 0;
  
  // Reset counter if it's a new day
  if (lastResetDate < todayTimestamp) {
    return { allowed: true }; // New day, counter will be reset
  }
  
  if (deepDiveCount >= DEEP_DIVE_CONFIG.maxPerDay) {
    return { 
      allowed: false, 
      reason: `Daily limit reached (${deepDiveCount}/${DEEP_DIVE_CONFIG.maxPerDay} autonomous deep dives today)` 
    };
  }
  
  return { allowed: true };
}

/**
 * Execute an autonomous deep dive based on agentic analysis
 * WITH BUDGET CONTROLS to prevent runaway costs
 */
export async function executeAutonomousDeepDive(
  analysis: AgenticAnalysisResult,
  monitor: ScheduledMonitor,
  conversationId: string,
  runSequence: number
): Promise<any> {
  if (!analysis.requiresDeepDive || !analysis.deepDivePrompt) {
    return null;
  }
  
  // SAFETY CHECK: Verify budget allows deep dive
  const budgetCheck = await canExecuteDeepDive(monitor.id);
  if (!budgetCheck.allowed) {
    console.log(`🚫 [AGENTIC] Deep dive blocked: ${budgetCheck.reason}`);
    return {
      deepDiveCompleted: false,
      blocked: true,
      reason: budgetCheck.reason,
    };
  }

  console.log(`🤖 [AGENTIC] Initiating autonomous deep dive...`);
  console.log(`   - Focus: ${analysis.deepDiveFocus}`);
  console.log(`   - Prompt: ${analysis.deepDivePrompt}`);

  // Import here to avoid circular dependency
  const { startBackgroundResponsesJob } = await import('./deepResearch');
  const { storage } = await import('./storage');
  const crypto = await import('crypto');

  try {
    // Start autonomous deep dive research with configured intensity
    const deepDiveRun = await startBackgroundResponsesJob({
      prompt: analysis.deepDivePrompt,
      label: `${monitor.label} - Autonomous Follow-up`,
      mode: 'report',
      intensity: DEEP_DIVE_CONFIG.intensity, // Use configured intensity for cost control
    });

    console.log(`🤖 [AGENTIC] Deep dive job created: ${deepDiveRun.id}`);

    // Poll for completion (max 8 minutes for deep research)
    const maxAttempts = 96; // 96 * 5 seconds = 8 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const updatedRun = await storage.getDeepResearchRun(deepDiveRun.id);
      if (!updatedRun) {
        throw new Error('Deep dive run not found');
      }

      console.log(`🤖 [AGENTIC] Deep dive poll ${attempts}/${maxAttempts}: status=${updatedRun.status}`);

      if (updatedRun.status === 'completed') {
        console.log(`✅ [AGENTIC] Autonomous deep dive completed`);

        // Save deep dive results to the same conversation
        await storage.createMessage({
          id: crypto.randomUUID(),
          conversationId,
          role: 'user',
          content: `🤖 **Autonomous Deep Dive** (triggered by Run #${runSequence} findings)\n\n**Focus:** ${analysis.deepDiveFocus}\n\n**Research Question:** ${analysis.deepDivePrompt}`,
          createdAt: Date.now(),
        });

        await storage.createMessage({
          id: crypto.randomUUID(),
          conversationId,
          role: 'assistant',
          content: updatedRun.outputText || '',
          createdAt: Date.now() + 1,
        });

        console.log(`💾 [AGENTIC] Saved autonomous deep dive results to conversation`);
        
        // INCREMENT BUDGET COUNTER: Track successful deep dive execution
        // CRITICAL: Refetch latest config to preserve concurrent updates (venues, suggestions, etc.)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        
        const currentConfig = await storage.getScheduledMonitor(monitor.id);
        const latestConfig = (currentConfig?.config as any) || {};
        const lastResetDate = latestConfig.deepDiveCountResetDate || 0;
        const currentCount = lastResetDate < todayTimestamp ? 0 : (latestConfig.autonomousDeepDiveCount || 0);
        
        await storage.updateScheduledMonitor(monitor.id, {
          config: {
            ...latestConfig, // Use LATEST config, not original monitor.config
            autonomousDeepDiveCount: currentCount + 1,
            deepDiveCountResetDate: todayTimestamp,
          },
          updatedAt: Date.now(),
        });
        
        console.log(`📊 [AGENTIC] Updated deep dive counter: ${currentCount + 1}/${DEEP_DIVE_CONFIG.maxPerDay} used today`);

        return {
          deepDiveCompleted: true,
          deepDiveSummary: (updatedRun.outputText || '').substring(0, 300) + '...',
          deepDiveFocus: analysis.deepDiveFocus,
        };
      }

      if (updatedRun.status === 'failed') {
        throw new Error('Deep dive job failed');
      }
    }

    throw new Error('Deep dive timeout');
  } catch (error) {
    console.error('❌ [AGENTIC] Autonomous deep dive failed:', error);
    return {
      deepDiveCompleted: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
