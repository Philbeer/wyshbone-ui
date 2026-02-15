import { Globe, MessageSquare, Bug, FilePlus, MessagesSquare, ChevronDown, ChevronRight, Clock, Edit2, Trash2, Mail, Link2, User, CreditCard, History, Users, Sparkles, Factory, HelpCircle, FlaskConical, Bot, Database, Calendar, ClipboardCheck, Search, Settings } from "lucide-react";
import { Badge as UIBadge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { authedFetch, buildApiUrl, addDevAuthParams } from "@/lib/queryClient";
import { useSidebarFlash } from "@/contexts/SidebarFlashContext";
import { useVerticalLabels } from "@/lib/verticals";
import { VerticalSelector } from "@/components/VerticalSelector";
import { useOnboardingTourContext } from "@/contexts/OnboardingTourContext";
import { useDemoModeContext } from "@/contexts/DemoModeContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "stopped" | "in_progress";

export type RunItem = {
  id: string;
  label: string;
  startedAt: string;
  finishedAt?: string | null;
  status: RunStatus;
  archived?: boolean;
  externalUrl?: string;
  businessType?: string;
  location?: string;
  country?: string;
  targetPosition?: string;
  uniqueId?: string;
  runType?: "business_search" | "deep_research";
  outputPreview?: string;
};

// Generate a 20-character lowercase alphanumeric unique ID
function generateUniqueId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AG', name: 'Antigua & Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BA', name: 'Bosnia & Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CD', name: 'Congo (DRC)' },
  { code: 'CG', name: 'Congo (Republic)' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d\'Ivoire (Ivory Coast)' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic (Czechia)' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini (Swaziland)' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KP', name: 'Korea (North)' },
  { code: 'KR', name: 'Korea (South)' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar (Burma)' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'KN', name: 'Saint Kitts & Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'VC', name: 'Saint Vincent & Grenadines' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'São Tomé & Príncipe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TG', name: 'Togo' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad & Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

export type ConversationItem = {
  id: string;
  userId: string;
  label: string;
  createdAt: number;
};

interface AppSidebarProps {
  defaultCountry: string;
  onCountryChange: (country: string) => void;
  runs?: RunItem[];
  conversations?: ConversationItem[];
  onSelectRun?: (id: string) => void;
  onSelectConversation?: (id: string) => void;
  onStopRun?: (id: string) => void;
  onArchiveRun?: (id: string, archived: boolean) => void;
  onRetryRun?: (id: string) => void;
  onDuplicateRun?: (id: string, newId: string) => void;
  onOpenExternal?: (url: string, id: string) => void;
  onRunRun?: (run: RunItem) => void;
  onNewChat?: () => void;
}

const fmtTime = (iso: string) => {
  const dt = new Date(iso);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const isToday = (d: Date) => {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
};

const newId = () => `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const Badge: React.FC<{ status: RunStatus }> = ({ status }) => {
  const map: Record<RunStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    failed: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
    stopped: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  };
  
  // Status emoji mapping
  const emoji: Record<RunStatus, string> = {
    queued: "⏳",
    running: "🔄",
    in_progress: "🔄",
    completed: "✅",
    failed: "❌",
    stopped: "⏹️",
  };
  
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${map[status]}`}>
      {emoji[status]} {status === 'in_progress' ? 'running' : status}
    </span>
  );
};

/**
 * Extract a clean, short title from a deep research query
 * "Deep research on pubs in Leeds, UK. Please deliver..." → "Leeds Pubs Research"
 */
function extractCleanTitle(label: string, startedAt: string): string {
  // Try to extract "on [topic]" pattern
  const onMatch = label.match(/(?:deep\s+research\s+)?on\s+(.+?)(?:\.|,|please|deliver|include|focus|in\s+the\s+format)/i);
  let topic = onMatch ? onMatch[1].trim() : label;
  
  // If still too long, take first part before period or comma
  if (topic.length > 60) {
    const firstPart = topic.split(/[.,]/)[0];
    topic = firstPart.length > 60 ? firstPart.slice(0, 57) + '...' : firstPart;
  }
  
  // Clean up common patterns
  topic = topic
    .replace(/^(deep\s+research\s+on\s+)/i, '')
    .replace(/\s+uk$/i, '')
    .replace(/\s+usa$/i, '')
    .trim();
  
  // Capitalize nicely
  topic = topic.charAt(0).toUpperCase() + topic.slice(1);
  
  // Add date
  const date = new Date(startedAt);
  const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  
  // Limit total length
  if (topic.length > 40) {
    topic = topic.slice(0, 37) + '...';
  }
  
  return `${topic} • ${dateStr}`;
}


const RunRow: React.FC<{
  run: RunItem;
  onSelect: (id: string) => void;
  isNew?: boolean;
  actions: {
    view: () => void;
    retry: () => void;
    duplicate: () => void;
    stop: () => void;
    archiveToggle: () => void;
    run: () => void;
  };
}> = ({ run, onSelect, isNew, actions }) => {
  const isDeepResearch = run.runType === "deep_research";
  const cardBgClass = isDeepResearch 
    ? "bg-purple-50 dark:bg-purple-950/20" 
    : "bg-blue-50 dark:bg-blue-950/20";
  
  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-xl border border-border ${cardBgClass} px-3 py-4 mb-2 cursor-pointer hover-elevate active-elevate-2 min-h-[120px] ${isNew ? 'animate-flash-border' : ''}`}
      onClick={() => onSelect(run.id)}
      role="button"
      aria-label={`Select run ${run.label}`}
      data-testid={`run-item-${run.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span 
            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-2 ${isDeepResearch ? 'text-teal-900 dark:text-teal-100' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}
            style={isDeepResearch ? { backgroundColor: '#cfe6e6' } : undefined}
          >
            {isDeepResearch ? 'Deep Dive' : 'Find Contacts'}
          </span>
          <div className="flex items-start gap-2 mb-2 flex-wrap">
            <span className="text-[14px] font-semibold text-foreground leading-snug">
              {isDeepResearch ? extractCleanTitle(run.label, run.startedAt) : run.label}
            </span>
            <Badge status={run.status} />
          </div>
          
          {/* Search details */}
          <div className="space-y-1 text-[12px] text-muted-foreground">
            {run.runType === "deep_research" ? (
              <>
                {run.outputPreview && run.outputPreview !== "undefined" && (
                  <div className="break-words text-[11px] italic">
                    {run.outputPreview}
                  </div>
                )}
                {(!run.outputPreview || run.outputPreview === "undefined") && run.status === "queued" && (
                  <div className="break-words text-[11px] italic text-muted-foreground">
                    Waiting to start...
                  </div>
                )}
                {(!run.outputPreview || run.outputPreview === "undefined") && (run.status === "in_progress" || run.status === "running") && (
                  <div className="break-words text-[11px] italic text-muted-foreground">
                    Research in progress...
                  </div>
                )}
                <div className="text-[11px] mt-2">Created {fmtTime(run.startedAt)}</div>
              </>
            ) : (
              <>
                {run.businessType && (
                  <div className="break-words">
                    <span className="font-medium text-foreground">Business:</span> {run.businessType}
                  </div>
                )}
                {run.location && (
                  <div className="break-words">
                    <span className="font-medium text-foreground">Location:</span> {run.location}
                  </div>
                )}
                {run.country && (
                  <div className="break-words">
                    <span className="font-medium text-foreground">Country:</span> {run.country}
                  </div>
                )}
                {run.targetPosition && (
                  <div className="break-words">
                    <span className="font-medium text-foreground">Target:</span> {run.targetPosition}
                  </div>
                )}
                {run.uniqueId && (
                  <div className="break-words text-[11px] text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">ID:</span> {run.uniqueId}
                  </div>
                )}
                <div className="text-[11px] mt-2">Sent {fmtTime(run.startedAt)}</div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-lg border border-border px-2 py-1 text-[12px] text-foreground hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
                title="Actions"
                data-testid="button-run-menu"
              >
                •••
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" alignOffset={-8} className="w-56">
              {run.runType === "deep_research" ? (
                <>
                  {run.status === "completed" && (
                    <DropdownMenuItem onClick={actions.view} data-testid="menu-item-0">
                      View Output
                    </DropdownMenuItem>
                  )}
                  {(run.status === "queued" || run.status === "in_progress" || run.status === "running") && (
                    <DropdownMenuItem onClick={actions.stop} data-testid="menu-item-3">
                      Stop Research
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={actions.duplicate} data-testid="menu-item-4">
                    Duplicate
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={actions.view} data-testid="menu-item-0">
                    View in Bubble
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.stop} data-testid="menu-item-3">
                    Stop workflow
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {run.status === "stopped" ? (
            <button
              className="text-[11px] rounded-lg border border-primary px-2 py-1 text-primary hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring whitespace-nowrap"
              onClick={actions.run}
              aria-label="Run workflow"
              title="Run workflow"
              data-testid={`button-run-${run.id}`}
            >
              Run
            </button>
          ) : (run.status === "queued" || run.status === "in_progress" || run.status === "running") ? (
            <button
              className="text-[11px] rounded-lg border border-destructive px-2 py-1 text-destructive hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring whitespace-nowrap"
              onClick={actions.stop}
              aria-label="Stop workflow"
              title="Stop workflow"
              data-testid={`button-stop-${run.id}`}
            >
              Stop
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/**
 * UI-17: Tour Button Component
 * Shows a "Take a Tour" button that opens the onboarding walkthrough.
 * UI-19: Improved label copy
 */
function TourButton() {
  const { startTour, hasCompletedTour } = useOnboardingTourContext();
  
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={startTour}
        data-testid="button-start-tour"
        className="text-muted-foreground hover:text-foreground"
        title="Quick walkthrough of Wyshbone's main features"
      >
        <HelpCircle className="h-4 w-4" />
        <span>{hasCompletedTour ? 'Show me around again' : 'Show me around'}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * UI-20: Demo Mode Toggle Button
 * Dev-only: allows toggling demo mode from the sidebar.
 * In production, demo mode is only available via ?demo=1 URL param.
 */
function DemoModeToggle() {
  const { demoMode, enableDemoMode, disableDemoMode } = useDemoModeContext();
  
  if (!import.meta.env.DEV) return null;
  
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => demoMode ? disableDemoMode() : enableDemoMode()}
        data-testid="button-toggle-demo"
        className={demoMode 
          ? "text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-950/30" 
          : "text-muted-foreground hover:text-foreground"
        }
        title={demoMode ? "Exit demo mode and use real data" : "Try Wyshbone with sample brewery data"}
      >
        <FlaskConical className="h-4 w-4" />
        <span>{demoMode ? 'Exit Demo Mode' : 'Try Demo Mode'}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ 
  defaultCountry, 
  onCountryChange,
  runs = [],
  conversations = [],
  onSelectRun,
  onSelectConversation,
  onStopRun,
  onArchiveRun,
  onRetryRun,
  onDuplicateRun,
  onOpenExternal,
  onRunRun,
  onNewChat,
}: AppSidebarProps) {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const { lastTriggerBySection } = useSidebarFlash();
  const { labels } = useVerticalLabels();
  const [showArchived, setShowArchived] = useState(false);
  const [localRuns, setLocalRuns] = useState<RunItem[]>(runs);
  const [showPreviousChats, setShowPreviousChats] = useState(false);
  const [showScheduledMonitors, setShowScheduledMonitors] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [newRunIds, setNewRunIds] = useState<Set<string>>(new Set());
  const [viewedResearchIds, setViewedResearchIds] = useState<Set<string>>(new Set());

  const [flashingSection, setFlashingSection] = useState<string | null>(null);

  // Watch for flash triggers from other components
  useEffect(() => {
    const triggers = Array.from(lastTriggerBySection.entries());
    if (triggers.length === 0) return;
    
    // Get the most recent trigger
    const [section, timestamp] = triggers[triggers.length - 1];
    setFlashingSection(section);
    
    // Remove flash after 2 seconds (2 flashes animation duration)
    const timer = setTimeout(() => {
      setFlashingSection(null);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [lastTriggerBySection]);

  useEffect(() => {
    // Always update localRuns first
    setLocalRuns(runs);
    
    // Then detect newly added runs for flash animation
    const prevIds = new Set(localRuns.map(r => r.id));
    const addedIds = runs.filter(r => !prevIds.has(r.id)).map(r => r.id);
    
    if (addedIds.length > 0) {
      setNewRunIds(new Set(addedIds));
      
      // Remove flash after 3 seconds
      const timer = setTimeout(() => {
        setNewRunIds(new Set());
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [runs, localRuns]);

  const { todays, previous } = useMemo(() => {
    const t: RunItem[] = [];
    const p: RunItem[] = [];
    for (const r of localRuns) {
      if (r.archived && !showArchived) continue;
      (isToday(new Date(r.startedAt)) ? t : p).push(r);
    }
    const byDateDesc = (a: RunItem, b: RunItem) =>
      +new Date(b.startedAt) - +new Date(a.startedAt);
    t.sort(byDateDesc);
    p.sort(byDateDesc);
    return { todays: t, previous: p };
  }, [localRuns, showArchived]);

  // Calculate unviewed deep research count
  const unviewedResearchCount = useMemo(() => {
    return localRuns.filter(run =>
      run.runType === "deep_research" &&
      run.status === "completed" &&
      !viewedResearchIds.has(run.id)
    ).length;
  }, [localRuns, viewedResearchIds]);

  const mutate = (fn: (prev: RunItem[]) => RunItem[]) => {
    setLocalRuns((prev) => fn(prev));
  };

  const _select = async (id: string) => {
    const run = localRuns.find((r) => r.id === id);

    // Track view for deep research runs (for summarization feature)
    if (run && run.runType === "deep_research") {
      // Mark as viewed in local state
      setViewedResearchIds(prev => new Set(prev).add(id));

      try {
        const response = await authedFetch(`/api/deep-research/${id}/view`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        // DEV MODE: No auth gating for deep research - just log any errors
        if (!response.ok) {
          console.warn("View tracking returned non-OK status:", response.status);
        } else {
          console.log(`📊 Tracked view for deep research run: ${id}`);
        }
      } catch (error) {
        console.error("Failed to track view:", error);
        // Don't block the UI if tracking fails
      }
    }

    onSelectRun?.(id);
  };

  const _stop = async (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    
    // Handle deep research runs via API
    if (ref.runType === "deep_research") {
      try {
        const response = await authedFetch(`/api/deep-research/${id}/stop`, {
          method: "POST",
        });
        if (response.ok) {
          // Update will be picked up by polling
          mutate((prev) => prev.map((r) => (r.id === id ? { ...r, status: "stopped" as RunStatus, finishedAt: new Date().toISOString() } : r)));
        }
      } catch (error) {
        console.error("Failed to stop deep research:", error);
      }
      return;
    }
    
    // Handle business search runs
    mutate((prev) => prev.map((r) => (r.id === id ? { ...r, status: "stopped" as RunStatus, finishedAt: new Date().toISOString() } : r)));
    onStopRun?.(id);
  };

  const _archiveToggle = (id: string) => {
    const current = localRuns.find((r) => r.id === id);
    const nextArchived = !current?.archived;
    mutate((prev) => prev.map((r) => (r.id === id ? { ...r, archived: nextArchived } : r)));
    onArchiveRun?.(id, !!nextArchived);
  };

  const _retry = (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    const newRun: RunItem = {
      ...ref,
      id: newId(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "queued",
      archived: false,
      label: ref.label.replace(/\s+\(copy.*\)$/i, ""),
    };
    mutate((prev) => [newRun, ...prev]);
    onRetryRun?.(id);
  };

  const _duplicate = async (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    
    // Handle deep research runs via API
    if (ref.runType === "deep_research") {
      try {
        const response = await authedFetch(`/api/deep-research/${id}/duplicate`, {
          method: "POST",
        });
        if (response.ok) {
          const data = await response.json();
          // New run will be picked up by polling
          console.log("Deep research duplicated:", data.run);
        }
      } catch (error) {
        console.error("Failed to duplicate deep research:", error);
      }
      return;
    }
    
    // Handle business search runs
    const generatedId = newId();
    const generatedUniqueId = generateUniqueId();
    console.log("Duplicate run:", id, "→", generatedId, "| uniqueId:", generatedUniqueId);
    const newRun: RunItem = {
      ...ref,
      id: generatedId,
      label: `${ref.label} (copy)`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "stopped",
      archived: false,
      uniqueId: generatedUniqueId,
    };
    mutate((prev) => [newRun, ...prev]);
    onDuplicateRun?.(id, newRun.id);
  };

  const _openExternal = (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    
    // Handle deep research runs - use onSelectRun to open in ResultsPanel
    if (ref.runType === "deep_research") {
      // Call the same handler as clicking the run card - this opens ResultsPanel
      onSelectRun?.(id);
      return;
    }
    
    // Handle business search runs
    if (ref.externalUrl) {
      onOpenExternal?.(ref.externalUrl, id);
      if (!onOpenExternal) window.open(ref.externalUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("No external link available for this run.");
    }
  };

  const _run = (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    onRunRun?.(ref);
  };

  const renderRunSection = (items: RunItem[], title: string) => (
    <div className="mb-4">
      <h3 className="text-[13px] font-semibold text-foreground mb-2">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No runs.</div>
      ) : (
        items.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            onSelect={_select}
            isNew={newRunIds.has(run.id)}
            actions={{
              view: () => _openExternal(run.id),
              retry: () => _retry(run.id),
              duplicate: () => _duplicate(run.id),
              stop: () => _stop(run.id),
              archiveToggle: () => _archiveToggle(run.id),
              run: () => _run(run.id),
            }}
          />
        ))
      )}
    </div>
  );

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup className="mt-[30px]">
          <SidebarGroupLabel className="flex items-center gap-2 ml-5">
            <Globe className="h-4 w-4" />
            Default Country
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Select value={defaultCountry} onValueChange={onCountryChange}>
                  <SelectTrigger data-testid="select-default-country" className="w-full">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem 
                        key={country.code} 
                        value={country.code}
                        data-testid={`option-country-${country.code}`}
                      >
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup data-tour-id="vertical">
          <SidebarGroupLabel className="flex items-center gap-2 ml-5">
            <Factory className="h-4 w-4" />
            Industry Vertical
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <VerticalSelector />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={onNewChat}
                  data-testid="button-new-chat"
                >
                  <FilePlus className="h-4 w-4" />
                  <span>New Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Collapsible open={showPreviousChats} onOpenChange={setShowPreviousChats}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="button-toggle-previous-chats">
                      {showPreviousChats ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span>{showPreviousChats ? "Hide previous chats" : "Previous Chats"}</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    {conversations.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-2">No previous chats</p>
                    ) : (
                      <div className="max-h-[400px] overflow-y-auto px-3 space-y-1">
                        {conversations.map((conversation) => (
                          <button
                            key={conversation.id}
                            onClick={() => {
                              // Use the callback to load conversation
                              onSelectConversation?.(conversation.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-md text-sm hover-elevate active-elevate-2 border border-border truncate"
                            data-testid={`button-conversation-${conversation.id}`}
                          >
                            {conversation.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/debug"} data-testid="link-debug">
                  <Link href="/debug">
                    <Bug className="h-4 w-4" />
                    <span>Memory Debug</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/account"} data-testid="link-account">
                  <Link href="/account">
                    <User className="h-4 w-4" />
                    <span>Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/pricing"} data-testid="link-pricing">
                  <Link href="/pricing">
                    <CreditCard className="h-4 w-4" />
                    <span>Pricing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/auth/crm")} data-testid="link-crm">
                  <Link href="/auth/crm">
                    <Link2 className="h-4 w-4" />
                    <span>CRM & Accounting</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/leads"} data-testid="link-leads">
                  <Link href="/leads">
                    <Users className="h-4 w-4" />
                    <span>{labels.nav_leads}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem data-tour-id="nudges">
                <SidebarMenuButton asChild isActive={location === "/nudges"} data-testid="link-nudges">
                  <Link href="/nudges">
                    <Sparkles className="h-4 w-4" />
                    <span>Nudges</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Collapsible open={showIntegrations} onOpenChange={setShowIntegrations}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton data-testid="button-toggle-integrations">
                      {showIntegrations ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Link2 className="h-4 w-4" />
                      <span>Integrations</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="px-3">
                      <p className="text-xs text-muted-foreground mb-3">
                        Connect your business tools
                      </p>
                      <IntegrationsSection userId={user.email} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              <TourButton />
              <DemoModeToggle />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Discovery Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Discovery</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/auth/crm/events" || location === "/events"} data-testid="link-events">
                  <Link href="/auth/crm/events">
                    <Calendar className="h-4 w-4" />
                    <span>📅 Events</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/auth/crm/entity-review" || location === "/entity-review"} data-testid="link-entity-review">
                  <Link href="/auth/crm/entity-review">
                    <ClipboardCheck className="h-4 w-4" />
                    <span>📋 Review Queue</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/reddit"} data-testid="link-reddit">
                  <Link href="/reddit">
                    <MessageSquare className="h-4 w-4" />
                    <span>🔍 Reddit</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/hackernews"} data-testid="link-hackernews">
                  <Link href="/hackernews">
                    <Search className="h-4 w-4" />
                    <span>📰 Hacker News</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings - accessible to all users, with admin-only items */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/settings"} data-testid="link-settings">
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span>General</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Team management - visible to all, but admin features gated in the page */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/settings/team"} data-testid="link-settings-team">
                  <Link href="/settings/team">
                    <Users className="h-4 w-4" />
                    <span>Team</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Legacy Users link - admin only, for backwards compatibility */}
              {user?.role === 'admin' && (
                <SidebarMenuItem className="hidden">
                  <SidebarMenuButton asChild isActive={location === "/settings/users"} data-testid="link-settings-users">
                    <Link href="/settings/users">
                      <Users className="h-4 w-4" />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Developer Tools - only shown in development or to admins */}
        {(process.env.NODE_ENV === 'development' || user?.role === 'admin' || ['phil@wyshbone.com', 'phil@listersbrewery.com'].includes(user?.email?.toLowerCase() || '')) && (
          <SidebarGroup>
            <SidebarGroupLabel>Dev Tools</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/dev/sleeper-agent"} data-testid="link-dev-sleeper-agent">
                    <Link href="/dev/sleeper-agent">
                      <Bot className="h-4 w-4" />
                      <span>🤖 Sleeper Monitor</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/dev/progress"} data-testid="link-dev-progress">
                    <Link href="/dev/progress">
                      <FlaskConical className="h-4 w-4" />
                      <span>📊 Dev Progress</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/dev/afr"} data-testid="link-dev-afr">
                    <Link href="/dev/afr">
                      <ClipboardCheck className="h-4 w-4" />
                      <span>Agent Flight Recorder</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/dev/injection-moulding"} data-testid="link-dev-injection-moulding">
                    <Link href="/dev/injection-moulding">
                      <Factory className="h-4 w-4" />
                      <span>Injection Moulding Demo</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {(user?.role === 'admin' || ['phil@wyshbone.com', 'phil@listersbrewery.com'].includes(user?.email?.toLowerCase() || '')) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/admin/database-maintenance"} data-testid="link-admin-db-maintenance">
                      <Link href="/admin/database-maintenance">
                        <Database className="h-4 w-4" />
                        <span>🗄️ DB Maintenance</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Monitors</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Collapsible open={showScheduledMonitors} onOpenChange={setShowScheduledMonitors}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton 
                      className={flashingSection === 'scheduledMonitors' ? 'animate-flash-border' : ''}
                      data-testid="button-toggle-scheduled-monitors"
                    >
                      {showScheduledMonitors ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Clock className="h-4 w-4" />
                      <span>Scheduled Monitors</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="px-3">
                      <p className="text-xs text-muted-foreground mb-3">
                        Automated tasks that run on a schedule
                      </p>
                      <ScheduledMonitorsSection userId={user.id} onSelectConversation={onSelectConversation} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={location === "/batch-history"} 
                  className={flashingSection === 'emailFinder' ? 'animate-flash-border' : ''}
                  data-testid="link-batch-history"
                >
                  <Link href="/batch-history">
                    <History className="h-4 w-4" />
                    <span>Email Finder Runs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={`flex items-center gap-2 ${flashingSection === 'deepResearch' ? 'animate-flash-border' : ''}`}>
            <span>Deep Researches</span>
            {unviewedResearchCount > 0 && (
              <UIBadge variant="default" className="ml-auto">
                {unviewedResearchCount} NEW
              </UIBadge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3">
            <p className="text-xs text-muted-foreground mb-3">
              Deep dive research reports. Click to view. Use Stop to cancel. Menu for more actions.
            </p>

            {renderRunSection(todays, "Today")}
            {renderRunSection(previous, "Previous")}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

// Scheduled Monitors Section Component
function ScheduledMonitorsSection({ userId, onSelectConversation }: { userId: string; onSelectConversation?: (conversationId: string) => void }) {
  const [, setLocation] = useLocation();
  const [editingMonitor, setEditingMonitor] = useState<any>(null);
  const [deletingMonitor, setDeletingMonitor] = useState<any>(null);
  const [editForm, setEditForm] = useState({ 
    label: '', 
    description: '',
    schedule: 'weekly' as 'once' | 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly',
    scheduleDay: undefined as 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | undefined,
    scheduleTime: '',
    emailNotifications: true, // Default to enabled
    emailAddress: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sendToPhil, setSendToPhil] = useState(false);
  
  const { data: monitors, isLoading, isError, error, refetch } = useQuery({
    queryKey: [`/api/scheduled-monitors/${userId}`],
    refetchInterval: 5000, // Refetch every 5 seconds to pick up monitors created via chat
  });

  const handleDeleteConfirm = async () => {
    if (!deletingMonitor) return;
    
    setIsDeleting(true);
    try {
      const response = await authedFetch(`/api/scheduled-monitors/${deletingMonitor.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setDeletingMonitor(null);
        refetch();
      } else {
        alert('Failed to delete monitor');
      }
    } catch (error) {
      console.error('Failed to delete monitor:', error);
      alert('Failed to delete monitor');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleEdit = (monitor: any) => {
    setEditingMonitor(monitor);
    setEditForm({ 
      label: monitor.label, 
      description: monitor.description,
      schedule: monitor.schedule,
      scheduleDay: monitor.scheduleDay || undefined,
      scheduleTime: monitor.scheduleTime || '',
      // Default to true if not explicitly set, otherwise use monitor's current setting
      emailNotifications: monitor.emailNotifications !== undefined ? monitor.emailNotifications === 1 : true,
      emailAddress: monitor.emailAddress || ''
    });
  };
  
  const handleSaveEdit = async () => {
    if (!editingMonitor || !editForm.label.trim()) {
      alert('Label is required');
      return;
    }
    
    if (editForm.schedule === 'once' && !editForm.scheduleTime?.trim()) {
      alert('Time is required when schedule is set to "Once"');
      return;
    }
    
    setIsSaving(true);
    try {
      // Override email address for dev testing
      const emailAddress = sendToPhil ? 'phil@listersbrewery.com' : editForm.emailAddress;
      
      const response = await authedFetch(`/api/scheduled-monitors/${editingMonitor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label,
          schedule: editForm.schedule,
          scheduleDay: editForm.scheduleDay || null,
          scheduleTime: editForm.scheduleTime || null,
          emailNotifications: editForm.emailNotifications ? 1 : 0,
          emailAddress: emailAddress || null,
        }),
      });
      
      if (response.ok) {
        setEditingMonitor(null);
        setSendToPhil(false); // Reset dev toggle after save
        refetch();
      } else {
        alert('Failed to update monitor');
      }
    } catch (error) {
      console.error('Failed to update monitor:', error);
      alert('Failed to update monitor');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading...</p>;
  }

  if (isError) {
    // Check if it's an authentication error (401)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError = errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized');
    
    if (isAuthError) {
      return <p className="text-xs text-muted-foreground">Sign in to view monitors</p>;
    }
    
    return <p className="text-xs text-destructive">Failed to load monitors: {errorMessage}</p>;
  }

  if (!monitors || (Array.isArray(monitors) && monitors.length === 0)) {
    return <p className="text-xs text-muted-foreground">No scheduled monitors yet</p>;
  }

  return (
    <>
      <Dialog open={!!editingMonitor} onOpenChange={(open) => !open && setEditingMonitor(null)}>
        <DialogContent data-testid="dialog-edit-monitor">
          <DialogHeader>
            <DialogTitle>Edit Monitor Schedule</DialogTitle>
            <DialogDescription>
              Change when this monitor runs. To change what it searches for, create a new monitor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingMonitor && (
              <div className="p-3 rounded-md bg-muted/50 space-y-1">
                <div className="text-xs text-muted-foreground">{editingMonitor.description}</div>
                <div className="text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {editingMonitor.monitorType === 'deep_research' ? 'Research' : editingMonitor.monitorType === 'business_search' ? 'Contacts' : 'Database'}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                placeholder="Enter monitor label"
                data-testid="input-edit-label"
              />
              <p className="text-xs text-muted-foreground">Give this monitor a custom name for easy identification</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-schedule">Schedule</Label>
              <Select 
                value={editForm.schedule} 
                onValueChange={(value: 'once' | 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly') => setEditForm({ ...editForm, schedule: value })}
              >
                <SelectTrigger id="edit-schedule" data-testid="select-edit-schedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once (for testing)</SelectItem>
                  <SelectItem value="hourly">Hourly (for testing)</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(editForm.schedule === 'weekly' || editForm.schedule === 'biweekly') && (
              <div className="space-y-2">
                <Label htmlFor="edit-day">Day of Week</Label>
                <Select 
                  value={editForm.scheduleDay || ''} 
                  onValueChange={(value: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday') => setEditForm({ ...editForm, scheduleDay: value })}
                >
                  <SelectTrigger id="edit-day" data-testid="select-edit-day">
                    <SelectValue placeholder="Select a day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="tuesday">Tuesday</SelectItem>
                    <SelectItem value="wednesday">Wednesday</SelectItem>
                    <SelectItem value="thursday">Thursday</SelectItem>
                    <SelectItem value="friday">Friday</SelectItem>
                    <SelectItem value="saturday">Saturday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {editForm.schedule !== 'hourly' && (
              <div className="space-y-2">
                <Label htmlFor="edit-time">
                  {editForm.schedule === 'once' ? 'Time (required for once, e.g., 12:20)' : 'Time (optional, e.g., 09:00)'}
                </Label>
                <Input
                  id="edit-time"
                  value={editForm.scheduleTime}
                  onChange={(e) => setEditForm({ ...editForm, scheduleTime: e.target.value })}
                  placeholder="HH:MM"
                  data-testid="input-edit-time"
                />
                {editForm.schedule === 'once' && (
                  <p className="text-xs text-muted-foreground">
                    Set a time for today to test the monitor. It will run once and then become inactive.
                  </p>
                )}
              </div>
            )}
            {editForm.schedule === 'hourly' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Hourly monitors run every hour starting from when you save. First run will be in approximately 1 hour.
                </p>
              </div>
            )}
            <div className="space-y-3 p-3 rounded-md border border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="edit-email" className="text-sm font-medium">
                    Email Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Results will be sent to your login email
                  </p>
                </div>
                <Switch
                  id="edit-email"
                  checked={editForm.emailNotifications}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, emailNotifications: checked })}
                  data-testid="switch-email-notifications"
                />
              </div>
              {import.meta.env.DEV && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <input
                    type="checkbox"
                    id="send-to-phil"
                    checked={sendToPhil}
                    onChange={(e) => setSendToPhil(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                    data-testid="checkbox-send-to-phil"
                  />
                  <Label htmlFor="send-to-phil" className="text-xs text-muted-foreground font-normal cursor-pointer">
                    🧪 DEV: Send test email to Phil
                  </Label>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingMonitor(null)}
              disabled={isSaving}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSaving}
              data-testid="button-save-edit"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingMonitor} onOpenChange={(open) => !open && setDeletingMonitor(null)}>
        <AlertDialogContent data-testid="dialog-delete-monitor">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Monitor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this monitor? This action cannot be undone.
              {deletingMonitor && (
                <div className="mt-2 font-medium text-foreground">
                  "{deletingMonitor.label}"
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <div className="space-y-2">
        {Array.isArray(monitors) && monitors.map((monitor: any) => {
        const isActive = monitor.isActive === 1;
        const nextRun = monitor.nextRunAt ? new Date(monitor.nextRunAt) : null;
        
        const handleMonitorClick = async () => {
          if (!onSelectConversation) return;
          
          try {
            // Fetch the single conversation thread for this monitor
            const response = await authedFetch(`/api/monitors/${monitor.id}/conversation`);
            
            if (!response.ok) {
              if (response.status === 404) {
                console.log('No conversation yet for this monitor - it hasn\'t run yet');
                return;
              }
              console.error('Failed to fetch monitor conversation');
              return;
            }
            
            const data = await response.json();
            console.log('✅ Loading monitor conversation thread:', data.conversationId);
            onSelectConversation(data.conversationId);
          } catch (error) {
            console.error('Error loading monitor conversation:', error);
          }
        };
        
        return (
          <div
            key={monitor.id}
            className="p-3 rounded-md border border-border bg-card cursor-pointer hover-elevate active-elevate-2"
            onClick={handleMonitorClick}
            data-testid={`monitor-${monitor.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate" data-testid={`text-monitor-label-${monitor.id}`}>
                  {monitor.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate" data-testid={`text-monitor-description-${monitor.id}`}>
                  {monitor.description}
                </div>
              </div>
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
            
            <div className="space-y-1 mt-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {monitor.schedule.charAt(0).toUpperCase() + monitor.schedule.slice(1)}
                  {monitor.schedule !== 'hourly' && monitor.schedule !== 'once' && monitor.scheduleDay && ` on ${monitor.scheduleDay.charAt(0).toUpperCase() + monitor.scheduleDay.slice(1)}s`}
                </span>
              </div>
              
              {nextRun && (
                <div className="text-xs text-muted-foreground">
                  Next: {nextRun.toLocaleDateString('en-GB')} {nextRun.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              )}
              
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {monitor.monitorType === 'deep_research' ? 'Research' : monitor.monitorType === 'business_search' ? 'Contacts' : 'Database'}
                  </span>
                  {monitor.emailNotifications === 1 && (
                    <span title="Email notifications enabled">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(monitor);
                    }}
                    className="p-1 rounded hover-elevate active-elevate-2"
                    data-testid={`button-edit-monitor-${monitor.id}`}
                    title="Edit monitor"
                  >
                    <Edit2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingMonitor(monitor);
                    }}
                    className="p-1 rounded hover-elevate active-elevate-2"
                    data-testid={`button-delete-monitor-${monitor.id}`}
                    title="Delete monitor"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

// Integrations Section Component
function IntegrationsSection({ userId }: { userId: string }) {
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  
  const { data: integrationsData, isLoading, refetch } = useQuery<{ integrations: any[] }>({
    queryKey: ['/api/integrations'],
    refetchInterval: 5000,
  });
  
  const providers = [
    { key: 'salesforce', label: 'Salesforce', icon: '☁️' },
    { key: 'xero', label: 'Xero', icon: '📊' },
    { key: 'microsoft-business-central', label: 'Microsoft Business Central', icon: '🏢' },
    { key: 'google-sheets', label: 'Google Sheets', icon: '📗' },
  ];
  
  const integrations = integrationsData?.integrations || [];
  
  const connectedProviders = new Set(
    integrations.map((i: any) => i.provider)
  );
  
  const handleConnect = async (provider: string) => {
    setIsConnecting(provider);
    try {
      console.log(`🔗 Starting OAuth for ${provider}`);
      
      if (provider === 'xero') {
        // Direct navigation to the authorize endpoint - server returns 302 redirect to Xero
        const authEndpoint = addDevAuthParams(`/api/integrations/xero/authorize`);
        
        // Detect if we're in an iframe (Replit preview pane)
        // Xero blocks being loaded in iframes via X-Frame-Options, so we must open a new tab
        const inIframe = window.self !== window.top;
        
        if (inIframe) {
          // In iframe: must open new tab because Xero blocks iframes
          window.open(authEndpoint, '_blank');
        } else {
          // Direct browser tab: same-tab navigation works
          window.location.href = authEndpoint;
        }
        setIsConnecting(null);
        return;
      } else {
        // Other providers not yet implemented
        console.warn(`Provider ${provider} not yet implemented`);
        alert(`${provider} integration coming soon!`);
        setIsConnecting(null);
      }
    } catch (error: any) {
      console.error('❌ OAuth flow error:', error);
      if (error?.message && error.message !== 'User closed the popup') {
        alert(`Failed to connect: ${error.message}`);
      }
      setIsConnecting(null);
    }
  };
  
  const handleDisconnect = async (integrationId: string) => {
    try {
      const response = await authedFetch(`/api/integrations/${integrationId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        refetch();
      } else {
        alert('Failed to disconnect integration');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      alert('Failed to disconnect integration');
    }
  };
  
  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Loading...</div>;
  }
  
  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const isConnected = connectedProviders.has(provider.key);
        const integration = integrations.find((i: any) => i.provider === provider.key);
        
        return (
          <div
            key={provider.key}
            className="p-3 rounded-md border border-border bg-card"
            data-testid={`integration-${provider.key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg flex-shrink-0">{provider.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{provider.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {isConnected ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              
              {isConnected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDisconnect(integration.id)}
                  data-testid={`button-disconnect-${provider.key}`}
                  className="flex-shrink-0"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleConnect(provider.key)}
                  disabled={isConnecting === provider.key}
                  data-testid={`button-connect-${provider.key}`}
                  className="flex-shrink-0"
                >
                  {isConnecting === provider.key ? 'Connecting...' : 'Connect'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
