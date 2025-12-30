/**
 * Trade Store Settings Page
 * 
 * Configure the B2B customer portal.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useTradeStoreSettings, 
  useUpdateTradeStoreSettings,
  useTradeStoreAccessList,
  useGrantTradeStoreAccess,
} from '@/features/brewery/useTradeStore';
import { useCrmCustomers } from '@/features/crm/useCrmCustomers';
import { 
  Store, 
  Users, 
  Settings, 
  Copy, 
  Check,
  ExternalLink,
  UserPlus
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function TradeStoreSettings() {
  const { data: settings, isLoading: settingsLoading } = useTradeStoreSettings();
  const updateSettings = useUpdateTradeStoreSettings();
  const { data: accessList, isLoading: accessLoading } = useTradeStoreAccessList();
  const grantAccess = useGrantTradeStoreAccess();
  const { data: customers } = useCrmCustomers();
  const { toast } = useToast();
  
  const [form, setForm] = useState({
    isEnabled: false,
    storeName: '',
    welcomeMessage: '',
    primaryColor: '#1a56db',
    requireApproval: true,
    showStockLevels: true,
    allowBackorders: false,
    minOrderValue: '',
  });
  
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setForm({
        isEnabled: settings.isEnabled === 1,
        storeName: settings.storeName || '',
        welcomeMessage: settings.welcomeMessage || '',
        primaryColor: settings.primaryColor || '#1a56db',
        requireApproval: settings.requireApproval === 1,
        showStockLevels: settings.showStockLevels === 1,
        allowBackorders: settings.allowBackorders === 1,
        minOrderValue: settings.minOrderValue ? (settings.minOrderValue / 100).toString() : '',
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      isEnabled: form.isEnabled ? 1 : 0,
      storeName: form.storeName || null,
      welcomeMessage: form.welcomeMessage || null,
      primaryColor: form.primaryColor,
      requireApproval: form.requireApproval ? 1 : 0,
      showStockLevels: form.showStockLevels ? 1 : 0,
      allowBackorders: form.allowBackorders ? 1 : 0,
      minOrderValue: form.minOrderValue ? Math.round(parseFloat(form.minOrderValue) * 100) : null,
    });
  };

  const handleGrantAccess = () => {
    if (!selectedCustomerId) return;
    grantAccess.mutate(selectedCustomerId, {
      onSuccess: () => {
        setGrantDialogOpen(false);
        setSelectedCustomerId('');
      },
    });
  };

  const copyAccessCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: 'Access code copied!' });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filter customers who don't have access yet
  const customersWithoutAccess = customers?.filter(
    c => !accessList?.some(a => a.customerId === c.id)
  ) || [];

  if (settingsLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Store className="h-8 w-8" />
            Trade Store
          </h1>
          <p className="text-muted-foreground">
            Configure your B2B customer self-service portal
          </p>
        </div>
        {form.isEnabled && (
          <Badge variant="default" className="bg-green-600">
            Active
          </Badge>
        )}
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="access">
            <Users className="h-4 w-4 mr-2" />
            Customer Access
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Configuration</CardTitle>
              <CardDescription>
                Configure your trade store settings and branding
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Trade Store</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to log in and place orders
                  </p>
                </div>
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm({ ...form, isEnabled: v })}
                />
              </div>

              {/* Store Name */}
              <div className="space-y-2">
                <Label>Store Name</Label>
                <Input
                  placeholder="e.g., Acme Brewery Trade Store"
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                />
              </div>

              {/* Welcome Message */}
              <div className="space-y-2">
                <Label>Welcome Message</Label>
                <Textarea
                  placeholder="Welcome to our trade store..."
                  value={form.welcomeMessage}
                  onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                />
              </div>

              {/* Primary Color */}
              <div className="space-y-2">
                <Label>Brand Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="w-16 h-10 p-1"
                  />
                  <Input
                    value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Require Approval</Label>
                    <p className="text-xs text-muted-foreground">
                      Manually approve customer access
                    </p>
                  </div>
                  <Switch
                    checked={form.requireApproval}
                    onCheckedChange={(v) => setForm({ ...form, requireApproval: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Show Stock Levels</Label>
                    <p className="text-xs text-muted-foreground">
                      Display available stock to customers
                    </p>
                  </div>
                  <Switch
                    checked={form.showStockLevels}
                    onCheckedChange={(v) => setForm({ ...form, showStockLevels: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Allow Backorders</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow ordering out-of-stock items
                    </p>
                  </div>
                  <Switch
                    checked={form.allowBackorders}
                    onCheckedChange={(v) => setForm({ ...form, allowBackorders: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Minimum Order Value (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.minOrderValue}
                    onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Customer Access</CardTitle>
                <CardDescription>
                  Manage which customers can access the trade store
                </CardDescription>
              </div>
              <Button onClick={() => setGrantDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Grant Access
              </Button>
            </CardHeader>
            <CardContent>
              {accessLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : accessList && accessList.length > 0 ? (
                <div className="space-y-3">
                  {accessList.map((access) => (
                    <div 
                      key={access.id} 
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{access.customerName}</p>
                        <p className="text-sm text-muted-foreground">
                          Code: <code className="bg-muted px-1 rounded">{access.accessCode}</code>
                        </p>
                        {access.lastLoginAt && (
                          <p className="text-xs text-muted-foreground">
                            Last login: {new Date(access.lastLoginAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={access.isActive ? 'default' : 'secondary'}>
                          {access.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => copyAccessCode(access.accessCode)}
                        >
                          {copiedCode === access.accessCode ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3" />
                  <p>No customers have access yet</p>
                  <p className="text-sm">Grant access to customers so they can use the trade store</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grant Access Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Trade Store Access</DialogTitle>
            <DialogDescription>
              Select a customer to grant access to the trade store. They will receive a unique access code.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>Select Customer</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a customer..." />
              </SelectTrigger>
              <SelectContent>
                {customersWithoutAccess.length > 0 ? (
                  customersWithoutAccess.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">
                    All customers already have access
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGrantAccess}
              disabled={!selectedCustomerId || grantAccess.isPending}
            >
              {grantAccess.isPending ? 'Granting...' : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

