// emailTemplate.ts (logo-inlined, no attachments, v2)

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

  // 🔒 Inline Base64 logo (from your uploaded image). No attachments. No CID.
  const INLINE_LOGO_BASE64 =
    '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';

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
  .header { background-color: #2b7a78; color: #ffffff; text-align: center; padding: 28px 20px 18px; }
  .brand-logo { width: 96px; height: 96px; margin: 0 auto 10px; }
  .brand-name { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size: 16px; font-weight: 600; letter-spacing: 0.4px; margin: 6px 0 0; color: #eaf6f6; }
  .monitor-header { padding: 20px 20px 0; text-align: left; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
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
          <!-- TOP HEADER WITH REAL LOGO (no circle) -->
          <div class="header">
            <img class="brand-logo" src="data:image/png;base64,${INLINE_LOGO_BASE64}" width="96" height="96" alt="Wyshbone AI Logo" />
            <div class="brand-name">Wyshbone AI • Monitor</div>
          </div>

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
            <p>Template: <em>logo-inline v2</em></p>
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

/** Minimal HTML escaper */
function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
