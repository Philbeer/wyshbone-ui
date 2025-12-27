import { useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Settings, Trash2, Download, Upload, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DATA_SOURCE } from "@/lib/brewcrmService";

export default function BrewCrmSettingsPage() {
  const { user } = useUser();
  const { toast } = useToast();
  
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [defaultHlpa, setDefaultHlpa] = useState('4500');
  
  const handleClearAllData = () => {
    const keys = [
      'brewcrm_products',
      'brewcrm_customers',
      'brewcrm_orders',
      'brewcrm_routes',
      'brewcrm_stock',
      'brewcrm_containers',
      'brewcrm_locked_rates',
      'brewcrm_duty_reports',
    ];
    
    for (const key of keys) {
      localStorage.removeItem(key);
    }
    
    toast({ title: "All Brew CRM data cleared" });
    setShowClearDialog(false);
    
    // Force page reload to reset state
    window.location.reload();
  };
  
  const handleExportData = () => {
    const keys = [
      'brewcrm_products',
      'brewcrm_customers',
      'brewcrm_orders',
      'brewcrm_routes',
      'brewcrm_stock',
      'brewcrm_containers',
      'brewcrm_locked_rates',
      'brewcrm_duty_reports',
    ];
    
    const exportData: Record<string, unknown> = {};
    for (const key of keys) {
      const data = localStorage.getItem(key);
      if (data) {
        exportData[key] = JSON.parse(data);
      }
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brewcrm-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Data exported" });
  };
  
  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('brewcrm_')) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }
        
        toast({ title: "Data imported successfully" });
        window.location.reload();
      } catch (error) {
        toast({ title: "Failed to import data", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Badge variant="secondary">PARTIAL</Badge>
        </div>
        <p className="text-muted-foreground">
          Configure Brew CRM settings and manage data.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
      </div>
      
      {/* General Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Default values used across the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Default HLPA (Annual Production)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={defaultHlpa}
                onChange={(e) => setDefaultHlpa(e.target.value)}
                className="w-48"
              />
              <Button variant="outline" onClick={() => {
                localStorage.setItem('brewcrm_default_hlpa', defaultHlpa);
                toast({ title: "Setting saved" });
              }}>
                Save
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Used for duty rate calculations when no specific HLPA is provided
            </p>
          </div>
          
          <div>
            <Label>User ID</Label>
            <Input value={user.id} disabled className="w-96 font-mono" />
            <p className="text-sm text-muted-foreground mt-1">
              All data is scoped to this workspace ID
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Data Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Export, import, or clear all Brew CRM data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleExportData}>
              <Download className="h-4 w-4 mr-2" />
              Export All Data
            </Button>
            
            <div className="relative">
              <Input
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </Button>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <Button 
              variant="destructive" 
              onClick={() => setShowClearDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              This will permanently delete all products, customers, orders, routes, stock, and containers.
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About Brew CRM V1</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Version:</strong> 1.0.0 (throwaway integration UI branch)</p>
            <p><strong>Data Storage:</strong> localStorage (browser-local)</p>
            <p><strong>Branch:</strong> brewcrm-ui-skeleton</p>
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    This is a prototype UI
                  </p>
                  <p className="text-muted-foreground">
                    Data is stored in your browser's localStorage and will be lost if you clear browser data.
                    Export your data regularly if you want to preserve it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Clear Data Confirmation */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Brew CRM Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all:
              <ul className="list-disc ml-6 mt-2">
                <li>Products</li>
                <li>Customers</li>
                <li>Orders</li>
                <li>Routes</li>
                <li>Stock records</li>
                <li>Containers</li>
                <li>Locked duty rates</li>
                <li>Duty reports</li>
              </ul>
              <p className="mt-2 font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllData} className="bg-destructive text-destructive-foreground">
              Clear All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
