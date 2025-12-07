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
 * 
 * UI-19: Polished copy to be clearer and less dev-speak.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'chat',
    title: 'Ask Wyshbone Anything',
    body: 'This is where you tell Wyshbone what you need. Try "Find 30 pubs in Sussex" or "Research the micropub market".',
    target: 'chat',
    position: 'center',
  },
  {
    id: 'vertical',
    title: 'Your Industry',
    body: 'Choose your industry here. This helps Wyshbone use the right language and find the right kinds of leads.',
    target: 'vertical',
    position: 'left',
  },
  {
    id: 'nudges',
    title: 'Suggestions from Wyshbone',
    body: 'Wyshbone keeps an eye on your leads and suggests actions — like following up with stale contacts or new opportunities.',
    target: 'nudges',
    position: 'left',
  },
  {
    id: 'actions',
    title: 'Your Goals & Progress',
    body: 'Set your sales goal here and track progress. Wyshbone will help you work towards it.',
    target: 'actions',
    position: 'right',
  },
];

