/**
 * UI-20: Demo Mode Data
 * 
 * Static sample data for demo mode. Shows realistic brewery/pub CRM data
 * without requiring real backend connections.
 * 
 * All data is fictional and for demonstration purposes only.
 */

import type { Lead } from '@/features/leads/types';
import type { SubconNudge } from '@/features/subconscious/types';
import type { TowerRunSummary } from '@/api/towerClient';

// ==========================================
// Demo User
// ==========================================

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  vertical: string;
}

export const demoUser: DemoUser = {
  id: 'demo-user',
  email: 'demo@wyshbone.ai',
  name: 'Demo Brewery Account',
  vertical: 'brewery',
};

// ==========================================
// Demo Saved Leads (Pipeline)
// ==========================================

export const demoSavedLeads: Lead[] = [
  {
    id: 'demo-lead-1',
    businessName: 'The Dog & Duck',
    location: 'Sheffield, South Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '4 cask lines, 8 keg lines',
      rotationStyle: 'Rotating guests weekly',
      caskBias: 'cask-led',
      caskLines: 4,
      kegLines: 8,
      servesFood: true,
      hasBeerGarden: true,
      venueNotes: 'Popular with CAMRA members. Landlord keen on trying new breweries.',
    },
  },
  {
    id: 'demo-lead-2',
    businessName: 'The Malt House',
    location: 'Leeds, West Yorkshire',
    source: 'database',
    status: 'contacted',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '6 cask lines, 12 keg lines',
      rotationStyle: 'Core range plus 2 guest taps',
      caskBias: 'balanced',
      caskLines: 6,
      kegLines: 12,
      servesFood: true,
      hasBeerGarden: false,
      venueNotes: 'Opened our intro email twice. City centre location, busy weekends.',
    },
  },
  {
    id: 'demo-lead-3',
    businessName: 'The Fox & Hounds',
    location: 'Harrogate, North Yorkshire',
    source: 'google',
    status: 'qualified',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '3 cask lines, 4 keg lines',
      rotationStyle: 'Seasonal rotation',
      caskBias: 'cask-led',
      caskLines: 3,
      kegLines: 4,
      servesFood: true,
      hasBeerGarden: true,
      venueNotes: 'Village pub, good reputation. Currently stocks local competitors.',
    },
  },
  {
    id: 'demo-lead-4',
    businessName: 'The Crown Inn',
    location: 'York, North Yorkshire',
    source: 'manual',
    status: 'new',
    breweryMetadata: {
      pubType: 'tied',
      beerRangeSummary: '2 guest taps available',
      rotationStyle: 'Monthly guest rotation',
      caskBias: 'balanced',
      caskLines: 4,
      kegLines: 6,
      servesFood: false,
      hasBeerGarden: true,
      venueNotes: 'Tied house but has 2 free guest taps. Manager interested in local ales.',
    },
  },
  {
    id: 'demo-lead-5',
    businessName: 'The Black Bull',
    location: 'Whitby, North Yorkshire',
    source: 'google',
    status: 'contacted',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '5 cask lines, 6 keg lines',
      rotationStyle: 'Rotating guests',
      caskBias: 'cask-led',
      caskLines: 5,
      kegLines: 6,
      servesFood: true,
      hasBeerGarden: true,
      venueNotes: 'Coastal location, strong tourist trade. Previous contact went well.',
    },
  },
  {
    id: 'demo-lead-6',
    businessName: 'The Railway Tavern',
    location: 'Huddersfield, West Yorkshire',
    source: 'database',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '4 cask, 10 keg',
      rotationStyle: 'High rotation, craft-focused',
      caskBias: 'keg-led',
      caskLines: 4,
      kegLines: 10,
      servesFood: false,
      hasBeerGarden: false,
      venueNotes: 'Young clientele, craft beer focused. Good fit for our IPA range.',
    },
  },
  {
    id: 'demo-lead-7',
    businessName: 'The Plough Inn',
    location: 'Ripon, North Yorkshire',
    source: 'google',
    status: 'qualified',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '3 cask lines',
      rotationStyle: 'Core range only',
      caskBias: 'cask-led',
      caskLines: 3,
      kegLines: 2,
      servesFood: true,
      hasBeerGarden: true,
      venueNotes: 'Traditional village pub. Interested in a regular supply arrangement.',
    },
  },
  {
    id: 'demo-lead-8',
    businessName: 'The Hop & Vine',
    location: 'Bradford, West Yorkshire',
    source: 'database',
    status: 'new',
    breweryMetadata: {
      pubType: 'freehouse',
      beerRangeSummary: '8 cask, 16 keg',
      rotationStyle: 'Weekly rotation',
      caskBias: 'balanced',
      caskLines: 8,
      kegLines: 16,
      servesFood: true,
      hasBeerGarden: false,
      venueNotes: 'Award-winning beer bar. Would be great showcase venue.',
    },
  },
  {
    id: 'demo-lead-9',
    businessName: 'The Old Mill Micropub',
    location: 'Otley, West Yorkshire',
    source: 'google',
    status: 'contacted',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '4 cask gravity pours',
      rotationStyle: 'All rotating',
      caskBias: 'cask-led',
      caskLines: 4,
      kegLines: 0,
      servesFood: false,
      hasBeerGarden: false,
      venueNotes: 'Micropub opened 2022. Very supportive of local breweries.',
    },
  },
  {
    id: 'demo-lead-10',
    businessName: 'The Kings Arms',
    location: 'Scarborough, North Yorkshire',
    source: 'manual',
    status: 'do_not_contact',
    breweryMetadata: {
      pubType: 'pubco',
      beerRangeSummary: 'Limited selection',
      rotationStyle: 'Fixed range',
      caskBias: 'keg-led',
      caskLines: 1,
      kegLines: 8,
      servesFood: true,
      hasBeerGarden: true,
      venueNotes: 'Pubco-tied, no flexibility on range. Marked as not suitable.',
    },
  },
];

// ==========================================
// Demo Lead Finder Results
// (Simulates a search for "micropubs in Yorkshire")
// ==========================================

export const demoLeadFinderResults: Lead[] = [
  {
    id: 'demo-search-1',
    businessName: 'The Arcade Alehouse',
    location: 'Leeds, West Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '4 cask + 6 keg',
      rotationStyle: 'Rotating',
      caskBias: 'balanced',
    },
  },
  {
    id: 'demo-search-2',
    businessName: 'The Pivni Micropub',
    location: 'York, North Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '6 keg lines, cans',
      rotationStyle: 'Craft rotation',
      caskBias: 'keg-led',
    },
  },
  {
    id: 'demo-search-3',
    businessName: 'The Taproom',
    location: 'Sheffield, South Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '10 keg lines',
      rotationStyle: 'Weekly rotation',
      caskBias: 'keg-led',
    },
  },
  {
    id: 'demo-search-4',
    businessName: 'The Barrel Drop',
    location: 'Wakefield, West Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '4 cask gravity',
      rotationStyle: 'All rotating',
      caskBias: 'cask-led',
    },
  },
  {
    id: 'demo-search-5',
    businessName: 'The Brew Society',
    location: 'Doncaster, South Yorkshire',
    source: 'google',
    status: 'new',
    breweryMetadata: {
      pubType: 'independent',
      beerRangeSummary: '8 keg + bottle shop',
      rotationStyle: 'High rotation',
      caskBias: 'keg-led',
    },
  },
];

// ==========================================
// Demo Nudges
// ==========================================

const now = new Date();

export const demoNudges: SubconNudge[] = [
  {
    id: 'demo-nudge-1',
    title: 'Stale lead: The Dog & Duck',
    summary: 'You added The Dog & Duck 32 days ago but haven\'t made contact yet. The landlord was noted as "keen on trying new breweries" - worth a call?',
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    status: 'new',
    type: 'stale_lead',
    importanceScore: 85,
    leadId: 'demo-lead-1',
    leadName: 'The Dog & Duck',
  },
  {
    id: 'demo-nudge-2',
    title: 'Hot prospect: The Malt House opened your email',
    summary: 'The Malt House opened your intro email twice yesterday. This could be a good time to follow up with a call or another email.',
    createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    status: 'new',
    type: 'engagement',
    importanceScore: 92,
    leadId: 'demo-lead-2',
    leadName: 'The Malt House',
  },
  {
    id: 'demo-nudge-3',
    title: 'Follow up: The Plough Inn quote request',
    summary: 'The Plough Inn asked for a price list 10 days ago. Have you sent it? If so, it might be time to check if they have questions.',
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    status: 'new',
    type: 'follow_up',
    importanceScore: 78,
    leadId: 'demo-lead-7',
    leadName: 'The Plough Inn',
  },
  {
    id: 'demo-nudge-4',
    title: 'Insight: Craft beer trend in Bradford',
    summary: 'Bradford has seen a 23% increase in craft beer bar openings this year. The Hop & Vine in your pipeline could be a gateway to this market.',
    createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
    status: 'seen',
    type: 'insight',
    importanceScore: 65,
    leadId: 'demo-lead-8',
    leadName: 'The Hop & Vine',
  },
  {
    id: 'demo-nudge-5',
    title: 'Reminder: Beer festival season approaching',
    summary: 'Summer beer festival season starts next month. Consider reaching out to pubs about festival specials or cask orders.',
    createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(), // 3 days ago
    status: 'new',
    type: 'reminder',
    importanceScore: 70,
  },
];

// ==========================================
// Demo Tower Runs (for "What just happened?")
// ==========================================

export const demoTowerRuns: TowerRunSummary[] = [
  {
    id: 'demo-run-1',
    createdAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 mins ago
    source: 'live_user',
    status: 'success',
    summary: 'Find micropubs in Yorkshire with cask ale',
    userEmail: 'demo@wyshbone.ai',
    durationMs: 3240,
  },
  {
    id: 'demo-run-2',
    createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), // 15 mins ago
    source: 'supervisor',
    status: 'success',
    summary: 'Lead enrichment: Added contact details for 8 pubs',
    durationMs: 12500,
  },
  {
    id: 'demo-run-3',
    createdAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(), // 45 mins ago
    source: 'subconscious',
    status: 'success',
    summary: 'Identified 3 stale leads needing follow-up',
    durationMs: 1890,
  },
  {
    id: 'demo-run-4',
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    source: 'live_user',
    status: 'success',
    summary: 'Deep research: Micropub market trends in West Yorkshire',
    durationMs: 45200,
  },
  {
    id: 'demo-run-5',
    createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    source: 'plan_executor',
    status: 'success',
    summary: 'Sent intro emails to 5 new pub leads',
    durationMs: 8900,
  },
  {
    id: 'demo-run-6',
    createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    source: 'supervisor',
    status: 'error',
    summary: 'Lead search: Connection timeout to Google Places',
    durationMs: 30000,
  },
  {
    id: 'demo-run-7',
    createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    source: 'subconscious',
    status: 'success',
    summary: 'Weekly pipeline health check completed',
    durationMs: 2100,
  },
  {
    id: 'demo-run-8',
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    source: 'live_user',
    status: 'success',
    summary: 'Find freehouses in North Yorkshire with 4+ cask lines',
    userEmail: 'demo@wyshbone.ai',
    durationMs: 4500,
  },
];

// ==========================================
// Demo CRM Settings
// ==========================================

export const demoCrmSettings = {
  industryVertical: 'brewery',
  defaultCountry: 'GB',
};

// ==========================================
// Demo Goal
// ==========================================

export const demoGoal = {
  id: 'demo-goal-1',
  userId: 'demo-user',
  goal: 'Sign up 20 new pub accounts in Yorkshire this quarter',
  createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
  progress: 35, // 35% progress
};

