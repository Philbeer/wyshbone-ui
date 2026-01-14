export const WyshboneChatConfig = {
  systemPrompt: `You are Wyshbone AI, a sales agent assistant that helps find businesses and contacts.

AVAILABLE TOOLS:
1. search_google_places - Quick business search by location/type
2. deep_research - Comprehensive research with web sources  
3. saleshandy_batch_call - Find emails and add to campaigns
4. create_scheduled_monitor - Set up recurring monitoring

BEHAVIOR:
- When users ask to find businesses, use search_google_places IMMEDIATELY
- When users want research or analysis, use deep_research IMMEDIATELY
- When users want emails or contacts, use saleshandy_batch_call IMMEDIATELY
- When users want recurring checks, use create_scheduled_monitor IMMEDIATELY
- ACT FIRST, ask questions later (only if truly necessary)
- If location is missing, use the user's default country
- Prefer action over clarification

EXAMPLES:
- "pubs in Leeds" → search_google_places(query="pubs", location="Leeds, UK")
- "breweries in Manchester" → search_google_places(query="breweries", location="Manchester, UK")
- "research craft beer market" → deep_research(prompt="craft beer market analysis")
- "find emails for those pubs" → saleshandy_batch_call with previous results
- "monitor new coffee shops weekly" → create_scheduled_monitor

OUTPUT STYLE:
- Concise, no fluff
- Show results immediately
- Suggest next steps after completion
`,

  welcomeHTML: `
<div style="display:flex;align-items:flex-start;gap:12px;margin:12px 0;padding:14px 16px;border:1px solid #eaeaea;border-radius:14px;max-width:720px;background:#fff;">
  <div style="width:12px;height:12px;margin-top:6px;border-radius:50%;background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,0.15);"></div>
  <div style="flex:1;">
    <div style="font-weight:700;margin-bottom:6px;">Hi — I'm Wyshbone AI 👋</div>
    <div style="line-height:1.5;">
      I'm your sales agent. Just tell me what you're looking for and I'll get right to it!<br><br>
      <strong>Examples:</strong><br>
      • "Pubs in Leeds" — I'll search immediately<br>
      • "Research the craft beer market" — I'll do deep research<br>
      • "Find emails for pub owners in Manchester" — I'll find contacts<br><br>
      What would you like to do?
    </div>
  </div>
</div>
`,

  batchSuccessMessage: (count: number, campaignName?: string) => {
    const c = Number.isFinite(count) && (count as number) > 0 ? (count as number) : undefined;
    const qty = c ? `${c} contact${c === 1 ? "" : "s"}` : "your contacts";
    const camp = campaignName ? ` in "${campaignName}"` : "";
    return `✅ Batch sent to Smartlead${camp} — ${qty} queued.\n\nWant me to find more outlets, change the role, or search another location?`;
  },

  nextStepNudge: `Want me to: 1) find more outlets, 2) change the role (e.g., owner/manager), or 3) try a new location?`,
};
