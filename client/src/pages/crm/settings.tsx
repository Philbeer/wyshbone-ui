import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { 
  useXeroStatus, 
  useXeroConnect, 
  useXeroDisconnect,
  useImportCustomersFromXero,
  useXeroImportJob,
  useXeroImportJobs,
} from "@/features/xero";
import { CheckCircle, XCircle, Download, Loader2, Link as LinkIcon, PartyPopper } from "lucide-react";

const formSchema = insertCrmSettingsSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function CrmSettings() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/crm/settings', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: settings || {
      industryVertical: "generic",
      defaultCountry: "United Kingdom",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', '/api/crm/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/settings'] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    updateMutation.mutate(data);
  };

  // Xero integration hooks
  const { data: xeroStatus, isLoading: xeroStatusLoading } = useXeroStatus();
  const xeroConnect = useXeroConnect();
  const xeroDisconnect = useXeroDisconnect();
  const importCustomers = useImportCustomersFromXero();
  const { data: importJobs } = useXeroImportJobs();

  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const { data: currentJob } = useXeroImportJob(currentJobId);

  // Xero connection success dialog
  const [showXeroSuccessDialog, setShowXeroSuccessDialog] = useState(false);

  // Detect ?xero=connected query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xeroParam = params.get('xero');
    const errorMessage = params.get('message');
    
    if (xeroParam === 'connected') {
      setShowXeroSuccessDialog(true);
      // Remove the query parameter from URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    } else if (xeroParam === 'error') {
      const errorDescriptions: Record<string, string> = {
        'missing_code_or_state': 'The OAuth process was interrupted. Please try again.',
        'invalid_state': 'Security validation failed. Please try connecting again.',
        'state_replay': 'This authorization link has already been used. Please start a new connection.',
        'token_exchange_failed': 'Failed to exchange authorization code. Please try again.',
        'connections_fetch_failed': 'Connected to Xero but failed to fetch organization details.',
      };
      
      toast({ 
        title: "Xero Connection Failed", 
        description: errorDescriptions[errorMessage || ''] || errorMessage || "There was an error connecting to Xero. Please try again.",
        variant: "destructive" 
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  const handleImportFromDialog = () => {
    setShowXeroSuccessDialog(false);
    handleImportCustomers();
  };

  const handleImportCustomers = () => {
    importCustomers.mutate(undefined, {
      onSuccess: (data) => {
        setCurrentJobId(data.jobId);
      },
    });
  };

  // Invalidate customers list when import completes
  if (currentJob?.status === 'completed' && currentJobId) {
    queryClient.invalidateQueries({ queryKey: ['/api/crm/customers'] });
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold" data-testid="text-settings-title">CRM Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your CRM system preferences</p>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Manage your CRM system configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="industryVertical"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry Vertical *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-industry-vertical">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="generic">Generic</SelectItem>
                            <SelectItem value="brewery">Brewery</SelectItem>
                            <SelectItem value="animal_physio">Animal Physiotherapy</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Country *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-default-country" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-settings">
                    {updateMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Xero Integration Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Xero Integration
            </CardTitle>
            <CardDescription>Connect your Xero account to import customers and sync data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Connection Status */}
            {xeroStatusLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-40" />
              </div>
            ) : xeroStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Connected to {xeroStatus.tenantName}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => xeroDisconnect.mutate()}
                    disabled={xeroDisconnect.isPending}
                    data-testid="button-xero-disconnect"
                  >
                    {xeroDisconnect.isPending ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
                {xeroStatus.lastImportAt && (
                  <p className="text-sm text-muted-foreground">
                    Last import: {new Date(xeroStatus.lastImportAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Not connected to Xero</span>
                </div>
                <Button 
                  onClick={() => xeroConnect.mutate()}
                  disabled={xeroConnect.isPending}
                  data-testid="button-xero-connect"
                >
                  {xeroConnect.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Connect to Xero
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Import Customers Section - only show when connected */}
            {xeroStatus?.connected && (
              <div className="border-t pt-6">
                <h4 className="font-medium mb-2">Import Customers</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Import all contacts from Xero into your CRM. Existing customers will be updated.
                </p>
                
                <Button 
                  onClick={handleImportCustomers}
                  disabled={importCustomers.isPending || currentJob?.status === 'running'}
                  data-testid="button-xero-import-customers"
                >
                  {importCustomers.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting Import...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Import Customers from Xero
                    </>
                  )}
                </Button>

                {/* Active Import Progress */}
                {currentJob && currentJob.status === 'running' && (
                  <div className="mt-4 space-y-2 p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Importing customers...</span>
                      <Badge>In Progress</Badge>
                    </div>
                    <Progress 
                      value={currentJob.totalRecords > 0 
                        ? (currentJob.processedRecords / currentJob.totalRecords) * 100 
                        : 0
                      } 
                    />
                    <p className="text-sm text-muted-foreground">
                      {currentJob.processedRecords} of {currentJob.totalRecords} processed
                    </p>
                  </div>
                )}

                {/* Completed Job */}
                {currentJob && currentJob.status === 'completed' && (
                  <div className="mt-4 p-4 border rounded-lg border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-green-900 dark:text-green-100">
                        Import completed successfully!
                      </span>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                      {currentJob.processedRecords} customers imported
                      {currentJob.failedRecords > 0 && ` (${currentJob.failedRecords} failed)`}
                    </p>
                  </div>
                )}

                {/* Failed Job */}
                {currentJob && currentJob.status === 'failed' && (
                  <div className="mt-4 p-4 border rounded-lg border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-500" />
                      <span className="font-medium text-red-900 dark:text-red-100">Import failed</span>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-2">{currentJob.errorMessage}</p>
                  </div>
                )}
              </div>
            )}

            {/* Import History */}
            {importJobs && importJobs.length > 0 && (
              <div className="border-t pt-6">
                <h4 className="font-medium mb-3">Import History</h4>
                <div className="space-y-2">
                  {importJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium capitalize">{job.jobType}</span>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'failed' ? 'destructive' :
                          job.status === 'running' ? 'secondary' :
                          'outline'
                        }>
                          {job.status}
                        </Badge>
                        {job.status === 'completed' && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {job.processedRecords} records
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Xero Connection Success Dialog */}
      <Dialog open={showXeroSuccessDialog} onOpenChange={setShowXeroSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="w-6 h-6 text-green-500" />
              Xero Connected Successfully!
            </DialogTitle>
            <DialogDescription className="pt-2">
              Your Xero account is now connected. Import your customers from Xero to get started quickly with your existing customer base.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setShowXeroSuccessDialog(false)}
            >
              Maybe Later
            </Button>
            <Button 
              onClick={handleImportFromDialog}
              disabled={importCustomers.isPending}
            >
              {importCustomers.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import Customers Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
