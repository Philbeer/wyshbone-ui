import { getUncachableResendClient } from './resend-client';
import { formatMonitorResultEmail, type MonitorResult } from './email-templates';

export interface ScheduledMonitor {
  id: string;
  userId: string;
  label: string;
  description: string;
  monitorType: 'deep_research' | 'business_search' | 'google_places';
  emailNotifications: number;
  config?: any;
}

export async function executeMonitorAndNotify(monitor: ScheduledMonitor, userEmail: string): Promise<void> {
  console.log(`📊 Executing monitor: ${monitor.label} (${monitor.id})`);
  
  const results = await executeMonitor(monitor);
  
  if (monitor.emailNotifications === 1 && userEmail) {
    await sendMonitorResultEmail(monitor, userEmail, results);
  }
}

async function executeMonitor(monitor: ScheduledMonitor): Promise<any> {
  console.log(`🔍 Executing ${monitor.monitorType} monitor...`);
  
  return {
    totalResults: 0,
    summary: 'Monitor execution is not yet implemented. This is a placeholder result.',
  };
}

async function sendMonitorResultEmail(
  monitor: ScheduledMonitor, 
  userEmail: string, 
  results: any
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const monitorResult: MonitorResult = {
      monitorLabel: monitor.label,
      monitorType: monitor.monitorType,
      description: monitor.description,
      runDate: new Date(),
      totalResults: results.totalResults,
      summary: results.summary,
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
