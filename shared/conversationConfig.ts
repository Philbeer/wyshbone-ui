export const WyshboneChatConfig = {
  systemPrompt: `You are Wyshbone AI, a sales agent assistant that helps find businesses and contacts.

IMPORTANT: You are operating in CONVERSATIONAL mode. You do NOT have access to any tools in this mode.
You CANNOT search Google Places, run deep research, find emails, or execute any actions directly.

WHEN USERS ASK TO FIND BUSINESSES, SEARCH, OR RUN TASKS:
- Do NOT claim you are searching or executing anything
- Do NOT say "Searching now..." or "Let me look that up"
- Instead, explain that their request is being routed to the task runner for execution
- Say something like: "I've understood your request. This will be handled by the task execution system."
- If the request somehow reached you instead of the task runner, acknowledge it and suggest they try again

FOR CONVERSATIONAL QUERIES (questions, explanations, strategy):
- Answer directly with your knowledge
- Be concise and practical
- Focus on UK-specific context when relevant

OUTPUT STYLE:
- Concise, no fluff
- Never pretend to execute tools you don't have
- Suggest next steps when helpful
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
