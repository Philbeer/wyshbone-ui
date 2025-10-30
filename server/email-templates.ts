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
      width: 64px;
      height: 64px;
      background-color: #ffffff;
      border-radius: 50%;
      margin: 0 auto 16px;
      padding: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .logo img {
      width: 100%;
      height: 100%;
      display: block;
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
        <img src="data:image/png;base64,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" alt="Wyshbone AI" />
      </div>
    </div>
    
    <div class="brand-section">
      <p class="brand-name">Wyshbone AI</p>
    </div>
    
    <div class="monitor-header">
      <h1>${monitorLabel}</h1>
      <span class="badge" style="background-color: #2b7a78; color: #ffffff;">${typeLabel}</span>
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
        <a href="https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'your-app.replit.app'}${conversationId ? `?conversation=${conversationId}` : ''}" class="button" style="color: #ffffff !important; font-size: 16px; padding: 14px 32px;">📊 View Full Report</a>
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
