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
  DollarSign,
  Calendar,
  Globe,
  Brain,
  Search,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { authedFetch, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'wouter';

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

function useRunMaintenance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/maintenance/run-now');
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: 'Maintenance Started',
        description: `Job ID: ${data.jobId || 'Started'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/maintenance'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to start maintenance',
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
          <DollarSign className="w-5 h-5" />
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

function RecommendationsCard() {
  const recommendations = [
    {
      title: 'Balanced Option',
      icon: CheckCircle,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-950/30',
      details: '1000 pubs/night with Google + whatpub',
      cost: '£27/night = £810/month',
      cycle: '88-day cycle (quarterly refresh)',
      note: 'Good balance of freshness vs cost',
    },
    {
      title: 'Budget Option',
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      details: '500 pubs/night, Google only',
      cost: '£9.50/night = £285/month',
      cycle: '176-day cycle (semi-annual refresh)',
      note: null,
    },
    {
      title: 'Premium Option',
      icon: Zap,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      details: '2000 pubs/night, all sources',
      cost: '£54/night = £1,620/month',
      cycle: '44-day cycle (monthly refresh)',
      note: null,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Recommended Settings
        </CardTitle>
        <CardDescription>For your use case</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((rec, index) => {
          const Icon = rec.icon;
          return (
            <div key={index} className={`p-4 rounded-lg ${rec.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${rec.color}`} />
                <span className="font-medium">{rec.title}</span>
              </div>
              <p className="text-sm mb-1">{rec.details}</p>
              <p className="text-sm text-muted-foreground">• Cost: {rec.cost}</p>
              <p className="text-sm text-muted-foreground">• {rec.cycle}</p>
              {rec.note && <p className="text-sm text-muted-foreground mt-1 italic">{rec.note}</p>}
            </div>
          );
        })}
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
  const { data: settings, isLoading: settingsLoading } = useMaintenanceSettings();
  const { data: stats, isLoading: statsLoading } = useDatabaseStats();
  const saveSettings = useSaveSettings();
  const runMaintenance = useRunMaintenance();

  // Local state for editing
  const [localSettings, setLocalSettings] = useState<MaintenanceSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize local settings when data loads
  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
    }
  }, [settings, localSettings]);

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
    runMaintenance.mutate();
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
          />
          <span className="text-sm font-medium">
            {currentSettings?.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Main Grid */}
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
          
          <RecommendationsCard />
          
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
          disabled={runMaintenance.isPending}
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          {runMaintenance.isPending ? 'Starting...' : 'Run Now (Test)'}
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
    </div>
  );
}

