/**
 * Master Database Maintenance Control Panel
 * 
 * Admin/developer-only page for managing the nightly pub database
 * maintenance job that keeps 88,000 pubs up-to-date.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Database,
  Settings,
  Play,
  FileText,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  Zap,
  PoundSterling,
  Calendar,
  Globe,
  Brain,
  Search,
  TrendingUp,
  Shield,
  Loader2,
  StopCircle,
  XCircle,
  User,
  Home,
  Link2,
} from 'lucide-react';
import {
  useDatabaseUpdateJob,
  formatDuration,
  formatTime,
  calculateRemaining,
  calculateCostRemaining,
  calculateProgressPercentage,
  type JobState,
  type JobSettings as JobSettingsType,
} from '@/hooks/useDatabaseUpdateJob';
import { authedFetch, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'wouter';
import { useUser } from '@/contexts/UserContext';

// ============================================
// ACCESS CONTROL
// ============================================

const ADMIN_EMAILS = ['phil@wyshbone.com', 'phil@listersbrewery.com'];

function hasAdminAccess(user: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

// ============================================
// TYPES
// ============================================

interface MaintenanceSettings {
  enabled: boolean;
  pubsPerNight: number;
  schedule: 'nightly' | 'every3days' | 'weekly' | 'manual';
  dataSources: {
    googlePlaces: boolean;
    whatpubAnalysis: boolean;
    deepOwnership: boolean;
  };
  lastRun: string | null;
  nextRun: string;
}

interface DatabaseStats {
  totalPubs: number;
  verifiedPubs: number;
  percentComplete: number;
  daysToComplete: number;
}

// Cost per pub for each data source (in GBP)
const COSTS = {
  googlePlaces: 0.019,
  whatpubAnalysis: 0.008,
  deepOwnership: 0.045,
};

// Recommended settings presets
const RECOMMENDED_SETTINGS = {
  startup: {
    pubsPerNight: 2000,
    sources: ['google', 'whatpub'] as const,
    schedule: 'nightly' as const,
    cost: '£54/night',
    reason: 'Get database current quickly (44 days)',
  },
  maintenance: {
    pubsPerNight: 1000,
    sources: ['google', 'whatpub'] as const,
    schedule: 'nightly' as const,
    cost: '£27/night',
    reason: 'Balance of freshness and cost (88 days)',
  },
  budget: {
    pubsPerNight: 500,
    sources: ['google'] as const,
    schedule: 'nightly' as const,
    cost: '£9.50/night',
    reason: 'Minimal cost, basics only (176 days)',
  },
};

// ============================================
// HOOKS
// ============================================

function useMaintenanceSettings() {
  return useQuery({
    queryKey: ['/api/admin/maintenance/settings'],
    queryFn: async (): Promise<MaintenanceSettings> => {
      try {
        const response = await authedFetch('/api/admin/maintenance/settings');
        if (!response.ok) {
          // Return defaults if not found
          return {
            enabled: true,
            pubsPerNight: 2000,
            schedule: 'nightly',
            dataSources: {
              googlePlaces: true,
              whatpubAnalysis: true,
              deepOwnership: false,
            },
            lastRun: null,
            nextRun: getNextScheduledRun(),
          };
        }
        return response.json();
      } catch {
        // Return defaults on error
        return {
          enabled: true,
          pubsPerNight: 2000,
          schedule: 'nightly',
          dataSources: {
            googlePlaces: true,
            whatpubAnalysis: true,
            deepOwnership: false,
          },
          lastRun: null,
          nextRun: getNextScheduledRun(),
        };
      }
    },
    staleTime: 30000,
  });
}

function useDatabaseStats() {
  return useQuery({
    queryKey: ['/api/admin/maintenance/stats'],
    queryFn: async (): Promise<DatabaseStats> => {
      try {
        const response = await authedFetch('/api/admin/maintenance/stats');
        if (!response.ok) {
          return { totalPubs: 88000, verifiedPubs: 10000, percentComplete: 11, daysToComplete: 44 };
        }
        return response.json();
      } catch {
        return { totalPubs: 88000, verifiedPubs: 10000, percentComplete: 11, daysToComplete: 44 };
      }
    },
    staleTime: 60000,
  });
}

function useSaveSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: Partial<MaintenanceSettings>) => {
      return apiRequest('POST', '/api/admin/maintenance/settings', settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/maintenance/settings'] });
      toast({
        title: 'Settings Saved',
        description: 'Database maintenance settings have been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });
}

// ============================================
// HELPERS
// ============================================

function getNextScheduledRun(): string {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(2, 0, 0, 0);
  if (now.getHours() >= 2) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  return nextRun.toISOString();
}

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function calculateCosts(
  pubsPerNight: number,
  dataSources: MaintenanceSettings['dataSources']
): { perNight: number; perMonth: number; perCycle: number; daysPerCycle: number } {
  let costPerPub = 0;
  if (dataSources.googlePlaces) costPerPub += COSTS.googlePlaces;
  if (dataSources.whatpubAnalysis) costPerPub += COSTS.whatpubAnalysis;
  if (dataSources.deepOwnership) costPerPub += COSTS.deepOwnership;

  const perNight = pubsPerNight * costPerPub;
  const perMonth = perNight * 30;
  const totalPubs = 88000;
  const daysPerCycle = Math.ceil(totalPubs / pubsPerNight);
  const perCycle = daysPerCycle * perNight;

  return { perNight, perMonth, perCycle, daysPerCycle };
}

// ============================================
// COMPONENTS
// ============================================

function StatusCard({ settings, stats }: { settings: MaintenanceSettings | undefined; stats: DatabaseStats | undefined }) {
  const percentComplete = stats?.percentComplete || 0;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Current Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant={settings?.enabled ? 'default' : 'secondary'} className={settings?.enabled ? 'bg-green-500' : ''}>
            {settings?.enabled ? '● ENABLED' : '○ DISABLED'}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Last Run</span>
          <span className="text-sm font-medium">
            {settings?.lastRun 
              ? formatDistanceToNow(new Date(settings.lastRun), { addSuffix: true })
              : 'Never'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Next Run</span>
          <span className="text-sm font-medium">
            {settings?.schedule === 'manual' 
              ? 'Manual only'
              : settings?.nextRun
                ? new Date(settings.nextRun).toLocaleString()
                : 'Tonight at 2:00 AM'}
          </span>
        </div>

        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Database Progress</span>
            <span className="font-medium">
              {stats?.verifiedPubs?.toLocaleString() || '0'} / {stats?.totalPubs?.toLocaleString() || '88,000'} verified
            </span>
          </div>
          <Progress value={percentComplete} className="h-3" />
          <p className="text-xs text-muted-foreground text-center">{percentComplete}% complete</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchSizeCard({
  pubsPerNight,
  schedule,
  onChange,
}: {
  pubsPerNight: number;
  schedule: string;
  onChange: (field: string, value: any) => void;
}) {
  const [customValue, setCustomValue] = useState('');
  const presets = [500, 1000, 2000, 5000];
  const totalPubs = 88000;
  const daysToComplete = Math.ceil(totalPubs / pubsPerNight);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Batch Size & Frequency
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Pubs per night</Label>
          <div className="flex flex-wrap gap-2">
            {presets.map((value) => (
              <Button
                key={value}
                variant={pubsPerNight === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onChange('pubsPerNight', value)}
              >
                {value.toLocaleString()}
              </Button>
            ))}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Custom"
                className="w-24 h-9"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onBlur={() => {
                  const val = parseInt(customValue);
                  if (val > 0) onChange('pubsPerNight', val);
                }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Schedule</Label>
          <RadioGroup value={schedule} onValueChange={(value) => onChange('schedule', value)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nightly" id="nightly" />
              <Label htmlFor="nightly" className="font-normal">Nightly at 2:00 AM</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="every3days" id="every3days" />
              <Label htmlFor="every3days" className="font-normal">Every 3 days</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="weekly" id="weekly" />
              <Label htmlFor="weekly" className="font-normal">Weekly</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="manual" id="manual" />
              <Label htmlFor="manual" className="font-normal">Manual only</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="p-3 bg-muted/50 rounded-md">
          <p className="text-sm">
            <span className="font-medium">Full database refresh cycle:</span>{' '}
            <span className="text-primary font-bold">{daysToComplete} days</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DataSourcesCard({
  dataSources,
  onChange,
}: {
  dataSources: MaintenanceSettings['dataSources'];
  onChange: (sources: MaintenanceSettings['dataSources']) => void;
}) {
  const sources = [
    {
      key: 'googlePlaces' as const,
      icon: Globe,
      name: 'Google Places API',
      description: 'Update: Phone, rating, open/closed',
      cost: COSTS.googlePlaces,
      warning: null,
    },
    {
      key: 'whatpubAnalysis' as const,
      icon: Search,
      name: 'whatpub.com Analysis (Claude AI)',
      description: 'Update: Manager, freehouse status, URLs',
      cost: COSTS.whatpubAnalysis,
      warning: null,
    },
    {
      key: 'deepOwnership' as const,
      icon: Brain,
      name: 'Deep Ownership Research (Claude AI)',
      description: 'Research: Detailed owner info, history',
      cost: COSTS.deepOwnership,
      warning: 'Expensive! Recommend on-demand only',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Sources to Use
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sources.map((source) => {
          const Icon = source.icon;
          return (
            <div key={source.key} className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                id={source.key}
                checked={dataSources[source.key]}
                onCheckedChange={(checked) => {
                  onChange({ ...dataSources, [source.key]: checked });
                }}
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor={source.key} className="flex items-center gap-2 cursor-pointer">
                  <Icon className="w-4 h-4" />
                  {source.name}
                </Label>
                <p className="text-xs text-muted-foreground">{source.description}</p>
                <p className="text-xs font-medium text-primary">Cost: {formatCurrency(source.cost)} per pub</p>
                {source.warning && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {source.warning}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CostCalculatorCard({
  pubsPerNight,
  dataSources,
}: {
  pubsPerNight: number;
  dataSources: MaintenanceSettings['dataSources'];
}) {
  const costs = calculateCosts(pubsPerNight, dataSources);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <PoundSterling className="w-5 h-5" />
          Cost Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Per Night:</p>
          {dataSources.googlePlaces && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Google Places: {pubsPerNight.toLocaleString()} × {formatCurrency(COSTS.googlePlaces)}</span>
              <span>{formatCurrency(pubsPerNight * COSTS.googlePlaces)}</span>
            </div>
          )}
          {dataSources.whatpubAnalysis && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">whatpub Analysis: {pubsPerNight.toLocaleString()} × {formatCurrency(COSTS.whatpubAnalysis)}</span>
              <span>{formatCurrency(pubsPerNight * COSTS.whatpubAnalysis)}</span>
            </div>
          )}
          {dataSources.deepOwnership && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deep Ownership: {pubsPerNight.toLocaleString()} × {formatCurrency(COSTS.deepOwnership)}</span>
              <span>{formatCurrency(pubsPerNight * COSTS.deepOwnership)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-medium">
            <span>Total per night:</span>
            <span className="text-primary">{formatCurrency(costs.perNight)}</span>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Per Month (30 nights):</span>
            <span className="font-medium">{formatCurrency(costs.perMonth)}</span>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Full Database Cycle:</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{costs.daysPerCycle} nights × {formatCurrency(costs.perNight)}</span>
            <span className="font-medium">{formatCurrency(costs.perCycle)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Updates entire 88k database</p>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
          <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
            <Info className="w-3 h-3" />
            This cost is shared across ALL workspaces
          </p>
        </div>

        {/* High cost warning */}
        {costs.perMonth > 1000 && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>High Monthly Cost</AlertTitle>
            <AlertDescription>
              These settings will cost £{costs.perMonth.toFixed(0)}/month.
              Consider reducing batch size or disabling expensive sources.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function HowItWorksCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Info className="w-5 h-5" />
          How It Works Together
        </CardTitle>
        <CardDescription>Master DB vs User Sleeper Agents</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-blue-500" />
            <span className="font-medium">Master Database (This Panel)</span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 ml-7">
            <li>• Updates 1000-2000 pubs/night</li>
            <li>• Keeps phone numbers current</li>
            <li>• Marks closed pubs</li>
            <li>• Basic freehouse detection</li>
            <li>• Shared cost across ALL workspaces</li>
          </ul>
        </div>
        
        <div className="flex justify-center">
          <div className="text-center text-xs text-muted-foreground">
            <p>↓ Provides CLEAN DATA for ↓</p>
          </div>
        </div>
        
        <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-5 h-5 text-green-500" />
            <span className="font-medium">User Sleeper Agents (Per Workspace)</span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 ml-7">
            <li>• Search within user's delivery areas</li>
            <li>• Filter by user preferences</li>
            <li>• Find NEW prospects (not in 88k yet)</li>
            <li>• Personalized recommendations</li>
            <li>• "You'd love this new micropub!"</li>
          </ul>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2 ml-7">
            → Configure in: Workspace Settings → Sleeper Agent
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface RecommendationsCardProps {
  onApply: (preset: keyof typeof RECOMMENDED_SETTINGS) => void;
}

function RecommendationsCard({ onApply }: RecommendationsCardProps) {
  const recommendations = [
    {
      key: 'startup' as const,
      title: '🚀 Startup Mode',
      icon: Zap,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800',
      details: `${RECOMMENDED_SETTINGS.startup.pubsPerNight} pubs/night with Google + whatpub`,
      cost: RECOMMENDED_SETTINGS.startup.cost,
      cycle: RECOMMENDED_SETTINGS.startup.reason,
      note: 'Best for initial database population',
    },
    {
      key: 'maintenance' as const,
      title: '✅ Maintenance Mode',
      icon: CheckCircle,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800',
      details: `${RECOMMENDED_SETTINGS.maintenance.pubsPerNight} pubs/night with Google + whatpub`,
      cost: RECOMMENDED_SETTINGS.maintenance.cost,
      cycle: RECOMMENDED_SETTINGS.maintenance.reason,
      note: 'Recommended for ongoing use',
    },
    {
      key: 'budget' as const,
      title: '💷 Budget Mode',
      icon: PoundSterling,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      details: `${RECOMMENDED_SETTINGS.budget.pubsPerNight} pubs/night, Google only`,
      cost: RECOMMENDED_SETTINGS.budget.cost,
      cycle: RECOMMENDED_SETTINGS.budget.reason,
      note: 'Minimal cost, slower refresh',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Quick Presets
        </CardTitle>
        <CardDescription>Click to apply recommended settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec) => {
          const Icon = rec.icon;
          return (
            <button
              key={rec.key}
              onClick={() => onApply(rec.key)}
              className={`w-full text-left p-4 rounded-lg border-2 ${rec.bg} ${rec.border} hover:scale-[1.02] transition-transform cursor-pointer`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${rec.color}`} />
                  <span className="font-medium">{rec.title}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {rec.cost}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rec.details}</p>
              <p className="text-xs text-muted-foreground mt-1">→ {rec.cycle}</p>
              {rec.note && (
                <p className="text-xs mt-2 italic opacity-75">{rec.note}</p>
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================
// JOB DIALOGS AND PANELS
// ============================================

interface ConfirmStartDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  settings: JobSettingsType | null;
  costEstimate: { perPub: number; total: number; breakdown: { source: string; cost: number }[] } | null;
  durationEstimate: { minutes: number; formatted: string } | null;
  isLoading: boolean;
  isStarting: boolean;
}

function ConfirmStartDialog({
  open,
  onCancel,
  onConfirm,
  settings,
  costEstimate,
  durationEstimate,
  isLoading,
  isStarting,
}: ConfirmStartDialogProps) {
  if (!settings) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <DialogTitle>Confirm Manual Database Update</DialogTitle>
          </div>
          <DialogDescription>
            Review the estimated costs before starting
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">This will process:</p>
            <p className="text-2xl font-bold">{settings.pubsPerNight.toLocaleString()} pubs</p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Calculating costs...</span>
            </div>
          ) : costEstimate && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Estimated costs:</p>
              <div className="space-y-1 text-sm">
                {costEstimate.breakdown.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{item.source}:</span>
                    <span className="font-mono">£{item.cost.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total:</span>
                  <span className="font-mono">~£{costEstimate.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {durationEstimate && (
            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Estimated time:</strong> {durationEstimate.formatted}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                ⚠️ API costs cannot be refunded once incurred
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isStarting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isStarting || isLoading}>
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm & Start
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmCancelDialogProps {
  open: boolean;
  onContinue: () => void;
  onConfirm: () => void;
  jobState: JobState | null;
  isCancelling: boolean;
}

function ConfirmCancelDialog({
  open,
  onContinue,
  onConfirm,
  jobState,
  isCancelling,
}: ConfirmCancelDialogProps) {
  if (!jobState) return null;

  const progressPct = calculateProgressPercentage(jobState);
  const remainingCost = calculateCostRemaining(jobState);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onContinue()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <DialogTitle>Cancel Database Update?</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress so far:</span>
              <span className="font-medium">
                {jobState.progress.currentPub} / {jobState.progress.totalPubs} ({progressPct}%)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Cost incurred:</span>
              <span className="font-mono font-medium">£{jobState.costs.incurred.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">If you cancel:</p>
            <ul className="text-sm space-y-1">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>Current pub will finish processing</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>All progress will be saved</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>No new API calls will be made</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>You'll save ~£{remainingCost.toFixed(2)} in remaining costs</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onContinue} disabled={isCancelling}>
            Continue Running
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isCancelling}>
            {isCancelling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <StopCircle className="h-4 w-4 mr-2" />
                Cancel Job
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LiveProgressPanelProps {
  jobState: JobState;
  onRequestCancel: () => void;
}

function LiveProgressPanel({ jobState, onRequestCancel }: LiveProgressPanelProps) {
  const progressPct = calculateProgressPercentage(jobState);
  const elapsed = Date.now() - new Date(jobState.timing.startedAt).getTime();
  const remaining = calculateRemaining(jobState);

  return (
    <Card className="border-blue-500 border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          DATABASE UPDATE IN PROGRESS
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progress: {jobState.progress.currentPub} / {jobState.progress.totalPubs} pubs</span>
            <span className="font-mono">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-3" />
        </div>

        {/* Current Status */}
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className="font-medium truncate max-w-[200px]">{jobState.progress.currentPubName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Started:</span>
            <span className="font-mono">{formatTime(jobState.timing.startedAt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Elapsed:</span>
            <span className="font-mono">{formatDuration(elapsed)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Est. remaining:</span>
            <span className="font-mono">{formatDuration(remaining)}</span>
          </div>
        </div>

        {/* Results So Far */}
        <div className="border-t pt-4">
          <h4 className="font-medium text-sm mb-3">Results so far:</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Updated: {jobState.results.updated}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" />
              <span>New URLs: {jobState.results.newUrls}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-purple-500" />
              <span>Managers: {jobState.results.managersFound}</span>
            </div>
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-teal-500" />
              <span>Freehouses: {jobState.results.freehousesDetected}</span>
            </div>
            {jobState.results.errors > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Errors: {jobState.results.errors}</span>
              </div>
            )}
            {jobState.results.closedPubs > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>Closed: {jobState.results.closedPubs}</span>
              </div>
            )}
          </div>
        </div>

        {/* Cost Counter */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">💷 Cost incurred:</span>
            <div className="text-right">
              <span className="text-2xl font-bold font-mono">
                £{jobState.costs.incurred.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground ml-2">
                / ~£{jobState.costs.estimated.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={onRequestCancel}
        >
          <StopCircle className="h-4 w-4 mr-2" />
          Cancel Job
        </Button>
      </CardContent>
    </Card>
  );
}

interface JobSummaryPanelProps {
  jobState: JobState;
  onClose: () => void;
}

function JobSummaryPanel({ jobState, onClose }: JobSummaryPanelProps) {
  const progressPct = calculateProgressPercentage(jobState);
  const duration = jobState.timing.completedAt
    ? new Date(jobState.timing.completedAt).getTime() - new Date(jobState.timing.startedAt).getTime()
    : 0;
  const savedCost = jobState.costs.estimated - jobState.costs.incurred;

  const isCancelled = jobState.status === 'cancelled';
  const isFailed = jobState.status === 'failed';

  return (
    <Card className={isCancelled ? 'border-amber-500 border-2' : isFailed ? 'border-red-500 border-2' : 'border-green-500 border-2'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isCancelled ? (
            <>
              <StopCircle className="h-5 w-5 text-amber-500" />
              JOB CANCELLED
            </>
          ) : isFailed ? (
            <>
              <XCircle className="h-5 w-5 text-red-500" />
              JOB FAILED
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              JOB COMPLETED
            </>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {isFailed && jobState.errorMessage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{jobState.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md space-y-2">
          <div className="flex justify-between text-sm">
            <span>Completed:</span>
            <span className="font-medium">
              {jobState.progress.currentPub} / {jobState.progress.totalPubs} pubs ({progressPct}%)
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Duration:</span>
            <span className="font-mono">{formatDuration(duration)}</span>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-sm mb-3">Results:</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>✓ Updated pubs:</span>
              <span className="font-medium">{jobState.results.updated}</span>
            </div>
            <div className="flex justify-between">
              <span>✓ New whatpub URLs:</span>
              <span className="font-medium">{jobState.results.newUrls}</span>
            </div>
            <div className="flex justify-between">
              <span>✓ Managers found:</span>
              <span className="font-medium">{jobState.results.managersFound}</span>
            </div>
            <div className="flex justify-between">
              <span>✓ Freehouses detected:</span>
              <span className="font-medium">{jobState.results.freehousesDetected}</span>
            </div>
            {jobState.results.closedPubs > 0 && (
              <div className="flex justify-between">
                <span>🚫 Closed pubs:</span>
                <span className="font-medium">{jobState.results.closedPubs}</span>
              </div>
            )}
            {jobState.results.errors > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>⚠️ Errors:</span>
                <span className="font-medium">{jobState.results.errors}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">💷 Total cost:</span>
            <span className="text-2xl font-bold font-mono">
              £{jobState.costs.incurred.toFixed(2)}
            </span>
          </div>
          {isCancelled && savedCost > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>💰 Saved by cancelling:</span>
              <span className="font-mono font-medium">
                £{savedCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {isCancelled && jobState.lastPubProcessed && (
          <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-200 mb-1">Resume information:</p>
            <p className="text-blue-700 dark:text-blue-300">
              Last verified: "{jobState.lastPubProcessed}"
              {jobState.nextPubToProcess && (
                <>
                  <br />
                  Next run will continue from: "{jobState.nextPubToProcess}"
                </>
              )}
            </p>
          </div>
        )}

        <Button onClick={onClose} className="w-full">
          <CheckCircle className="h-4 w-4 mr-2" />
          Close
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DatabaseMaintenance() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { data: settings, isLoading: settingsLoading } = useMaintenanceSettings();
  const { data: stats, isLoading: statsLoading } = useDatabaseStats();
  const saveSettings = useSaveSettings();

  // Job management hook
  const {
    jobState,
    isRunning,
    isFinished,
    showConfirmStart,
    showConfirmCancel,
    pendingSettings,
    costEstimate,
    durationEstimate,
    isEstimating,
    requestStart,
    confirmStart,
    cancelStart,
    requestCancel,
    confirmCancel,
    continueRunning,
    closeJobSummary,
    isStarting,
    isCancelling,
  } = useDatabaseUpdateJob();

  // Local state for editing
  const [localSettings, setLocalSettings] = useState<MaintenanceSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Access control check
  const isAdmin = hasAdminAccess(user);

  // Initialize local settings when data loads
  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
    }
  }, [settings, localSettings]);

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="w-5 h-5" />
              Access Restricted
            </CardTitle>
            <CardDescription>
              This control panel is restricted to system administrators only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Master database maintenance affects all workspaces and has significant cost implications.
              Contact your administrator if you need access.
            </p>
            <Button variant="outline" onClick={() => setLocation('/')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (field: string, value: any) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, [field]: value });
    setHasChanges(true);
  };

  const handleDataSourcesChange = (dataSources: MaintenanceSettings['dataSources']) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, dataSources });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (localSettings) {
      saveSettings.mutate(localSettings);
      setHasChanges(false);
    }
  };

  const handleRunNow = () => {
    if (!currentSettings) return;
    
    // Build job settings from current form settings
    const jobSettings: JobSettingsType = {
      pubsPerNight: currentSettings.pubsPerNight,
      enableGoogle: currentSettings.dataSources.googlePlaces,
      enableWhatpub: currentSettings.dataSources.whatpubAnalysis,
      enableDeepResearch: currentSettings.dataSources.deepOwnership,
    };
    
    // Show confirmation dialog
    requestStart(jobSettings);
  };

  const handleApplyPreset = (preset: keyof typeof RECOMMENDED_SETTINGS) => {
    const presetSettings = RECOMMENDED_SETTINGS[preset];
    
    const newDataSources = {
      googlePlaces: presetSettings.sources.includes('google'),
      whatpubAnalysis: presetSettings.sources.includes('whatpub'),
      deepOwnership: false, // Never auto-enable deep research
    };

    setLocalSettings({
      ...localSettings!,
      pubsPerNight: presetSettings.pubsPerNight,
      schedule: presetSettings.schedule,
      dataSources: newDataSources,
    });
    setHasChanges(true);

    toast({
      title: `Applied ${preset.charAt(0).toUpperCase() + preset.slice(1)} Preset`,
      description: `Settings updated to ${presetSettings.pubsPerNight} pubs/night. Click "Save Settings" to apply.`,
    });
  };

  const isLoading = settingsLoading || statsLoading;
  const currentSettings = localSettings || settings;

  if (isLoading && !currentSettings) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto h-full">
        <div className="space-y-2">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Dialogs */}
      <ConfirmStartDialog
        open={showConfirmStart}
        onCancel={cancelStart}
        onConfirm={confirmStart}
        settings={pendingSettings}
        costEstimate={costEstimate}
        durationEstimate={durationEstimate}
        isLoading={isEstimating}
        isStarting={isStarting}
      />
      
      <ConfirmCancelDialog
        open={showConfirmCancel}
        onContinue={continueRunning}
        onConfirm={confirmCancel}
        jobState={jobState}
        isCancelling={isCancelling}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Database className="w-8 h-8" />
            Master Database Maintenance
          </h1>
          <p className="text-muted-foreground mt-1">
            Keep the 88,000 pub database up-to-date for all users
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={currentSettings?.enabled || false}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
            disabled={isRunning}
          />
          <span className="text-sm font-medium">
            {currentSettings?.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Show progress panel when job is running */}
      {isRunning && jobState && (
        <LiveProgressPanel
          jobState={jobState}
          onRequestCancel={requestCancel}
        />
      )}

      {/* Show summary when job is finished */}
      {isFinished && jobState && (
        <JobSummaryPanel
          jobState={jobState}
          onClose={closeJobSummary}
        />
      )}

      {/* Main Grid - only show when not running and not showing summary */}
      {!isRunning && !isFinished && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              <StatusCard settings={currentSettings} stats={stats} />
              
              <BatchSizeCard
                pubsPerNight={currentSettings?.pubsPerNight || 2000}
                schedule={currentSettings?.schedule || 'nightly'}
                onChange={handleChange}
              />
              
              <DataSourcesCard
                dataSources={currentSettings?.dataSources || { googlePlaces: true, whatpubAnalysis: true, deepOwnership: false }}
                onChange={handleDataSourcesChange}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <CostCalculatorCard
                pubsPerNight={currentSettings?.pubsPerNight || 2000}
                dataSources={currentSettings?.dataSources || { googlePlaces: true, whatpubAnalysis: true, deepOwnership: false }}
              />
              
              <RecommendationsCard onApply={handleApplyPreset} />
              
              <HowItWorksCard />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t">
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || saveSettings.isPending}
              className="gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {saveSettings.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleRunNow}
              disabled={isRunning}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Run Now (Test)
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => setLocation('/dev/sleeper-agent')}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              View Logs
            </Button>

            {hasChanges && (
              <span className="text-sm text-amber-600 ml-auto">
                You have unsaved changes
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

