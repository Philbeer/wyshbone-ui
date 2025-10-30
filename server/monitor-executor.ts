import { getUncachableResendClient } from './resend-client';
import { formatMonitorResultEmail, type MonitorResult } from './email-templates';
import { startBackgroundResponsesJob } from './deepResearch';
import { storage } from './storage';

export interface ScheduledMonitor {
  id: string;
  userId: string;
  label: string;
  description: string;
  monitorType: 'deep_research' | 'business_search' | 'google_places';
  emailNotifications: number;
  config?: any;
}

export async function executeMonitorAndNotify(monitor: ScheduledMonitor, userEmail?: string): Promise<void> {
  console.log(`📊 Executing monitor: ${monitor.label} (${monitor.id})`);
  
  const results = await executeMonitor(monitor);
  
  // For testing, use hardcoded email - replace with actual user email in production
  const recipientEmail = userEmail || 'phil@listersbrewery.com';
  
  if (monitor.emailNotifications === 1) {
    await sendMonitorResultEmail(monitor, recipientEmail, results);
  }
}

async function executeMonitor(monitor: ScheduledMonitor): Promise<any> {
  console.log(`🔍 Executing ${monitor.monitorType} monitor...`);
  
  if (monitor.monitorType === 'deep_research') {
    return await executeDeepResearch(monitor);
  }
  
  // Other monitor types not yet implemented
  return {
    totalResults: 0,
    summary: `${monitor.monitorType} execution not yet implemented.`,
  };
}

async function executeDeepResearch(monitor: ScheduledMonitor): Promise<any> {
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
        
        return {
          totalResults: countResults(updatedRun.outputText || ''),
          summary: teaser,
          fullOutput: updatedRun.outputText,
          runId: updatedRun.id,
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

function countResults(output: string): number {
  if (!output) return 0;
  
  // Count markdown list items (- or * at start of line)
  const listItems = output.match(/^[\-\*]\s/gm);
  if (listItems) return listItems.length;
  
  // Count numbered items (1. 2. etc)
  const numberedItems = output.match(/^\d+\.\s/gm);
  if (numberedItems) return numberedItems.length;
  
  // Count paragraphs as fallback
  const paragraphs = output.split('\n\n').filter(p => p.trim().length > 50);
  return Math.max(paragraphs.length, 1);
}

async function sendMonitorResultEmail(
  monitor: ScheduledMonitor, 
  userEmail: string, 
  results: any
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    // Use onboarding@resend.dev for testing since custom domain may not be verified
    // In production, you'd use a verified domain email
    const testFrom = 'onboarding@resend.dev';
    
    const monitorResult: MonitorResult = {
      monitorLabel: monitor.label,
      monitorType: monitor.monitorType,
      description: monitor.description,
      runDate: new Date(),
      totalResults: results.totalResults,
      summary: results.summary,
    };
    
    const { subject, html } = formatMonitorResultEmail(monitorResult);
    
    console.log(`📧 Sending email to ${userEmail} from ${testFrom}`);
    
    const response = await client.emails.send({
      from: testFrom,
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
