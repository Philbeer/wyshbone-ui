import { Globe, MessageSquare, Bug, FilePlus, MessagesSquare, ChevronDown, ChevronRight, Clock, Edit2, Trash2, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  );
};


const RunRow: React.FC<{
  run: RunItem;
  onSelect: (id: string) => void;
  actions: {
    view: () => void;
    retry: () => void;
    duplicate: () => void;
    stop: () => void;
    archiveToggle: () => void;
    run: () => void;
  };
}> = ({ run, onSelect, actions }) => {
  const isDeepResearch = run.runType === "deep_research";
  const cardBgClass = isDeepResearch 
    ? "bg-purple-50 dark:bg-purple-950/20" 
    : "bg-blue-50 dark:bg-blue-950/20";
  
  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-xl border border-border ${cardBgClass} px-3 py-4 mb-2 cursor-pointer hover-elevate active-elevate-2 min-h-[120px]`}
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
              {run.label}
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
  const [showArchived, setShowArchived] = useState(false);
  const [localRuns, setLocalRuns] = useState<RunItem[]>(runs);
  const [showPreviousChats, setShowPreviousChats] = useState(false);

  useEffect(() => {
    setLocalRuns(runs);
  }, [runs]);

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

  const mutate = (fn: (prev: RunItem[]) => RunItem[]) => {
    setLocalRuns((prev) => fn(prev));
  };

  const _select = async (id: string) => {
    const run = localRuns.find((r) => r.id === id);
    
    // Track view for deep research runs (for summarization feature)
    if (run && run.runType === "deep_research") {
      try {
        await fetch(`/api/deep-research/${id}/view`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
        console.log(`📊 Tracked view for deep research run: ${id}`);
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
        const response = await fetch(`/api/deep-research/${id}/stop`, {
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
        const response = await fetch(`/api/deep-research/${id}/duplicate`, {
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
    
    // Handle deep research runs
    if (ref.runType === "deep_research") {
      window.open(`/api/deep-research/${id}`, "_blank", "noopener,noreferrer");
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

  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
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

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"} data-testid="link-chat">
                  <Link href="/">
                    <MessageSquare className="h-4 w-4" />
                    <span>Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => onNewChat?.()}
                  data-testid="button-new-chat"
                >
                  <FilePlus className="h-4 w-4" />
                  <span>New Chat</span>
                </SidebarMenuButton>
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
                      <div className="space-y-1 px-3">
                        {conversations.slice(0, 10).map((conversation) => (
                          <button
                            key={conversation.id}
                            onClick={() => onSelectConversation?.(conversation.id)}
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scheduled Monitors
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3">
            <p className="text-xs text-muted-foreground mb-3">
              Automated tasks that run on a schedule
            </p>
            <ScheduledMonitorsSection userId="demo-user" />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Runs</SidebarGroupLabel>
          <SidebarGroupContent className="px-3">
            <p className="text-xs text-muted-foreground mb-3">
              AutoGen API calls you've sent. Click to view. Use Stop to cancel. Menu for more actions.
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
function ScheduledMonitorsSection({ userId }: { userId: string }) {
  const [editingMonitor, setEditingMonitor] = useState<any>(null);
  const [deletingMonitor, setDeletingMonitor] = useState<any>(null);
  const [editForm, setEditForm] = useState({ 
    label: '', 
    description: '',
    schedule: 'weekly' as 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly',
    scheduleDay: undefined as 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | undefined,
    scheduleTime: '',
    emailNotifications: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { data: monitors, isLoading, isError, error, refetch } = useQuery({
    queryKey: [`/api/scheduled-monitors/${userId}`],
    refetchInterval: 5000, // Refetch every 5 seconds to pick up monitors created via chat
  });

  const handleDeleteConfirm = async () => {
    if (!deletingMonitor) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/scheduled-monitors/${deletingMonitor.id}`, {
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
      emailNotifications: monitor.emailNotifications === 1
    });
  };
  
  const handleSaveEdit = async () => {
    if (!editingMonitor || !editForm.label.trim()) {
      alert('Label is required');
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/scheduled-monitors/${editingMonitor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label,
          schedule: editForm.schedule,
          scheduleDay: editForm.scheduleDay || null,
          scheduleTime: editForm.scheduleTime || null,
          emailNotifications: editForm.emailNotifications ? 1 : 0,
        }),
      });
      
      if (response.ok) {
        setEditingMonitor(null);
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
    return <p className="text-xs text-destructive">Failed to load monitors: {error instanceof Error ? error.message : 'Unknown error'}</p>;
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
                    {editingMonitor.monitorType === 'deep_research' ? 'Research' : editingMonitor.monitorType === 'business_search' ? 'Contacts' : 'Places'}
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
                onValueChange={(value: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly') => setEditForm({ ...editForm, schedule: value })}
              >
                <SelectTrigger id="edit-schedule" data-testid="select-edit-schedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once (for testing)</SelectItem>
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
            <div className="flex items-center justify-between p-3 rounded-md border border-border">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="edit-email" className="text-sm font-medium">
                  Email Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Send results to your email when this monitor runs
                </p>
                {editForm.emailNotifications && (
                  <p className="text-xs font-medium text-primary mt-1">
                    📧 Will send to: phil@listersbrewery.com
                  </p>
                )}
              </div>
              <Switch
                id="edit-email"
                checked={editForm.emailNotifications}
                onCheckedChange={(checked) => setEditForm({ ...editForm, emailNotifications: checked })}
                data-testid="switch-email-notifications"
              />
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
        
        return (
          <div
            key={monitor.id}
            className="p-3 rounded-md border border-border bg-card"
            data-testid={`monitor-${monitor.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <div className="font-medium text-sm truncate" data-testid={`text-monitor-label-${monitor.id}`}>
                  {monitor.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1" data-testid={`text-monitor-description-${monitor.id}`}>
                  {monitor.description}
                </div>
              </div>
              <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
            
            <div className="space-y-1 mt-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {monitor.schedule.charAt(0).toUpperCase() + monitor.schedule.slice(1)}
                  {monitor.scheduleDay && ` on ${monitor.scheduleDay.charAt(0).toUpperCase() + monitor.scheduleDay.slice(1)}s`}
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
                    {monitor.monitorType === 'deep_research' ? 'Research' : monitor.monitorType === 'business_search' ? 'Contacts' : 'Places'}
                  </span>
                  {monitor.emailNotifications === 1 && (
                    <Mail className="h-3 w-3 text-muted-foreground" title="Email notifications enabled" />
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
