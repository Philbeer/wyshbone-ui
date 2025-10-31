import fs from 'fs';

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

export function formatMonitorResultEmail(
  result: MonitorResult
): { subject: string; html: string } {
  const {
    monitorLabel,
    monitorType,
    description,
    runDate,
    summary,
    totalResults,
    conversationId,
  } = result;

  const typeLabel =
    monitorType === 'deep_research'
      ? 'Deep Research'
      : monitorType === 'business_search'
      ? 'Business Search'
      : 'Google Places';

  const formattedDate = runDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const formattedTime = runDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const subject = `Wyshbone AI Monitor Results: ${monitorLabel} - ${formattedDate}`;

  const baseUrl = `https://${
    process.env.REPLIT_DEV_DOMAIN ||
    (process.env.REPLIT_DOMAINS?.split(',')[0]) ||
    'your-app.replit.app'
  }`;

  const reportHref = `${baseUrl}${
    conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ''
  }`;

  let INLINE_LOGO_BASE64 = '';
  
  try {
    const logoPath = 'attached_assets/wyshbone-logo_1761839337577.png';
    const logoBuffer = fs.readFileSync(logoPath);
    INLINE_LOGO_BASE64 = logoBuffer.toString('base64');
  } catch (error) {
    console.error('Failed to load logo:', error);
  }

  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${subject}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
  body { margin: 0; padding: 0; background-color: #f4f4f4; }
  .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .logo-section { text-align: center; padding: 20px 20px 10px; }
  .brand-logo { width: 96px; height: 96px; margin: 0 auto; }
  .monitor-header { padding: 10px 20px 0; text-align: left; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
  .monitor-header h1 { margin: 0 0 8px; font-size: 22px; color: #153e52; font-weight: 700; line-height: 1.3; }
  .badge { display: inline-block; background-color: #2b7a78; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; letter-spacing: 0.5px; }
  .content { padding: 18px 20px 28px; color: #333; line-height: 1.6; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
  .info-box { background-color: #f8f9fa; border-left: 4px solid #2b7a78; padding: 14px; margin: 18px 0; border-radius: 4px; color: #444; font-size: 14px; }
  .info-box h3 { margin: 0 0 8px; font-size: 13px; color: #2b7a78; text-transform: uppercase; letter-spacing: 0.5px; }
  .stats { display: flex; justify-content: center; gap: 28px; margin: 20px 0; padding: 18px 12px; background-color: #f8f9fa; border-radius: 8px; }
  .stat { text-align: center; }
  .stat-value { font-size: 28px; font-weight: 800; color: #2b7a78; line-height: 1.1; }
  .stat-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .summary { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 18px 0; background-color: #ffffff; }
  .summary h3 { margin: 0 0 8px; color: #153e52; font-size: 16px; }
  .summary p { color: #555; font-size: 15px; line-height: 1.7; margin: 0; }
  .cta-wrap { text-align: center; margin-top: 26px; }
  .button { display: inline-block; background-color: #2b7a78; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; }
  .footer { text-align: center; font-size: 12px; color: #777; background-color: #f8f9fa; padding: 16px; }
</style>
</head>
<body>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td align="center" style="padding: 16px;">
        <div class="container">
          ${INLINE_LOGO_BASE64 ? `
          <div class="logo-section">
            <img class="brand-logo" src="data:image/png;base64,${INLINE_LOGO_BASE64}" width="96" height="96" alt="Wyshbone AI Logo" />
          </div>
          ` : ''}

          <div class="monitor-header">
            <h1>${escapeHtml(monitorLabel)}</h1>
            <span class="badge">${escapeHtml(typeLabel)}</span>
          </div>

          <div class="content">
            <p>Your scheduled monitor has completed its run.</p>

            <div class="info-box">
              <h3>Monitor Details</h3>
              <p><strong>Description:</strong> ${escapeHtml(description)}</p>
              <p><strong>Run Date:</strong> ${formattedDate} at ${formattedTime}</p>
              <p><strong>Type:</strong> ${escapeHtml(typeLabel)}</p>
            </div>

            ${
              typeof totalResults === 'number'
                ? `
            <div class="stats">
              <div class="stat">
                <div class="stat-value">${totalResults}</div>
                <div class="stat-label">Results Found</div>
              </div>
            </div>`
                : ''
            }

            ${
              summary
                ? `
            <div class="summary">
              <h3>🔍 Research Preview</h3>
              <p>${escapeHtml(summary)}</p>
              <p style="margin-top: 14px; padding: 12px; background-color: #e8f4f3; border-left: 3px solid #2b7a78; font-size: 13px; color: #2b7a78;">
                <strong>💡 Want to see more?</strong> Click below to view the complete research report with all findings, sources, and detailed analysis.
              </p>
            </div>`
                : ''
            }

            <div class="cta-wrap">
              <a href="${reportHref}" class="button">📊 View Full Report</a>
              <p style="margin-top: 10px; font-size: 12px; color: #999;">Open your Wyshbone dashboard to see all findings</p>
            </div>
          </div>

          <div class="footer">
            <p>This is an automated email from your Wyshbone monitoring system.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { subject, html };
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
