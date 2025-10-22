import { Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
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

export type RunStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export type RunItem = {
  id: string;
  label: string;
  startedAt: string;
  finishedAt?: string | null;
  status: RunStatus;
  archived?: boolean;
  externalUrl?: string;
};

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

interface AppSidebarProps {
  defaultCountry: string;
  onCountryChange: (country: string) => void;
  runs?: RunItem[];
  onSelectRun?: (id: string) => void;
  onStopRun?: (id: string) => void;
  onArchiveRun?: (id: string, archived: boolean) => void;
  onRetryRun?: (id: string) => void;
  onDuplicateRun?: (id: string, newId: string) => void;
  onOpenExternal?: (url: string, id: string) => void;
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
  };
}> = ({ run, onSelect, actions }) => {
  return (
    <div
      className="group relative flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 mb-2 cursor-pointer hover-elevate active-elevate-2"
      onClick={() => onSelect(run.id)}
      role="button"
      aria-label={`Select run ${run.label}`}
      data-testid={`run-item-${run.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {run.label}
          </span>
          <Badge status={run.status} />
          {run.archived ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              archived
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">Sent {fmtTime(run.startedAt)}</div>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          className="hidden sm:inline-block text-[12px] rounded-lg border border-destructive px-2 py-1 text-destructive hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={actions.stop}
          aria-label="Stop workflow"
          title="Stop workflow"
          data-testid={`button-stop-${run.id}`}
        >
          Stop
        </button>

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
          <DropdownMenuContent 
            align="end" 
            className="w-56 bg-popover text-popover-foreground border border-border"
            sideOffset={4}
          >
            <DropdownMenuItem onClick={actions.view} data-testid="menu-item-0">
              View in Bubble
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.retry} data-testid="menu-item-1">
              Retry
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.duplicate} data-testid="menu-item-2">
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.archiveToggle} data-testid="menu-item-3">
              {run.archived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.stop} data-testid="menu-item-4">
              Stop workflow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export function AppSidebar({ 
  defaultCountry, 
  onCountryChange,
  runs = [],
  onSelectRun,
  onStopRun,
  onArchiveRun,
  onRetryRun,
  onDuplicateRun,
  onOpenExternal,
}: AppSidebarProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [localRuns, setLocalRuns] = useState<RunItem[]>(runs);

  useEffect(() => {
    setLocalRuns(runs);
  }, [runs.length]);

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

  const _select = (id: string) => {
    onSelectRun?.(id);
  };

  const _stop = (id: string) => {
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

  const _duplicate = (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    const newRun: RunItem = {
      ...ref,
      id: newId(),
      label: `${ref.label} (copy)`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "queued",
      archived: false,
    };
    mutate((prev) => [newRun, ...prev]);
    onDuplicateRun?.(id, newRun.id);
  };

  const _openExternal = (id: string) => {
    const ref = localRuns.find((r) => r.id === id);
    if (!ref) return;
    if (ref.externalUrl) {
      onOpenExternal?.(ref.externalUrl, id);
      if (!onOpenExternal) window.open(ref.externalUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("No external link available for this run.");
    }
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
            }}
          />
        ))
      )}
    </div>
  );

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
          <SidebarGroupContent className="px-4 py-2">
            <p className="text-sm text-muted-foreground">
              This country will be used for all searches unless you specify a different location in your message.
            </p>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Runs</SidebarGroupLabel>
          <SidebarGroupContent className="px-3">
            <p className="text-xs text-muted-foreground mb-3">
              AutoGen API calls you've sent. Click to view. Use Stop to cancel. Menu for more actions.
            </p>

            <div className="flex items-center justify-between mb-3">
              <label className="text-[12px] text-foreground flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={showArchived}
                  onChange={() => setShowArchived((v) => !v)}
                  data-testid="checkbox-show-archived"
                />
                Show archived
              </label>
            </div>

            {renderRunSection(todays, "Today")}
            {renderRunSection(previous, "Previous")}

            <div className="mt-3 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">
                Tip: Retry re-queues the same request. Duplicate creates a copy you can edit before sending (if your app supports it).
              </p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
