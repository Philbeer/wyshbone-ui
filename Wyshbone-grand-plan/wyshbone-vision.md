What Wyshbone is (the core idea)

Wyshbone is not “a CRM with an AI chatbox.”

It’s a Vertical Autonomous Lead-Ops Agent (VALA): a system that behaves like a junior commercial operator who can:

decide what to do next (planning),

do it (execution),

check whether it worked (evaluation),

adjust strategy (feedback loops),

remember context and constraints (state/memory),

and keep operating over time (continuous loops).

The key difference is time + loops. It’s not a one-off answer machine. It’s a system that compounds usefulness because it repeatedly acts, measures outcomes, and reallocates effort.

Why it’s split into multiple repos

Wyshbone is split because you’re building a role, not a feature.

A real sales operator has:

a “face” you interact with (UI),

a “brain” that plans and executes (Supervisor),

a “manager” that evaluates and enforces standards (Tower),

and a “behaviour / judgement layer” that prevents dumb actions and makes it feel rational (WABS).

If you cram those into one app, you end up with a spaghetti chatbot that looks clever but can’t be trusted, can’t be debugged, and can’t reliably improve.

So the repos represent separation of responsibility:

UI: interaction and visibility

Supervisor: doing the work

Tower: quality, truth, and accountability

WABS: judgement, constraints, and “pushback”

The four parts
1) Wyshbone-UI (the cockpit)

What it is: The front end — where the user sees reality.

What it does:

Captures the user’s intent and constraints (what success is worth: value, budget, time, risk).

Shows plans, current run status, leads found, actions taken, nudges, and evidence.

Displays the “truth” of what happened (not vibes).

Why it matters:
If UI is weak, Wyshbone becomes “AI slop” — impressive text, no trust.
UI exists to make the agent’s work visible, inspectable, and controllable.

2) Wyshbone-Supervisor (the operator)

What it is: The execution brain. It turns goals into plans and plans into actions.

What it does:

Converts user goals into a concrete plan (steps, tools, checkpoints).

Executes steps: find leads, enrich data, verify, draft outreach, run sequences, log results.

Handles tool use: Google Places, scraping, enrichment APIs, email verification, outreach systems, etc.

Writes structured outputs (leads, actions, evidence links, statuses).

How to think about it:
Supervisor is the employee. It’s the thing that actually does work.

3) Wyshbone-Tower (the evaluator / control tower)

What it is: The oversight layer that makes Wyshbone safe, reliable, and improvable.

What it does:

Evaluates outputs: “Is this lead real?”, “Is this claim supported?”, “Did this step actually complete?”

Detects failure modes: hallucinated facts, weak sources, duplicates, spammy behaviour, low-confidence outputs.

Produces “nudges” back to Supervisor: fix, retry, change approach, or stop.

Maintains run logs, evidence trails, and reason codes (so you can debug and trust it).

Why it matters:
Without Tower, the system will eventually lie confidently or drift into nonsense.
Tower is how you get from “cool demo” to “commercially safe.”

4) WABS (Wyshbone Agent Behaviour System)

What it is: The judgement and policy layer — the thing that makes the agent behave like a rational operator rather than a completion engine.

What it does:

Enforces principles:

The user doesn’t tell the agent what to do — the user tells it what success is worth.

The agent should abandon bad strategies when ROI is wrong.

The agent must prefer evidence, and be explicit about uncertainty.

Applies constraints:

budget limits (API spend, outreach volume),

time limits (stop conditions),

risk posture (aggressive vs conservative outreach),

compliance rules (spam avoidance, contact policies, opt-out handling),

vertical rules (what “good lead” means in breweries vs physio vs trades).

Adds “pushback”:

“This isn’t worth it given your budget.”

“This target market is too broad.”

“Your success criteria are unclear — I can’t act rationally yet.”

Why it matters:
WABS is the difference between “agent that can act” and “agent that acts wisely.”

How they work together (the loop)

A typical cycle looks like this:

UI collects:

goal (“get me new pub accounts”)

and what success is worth (value per customer, max budget per week, time horizon, risk tolerance)

Supervisor generates a plan:

e.g. pick a region, define lead criteria, run lead discovery, enrich, verify, outreach, monitor replies

Supervisor executes step-by-step:

saves leads, evidence, and outcomes as it goes

Tower evaluates continuously:

flags duplicates, weak evidence, hallucinations, broken steps, poor lead quality

issues “nudges” or blocks bad actions

WABS enforces behaviour:

ensures decisions are consistent with ROI and constraints

forces stop/abandon/replan when it’s rational

UI shows:

what happened, why, what it’s doing next, what it learned, and what you can change

That’s Wyshbone: Plan → Act → Evaluate → Adapt → Repeat, with visibility and control.

What “finished” looks like (end goal)

When Wyshbone is truly “done” (V2 autonomy + hardening), it behaves like this:

You set your commercial goal and constraints once.

Wyshbone runs continuously:

daily/weekly sweeps for new opportunities,

enrichment and verification,

outreach and follow-up,

pipeline updates,

strategy tweaks based on results.

It stops wasting money:

it abandons low-ROI segments,

doubles down where results appear,

and tells you plainly when a strategy isn’t rational.

It becomes trustable because:

every claim has evidence,

every action is logged,

failures are detectable,

and improvements are measurable.

In other words: you are not “using software.” You’re managing an autonomous commercial operator.

What it will do for a user (in plain outcomes)

For a brewery (example vertical), finished Wyshbone should:

build and refresh a lead pipeline automatically,

identify best-fit pubs (e.g., freehouses, craft bars, venues with changing lines),

find decision makers when possible (with evidence),

run outreach sequences,

track replies and next actions,

recommend pricing/margin/duty implications when relevant,

and learn what segments convert best for that brewery.

And the same pattern repeats for physio/trades, with different vertical rules and lead criteria.

The real “moat” (why this matters strategically)

Most “AI CRMs” are just chat + templates.

Wyshbone’s defensibility comes from:

closed-loop operation over time (not one-off answers),

evaluation + behaviour enforcement (Tower + WABS),

vertical judgement (what matters in each industry),

and eventually the big one: decision → outcome → updated priors (the compounding judgement loop).

That’s how it becomes hard to replace.