export interface MonitorResult {
  monitorLabel: string;
  monitorType: 'deep_research' | 'business_search' | 'google_places';
  description: string;
  runDate: Date;
  results?: any;
  summary?: string;
  totalResults?: number;
  conversationId?: string;
}

export function formatMonitorResultEmail(result: MonitorResult): { subject: string; html: string } {
  const { monitorLabel, monitorType, description, runDate, summary, totalResults, conversationId } = result;
  
  const typeLabel = monitorType === 'deep_research' ? 'Deep Research' 
    : monitorType === 'business_search' ? 'Business Search' 
    : 'Google Places';
  
  const formattedDate = runDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  
  const formattedTime = runDate.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });
  
  const subject = `Wyshbone AI Monitor Results: ${monitorLabel} - ${formattedDate}`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #2b7a78 0%, #1f5b5a 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .logo {
      width: 48px;
      height: 48px;
      background-color: rgba(255,255,255,0.95);
      border-radius: 50%;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-circle {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #2b7a78 0%, #1f5b5a 100%);
      border-radius: 50%;
      position: relative;
    }
    .logo-circle::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      background-color: rgba(255,255,255,0.9);
      border-radius: 50%;
    }
    .brand-name {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      background-color: rgba(255,255,255,0.2);
      color: #ffffff;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      margin-top: 8px;
    }
    .content {
      padding: 30px 20px;
    }
    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid #2b7a78;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-box h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #2b7a78;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-box p {
      margin: 0;
      color: #555;
    }
    .stats {
      display: flex;
      justify-content: space-around;
      margin: 20px 0;
      padding: 20px;
      background-color: #f8f9fa;
      border-radius: 8px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #2b7a78;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 5px;
    }
    .summary {
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .summary h3 {
      margin-top: 0;
      color: #333;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .button {
      display: inline-block;
      background-color: #2b7a78;
      color: #ffffff !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 500;
    }
    .button:visited {
      color: #ffffff !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-circle"></div>
      </div>
      <div class="brand-name">Wyshbone AI</div>
      <h1>${monitorLabel}</h1>
      <span class="badge">${typeLabel}</span>
    </div>
    
    <div class="content">
      <p>Your scheduled monitor has completed its run.</p>
      
      <div class="info-box">
        <h3>Monitor Details</h3>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Run Date:</strong> ${formattedDate} at ${formattedTime}</p>
        <p><strong>Type:</strong> ${typeLabel}</p>
      </div>
      
      ${totalResults !== undefined ? `
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${totalResults}</div>
          <div class="stat-label">Results Found</div>
        </div>
      </div>
      ` : ''}
      
      ${summary ? `
      <div class="summary">
        <h3>🔍 Research Preview</h3>
        <p style="color: #555; font-size: 15px; line-height: 1.8;">${summary}</p>
        <p style="margin-top: 15px; padding: 12px; background-color: #e8f4f3; border-left: 3px solid #2b7a78; font-size: 13px; color: #2b7a78;">
          <strong>💡 Want to see more?</strong> Click below to view the complete research report with all findings, sources, and detailed analysis.
        </p>
      </div>
      ` : ''}
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.REPLIT_DEPLOYMENT_URL || 'https://your-app.replit.app'}${conversationId ? `?conversation=${conversationId}` : ''}" class="button" style="font-size: 16px; padding: 14px 32px;">📊 View Full Report</a>
        <p style="margin-top: 10px; font-size: 12px; color: #999;">Click to see complete findings in your Wyshbone dashboard</p>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated email from your Wyshbone monitoring system.</p>
      <p>To manage your monitors, visit your dashboard.</p>
    </div>
  </div>
</body>
</html>
  `;
  
  return { subject, html };
}
