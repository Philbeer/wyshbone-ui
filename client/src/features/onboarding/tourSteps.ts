/**
 * UI-17: Onboarding Tour Steps Configuration
 * 
 * Defines the multi-step walkthrough for first-time users.
 * Each step targets a specific UI area and provides a brief explanation.
 * 
 * Goal: Guide Phil (and other users) through the main Wyshbone UI areas
 * so they understand what each section does at a glance.
 */

export type TourStepId = 'chat' | 'vertical' | 'nudges' | 'actions';

export interface TourStep {
  id: TourStepId;
  title: string;
  body: string;
  /** CSS selector for the data-tour-id attribute target */
  target: TourStepId;
  /** Position hint for the tooltip */
  position: 'center' | 'left' | 'right' | 'top' | 'bottom';
}

/**
 * The tour steps in order. Keep copy short and practical.
 * Phil already knows what Wyshbone is; he just needs to know where to click.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'chat',
    title: 'Chat with Wyshbone',
    body: 'Type what you want Wyshbone to do — find leads, run research, send emails. This is your main command center.',
    target: 'chat',
    position: 'center',
  },
  {
    id: 'vertical',
    title: 'Choose Your Vertical',
    body: 'Select your industry (e.g. Breweries) so plans and searches use the right terminology and logic.',
    target: 'vertical',
    position: 'left',
  },
  {
    id: 'nudges',
    title: 'Nudges & Suggestions',
    body: 'Wyshbone\'s "subconscious" shows suggestions here — stale leads, follow-ups, and proactive ideas.',
    target: 'nudges',
    position: 'left',
  },
  {
    id: 'actions',
    title: 'Side Panel Actions',
    body: 'Your goals, pending plans, and progress summaries appear here. Quick access to what needs attention.',
    target: 'actions',
    position: 'right',
  },
];

