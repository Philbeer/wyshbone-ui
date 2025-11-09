import { getUncachableResendClient } from './resend-client';
import { formatMonitorResultEmail, type MonitorResult } from './email-templates';
import { startBackgroundResponsesJob } from './deepResearch';
import { storage } from './storage';
import { getOrCreateConversation } from './memory';
import crypto from 'crypto';
import { analyzeMonitorResults, executeAutonomousDeepDive, type AgenticAnalysisResult } from './agentic-analysis';

export interface ScheduledMonitor {
  id: string;
  userId: string;
  conversationId?: string | null;
  label: string;
  description: string;
  monitorType: 'deep_research' | 'business_search' | 'wyshbone_database' | 'place_search';
  emailNotifications: number;
  emailAddress?: string | null;
  config?: any;
}

export async function executeMonitorAndNotify(monitor: ScheduledMonitor, userEmail?: string): Promise<void> {
  console.log(`📊 Executing monitor: ${monitor.label} (${monitor.id})`);
  
  // Get all previous runs to determine the next sequence number
  const previousRuns = await storage.listMonitorRunConversations(monitor.id);
  const nextSequence = previousRuns.length + 1;
  
  // Find or create a SINGLE conversation for this monitor
  let conversationId: string;
  
  if (previousRuns.length > 0) {
    // Use the existing monitor conversation
    conversationId = previousRuns[0].id;
    console.log(`📝 Using existing monitor conversation: ${conversationId} (Run #${nextSequence})`);
  } else {
    // First run - create a new conversation
    conversationId = crypto.randomUUID();
    await storage.createConversation({
      id: conversationId,
      userId: monitor.userId,
      label: monitor.label,
      type: 'monitor_run',
      monitorId: monitor.id,
      runSequence: 1,
      createdAt: Date.now(),
    });
    console.log(`📝 Created new monitor conversation: ${conversationId} (First run)`);
  }
  
  const results = await executeMonitor(monitor, conversationId, nextSequence);
  
  // Get recipient email: prioritize monitor.emailAddress (dev override), then user's login email
  const loginEmail = await storage.getUserEmail(monitor.userId);
  const recipientEmail = monitor.emailAddress || loginEmail || 'phil@listersbrewery.com';
  
  console.log(`📬 Email recipient: ${monitor.emailAddress ? `${recipientEmail} (override)` : `${recipientEmail} (login email)`}`);
  
  // 🤖 AGENTIC URGENCY HANDLING
  // Send email if monitor has notifications enabled
  // Agentic analysis determines urgency level (immediate or normal)
  if (monitor.emailNotifications === 1) {
    const urgency = results.agenticAnalysis?.urgency || 'normal';
    console.log(`📧 Sending email notification (urgency: ${urgency})`);
    await sendMonitorResultEmail(monitor, recipientEmail, results, conversationId, monitor.userId);
  }
}

async function executeMonitor(monitor: ScheduledMonitor, conversationId: string, runSequence: number): Promise<any> {
  console.log(`🔍 Executing ${monitor.monitorType} monitor...`);
  
  if (monitor.monitorType === 'deep_research') {
    return await executeDeepResearch(monitor, conversationId, runSequence);
  }
  
  if (monitor.monitorType === 'place_search') {
    // Convert place_search to deep_research format
    const config = monitor.config || {};
    const searchQuery = `Find ${config.query || 'places'} in ${config.location || 'the area'}${config.country ? ` (${config.country})` : ''}. List all results with names and details.`;
    console.log(`📍 Converted place_search to deep research query: ${searchQuery}`);
    
    // Create a modified monitor that uses deep_research
    const deepResearchMonitor = {
      ...monitor,
      description: searchQuery,
      monitorType: 'deep_research' as any
    };
    
    return await executeDeepResearch(deepResearchMonitor, conversationId, runSequence);
  }
  
  // Other monitor types not yet implemented
  return {
    totalResults: 0,
    summary: `${monitor.monitorType} execution not yet implemented.`,
  };
}

async function executeDeepResearch(monitor: ScheduledMonitor, conversationId: string, runSequence: number): Promise<any> {
  try {
    console.log(`🔬 Starting deep research for: ${monitor.description}`);
    
    // Start the research job
    const run = await startBackgroundResponsesJob({
      prompt: monitor.description,
      label: monitor.label,
      mode: 'report',
      intensity: 'standard',
    });
    
    console.log(`🔬 Research job created: ${run.id}, waiting for completion...`);
    
    // Poll for completion (max 5 minutes)
    const maxAttempts = 60; // 60 attempts * 5 seconds = 5 minutes
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
      
      const updatedRun = await storage.getDeepResearchRun(run.id);
      if (!updatedRun) {
        throw new Error('Research run not found');
      }
      
      console.log(`🔬 Poll ${attempts}/${maxAttempts}: status=${updatedRun.status}`);
      
      if (updatedRun.status === 'completed') {
        console.log(`✅ Research completed successfully`);
        
        // Extract summary/teaser from the results
        const teaser = extractTeaser(updatedRun.outputText || '');
        const fullOutput = updatedRun.outputText || '';
        
        console.log(`🔍 DEBUG: Output length=${fullOutput.length}, first 200 chars: ${fullOutput.substring(0, 200)}`);
        
        // Extract current venue names (already deduplicated and filtered)
        const currentVenues = extractVenueNames(fullOutput);
        const currentResultCount = currentVenues.length;
        
        console.log(`🔍 DEBUG: Extracted ${currentResultCount} unique active venues from output:`, currentVenues.slice(0, 5));
        
        // Get previous venue list from monitor config for trend detection
        const previousVenues: string[] = monitor.config?.previousVenues || [];
        let newResults = 0;
        
        console.log(`🔍 DEBUG: Previous venues count=${previousVenues.length}`);
        
        if (previousVenues.length > 0) {
          // Find venues that are in current but NOT in ALL previous runs (genuinely new discoveries)
          // Use normalized names for comparison to handle variations like "Wendy's" vs "Wendy's (drive-thru)"
          const previousVenueSet = new Set(previousVenues.map(v => normalizeVenueName(v)));
          const newVenues = currentVenues.filter(v => !previousVenueSet.has(normalizeVenueName(v)));
          newResults = newVenues.length;
          
          console.log(`📊 Trend Detection: Historical=${previousVenues.length} total venues across all runs, Current=${currentResultCount} venues, New=${newResults} venues`);
          if (newResults > 0) {
            console.log(`🆕 New venues (not in any previous run): ${newVenues.join(', ')}`);
          } else {
            console.log(`ℹ️ No new venues found (all ${currentResultCount} venues were already discovered in previous runs)`);
          }
        } else {
          // **FIRST RUN: All results are "new" since there's nothing to compare against**
          newResults = currentResultCount;
          console.log(`ℹ️ First run - all ${currentResultCount} venues are new. Storing for next comparison.`);
          if (newResults > 0) {
            console.log(`🆕 New venues (first run): ${currentVenues.join(', ')}`);
          }
        }
        
        // **CRITICAL: Accumulate ALL historical venues, don't overwrite**
        // This ensures we compare against ALL previous runs, not just the most recent one
        // Deduplicate based on normalized names but keep the most detailed version
        const venueMap = new Map<string, string>();
        
        // Add previous venues first
        for (const venue of previousVenues) {
          const normalized = normalizeVenueName(venue);
          if (!venueMap.has(normalized) || venue.length > (venueMap.get(normalized)?.length || 0)) {
            venueMap.set(normalized, venue);
          }
        }
        
        // Add current venues, preferring longer (more detailed) versions
        for (const venue of currentVenues) {
          const normalized = normalizeVenueName(venue);
          if (!venueMap.has(normalized) || venue.length > (venueMap.get(normalized)?.length || 0)) {
            venueMap.set(normalized, venue);
          }
        }
        
        const allHistoricalVenues = Array.from(venueMap.values());
        
        // Store updated venues in a variable for later batch config update
        console.log(`📊 Prepared venue update: added ${currentVenues.length} current venues, total historical venues: ${allHistoricalVenues.length}`);
        
        // Save research results to conversation (with run number separator)
        const runDate = new Date().toLocaleDateString('en-GB', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        });
        const runTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
        // 🤖 AGENTIC INTELLIGENCE: Analyze results and decide on autonomous actions (BEFORE creating messages)
        const agenticAnalysis = await analyzeMonitorResults(monitor, {
          totalResults: currentResultCount,
          newResults,
          summary: teaser,
          fullOutput,
        }, runSequence);
        
        // ✨ SMART SUMMARY MODE: Create concise, actionable summary instead of overwhelming full output
        const smartSummary = `📊 **${monitor.label}** - Run #${runSequence}
**${runDate} at ${runTime}**

**Results:** ${newResults > 0 ? `🆕 ${newResults} new` : '✓ No changes'} (${currentResultCount} total)

**🤖 AI Analysis:** ${agenticAnalysis.significance.toUpperCase()} significance

**💡 Key Findings:**
${agenticAnalysis.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${agenticAnalysis.requiresDeepDive ? `\n**🔍 Follow-Up:** AI triggered deeper research on ${agenticAnalysis.deepDiveFocus}` : ''}

${agenticAnalysis.urgency === 'immediate' ? '🚨 **Immediate attention recommended**' : ''}

---
📧 ${monitor.emailNotifications === 1 ? 'Full report sent to your email' : 'Email notifications disabled'}
_Full research data stored in monitor history_`;
        
        // Save ONLY the smart summary to chat (not the overwhelming full output)
        await storage.createMessage({
          id: crypto.randomUUID(),
          conversationId,
          role: 'assistant',
          content: smartSummary,
          createdAt: Date.now(),
        });
        
        console.log(`💾 Saved smart summary for run #${runSequence} to conversation ${conversationId}`);
        
        // Execute autonomous deep dive if analysis determined it's warranted
        let deepDiveResult = null;
        if (agenticAnalysis.requiresDeepDive) {
          console.log(`🤖 [AGENTIC] Executing autonomous deep dive...`);
          deepDiveResult = await executeAutonomousDeepDive(
            agenticAnalysis,
            monitor,
            conversationId,
            runSequence
          );
        }
        
        // BATCH ALL CONFIG UPDATES: Refetch latest config to avoid overwriting concurrent changes
        const latestMonitor = await storage.getScheduledMonitor(monitor.id);
        const latestConfig = (latestMonitor?.config as any) || {};
        
        // Build merged config with all updates
        const mergedConfig = {
          ...latestConfig,
          previousVenues: allHistoricalVenues, // Update from venue tracking above
        };
        
        // Add AI's suggested prompt refinement if present (stored for user review, NOT auto-applied)
        if (agenticAnalysis.suggestedNextPrompt) {
          console.log(`🤖 [AGENTIC] AI suggested prompt refinement (stored for user review, not auto-applied)`);
          mergedConfig.suggestedPrompt = agenticAnalysis.suggestedNextPrompt;
          mergedConfig.suggestionDate = Date.now();
        }
        
        // Add deep dive counter if present (managed by agentic-analysis.ts)
        if (deepDiveResult && latestConfig.autonomousDeepDiveCount !== undefined) {
          mergedConfig.autonomousDeepDiveCount = latestConfig.autonomousDeepDiveCount;
          mergedConfig.deepDiveCountResetDate = latestConfig.deepDiveCountResetDate;
        }
        
        // Single atomic config update with all changes
        await storage.updateScheduledMonitor(monitor.id, {
          config: mergedConfig,
          updatedAt: Date.now(),
        });
        
        console.log(`💾 Updated monitor config with all changes (venues, AI suggestions, counters)`);
        
        return {
          totalResults: currentResultCount,
          newResults,
          summary: teaser,
          fullOutput,
          runId: updatedRun.id,
          agenticAnalysis,
          deepDiveResult,
        };
      }
      
      if (updatedRun.status === 'failed') {
        throw new Error('Research job failed');
      }
    }
    
    throw new Error('Research job timeout after 5 minutes');
    
  } catch (error) {
    console.error('❌ Deep research execution failed:', error);
    return {
      totalResults: 0,
      summary: `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function normalizeVenueName(name: string): string {
  // Remove parenthetical details like "(drive-thru)", "(closure)", "(unverified)", etc.
  // Also normalize whitespace and case for comparison
  return name
    .replace(/\s*\([^)]*\)/g, '') // Remove anything in parentheses
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase();
}

function extractTeaser(output: string): string {
  if (!output || output.trim().length === 0) {
    return 'Research completed but no results were generated.';
  }
  
  // Extract first few paragraphs or up to 300 characters as a teaser
  const lines = output.split('\n').filter(line => line.trim().length > 0);
  let teaser = '';
  
  for (const line of lines) {
    // Skip markdown headers that are just section markers
    if (line.match(/^#{1,6}\s/)) continue;
    
    // Add content lines
    if (teaser.length + line.length < 300) {
      teaser += line + ' ';
    } else {
      break;
    }
  }
  
  teaser = teaser.trim();
  
  // If we have content, add ellipsis if truncated
  if (teaser.length > 0 && output.length > 300) {
    teaser += '...';
  }
  
  return teaser || 'View full results in the app for detailed findings.';
}

function extractVenueNames(output: string): string[] {
  if (!output) return [];
  
  const venues: string[] = [];
  const lines = output.split('\n');
  let inTable = false;
  let headerSkipped = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this is a table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip separator rows (contain only |, -, :, and spaces)
      if (/^\|[\s\-\:\|]+\|$/.test(trimmed)) {
        inTable = true;
        continue;
      }
      
      // Skip header row (first row in table)
      if (!headerSkipped && !inTable) {
        headerSkipped = true;
        continue;
      }
      
      if (inTable) {
        // Extract first column (venue name)
        const columns = trimmed.split('|').map(col => col.trim()).filter(col => col);
        if (columns.length > 0 && columns[0]) {
          // Clean up markdown links [Name](url) -> Name
          const venueName = columns[0].replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').trim();
          
          // Skip venues marked as closed/closure
          if (venueName && !/\(closure\)/i.test(venueName)) {
            venues.push(venueName);
          }
        }
      }
    }
  }
  
  // Deduplicate immediately after extraction
  return Array.from(new Set(venues.map(v => v.trim())));
}

function countResults(output: string): number {
  return extractVenueNames(output).length;
}

async function sendMonitorResultEmail(
  monitor: ScheduledMonitor, 
  userEmail: string, 
  results: any,
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const monitorResult: MonitorResult = {
      monitorLabel: monitor.label,
      monitorType: monitor.monitorType,
      description: monitor.description,
      runDate: new Date(),
      totalResults: results.totalResults,
      newResults: results.newResults,
      summary: results.summary,
      conversationId,
      userId,
      userEmail,
      agenticAnalysis: results.agenticAnalysis,
      deepDiveResult: results.deepDiveResult,
    };
    
    const { subject, html } = formatMonitorResultEmail(monitorResult);
    
    console.log(`📧 Sending email to ${userEmail} from ${fromEmail}`);
    
    const response = await client.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: subject,
      html: html,
    });
    
    console.log(`✅ Email sent successfully:`, response);
  } catch (error) {
    console.error('❌ Failed to send monitor result email:', error);
    throw error;
  }
}
