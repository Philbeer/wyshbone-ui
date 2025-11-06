import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, ChevronRight, Building2, Mail, Globe, User, Award, TrendingUp } from "lucide-react";
import type { BatchJob, BatchJobItem } from "@shared/schema";

export default function BatchPipeline() {
  const [, params] = useRoute("/batch/:id");
  const batchId = params?.id;
  const [selectedItem, setSelectedItem] = useState<BatchJobItem | null>(null);

  const { data: job, isLoading, error } = useQuery<BatchJob>({
    queryKey: [`/api/batch/${batchId}`],
    enabled: !!batchId,
  });

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <Card className="border-red-600/20 bg-red-500/5">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Error Loading Batch</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Failed to load batch job"}
            </p>
            <p className="text-xs text-muted-foreground">
              Batch ID: {batchId}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Batch job not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = job.items || [];

  // Calculate stage statistics from the items array
  const companiesFound = items.length;
  const domainsFound = items.filter(item => item.domain).length;
  const emailsFound = items.filter(item => item.selected_email).length;
  const sentToSalesHandy = emailsFound; // All items with emails were sent

  const stats = {
    googlePlaces: {
      total: companiesFound,
      percentage: 100,
      label: "Companies Found",
      icon: Building2,
    },
    domains: {
      total: domainsFound,
      percentage: companiesFound > 0 ? Math.round((domainsFound / companiesFound) * 100) : 0,
      label: "Domains Discovered",
      icon: Globe,
    },
    emails: {
      total: emailsFound,
      percentage: domainsFound > 0 ? Math.round((emailsFound / domainsFound) * 100) : 0,
      label: "Emails Found",
      icon: Mail,
    },
    sent: {
      total: sentToSalesHandy,
      percentage: emailsFound > 0 ? Math.round((sentToSalesHandy / emailsFound) * 100) : 0,
      label: "Sent to SalesHandy",
      icon: CheckCircle2,
    },
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "completed":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "failed":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-6xl mx-auto p-6 space-y-6" data-testid="page-batch-pipeline">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold" data-testid="text-batch-title">
            Batch Pipeline: {job.query}
          </h1>
          <Badge className={getStatusColor(job.status)} data-testid={`badge-status-${job.status}`}>
            {job.status === "running" && <Clock className="w-3 h-3 mr-1 animate-spin" />}
            {job.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {job.status === "failed" && <XCircle className="w-3 h-3 mr-1" />}
            {job.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-batch-location">
          {job.location}, {job.country} • Target: {job.targetRole}
        </p>
      </div>

      {/* Pipeline Stages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(stats).map(([key, stat], index) => {
          const Icon = stat.icon;
          const isLast = index === Object.keys(stats).length - 1;
          
          return (
            <div key={key} className="relative">
              <Card className="hover-elevate" data-testid={`card-stage-${key}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <div className="text-right">
                      <div className="text-2xl font-bold" data-testid={`text-count-${key}`}>
                        {stat.total}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.percentage}%
                      </div>
                    </div>
                  </div>
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                </CardHeader>
              </Card>
              {!isLast && (
                <ChevronRight className="hidden lg:block absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 text-muted-foreground z-10" />
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Results Table */}
      <Card data-testid="card-results-table">
        <CardHeader>
          <CardTitle>Pipeline Results</CardTitle>
          <CardDescription>
            Showing all {items.length} companies from Google Places search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-6 gap-4 px-4 py-2 bg-muted/50 rounded-md text-sm font-medium">
              <div>Company</div>
              <div>Location</div>
              <div>Domain</div>
              <div>Email</div>
              <div>Contact</div>
              <div>Status</div>
            </div>

            {/* Table Rows */}
            <div className="space-y-1">
              {items.map((item: BatchJobItem, index) => (
                <div
                  key={item.place_id}
                  className="grid grid-cols-6 gap-4 px-4 py-3 hover-elevate active-elevate-2 rounded-md text-sm border border-border/50 cursor-pointer transition-all"
                  data-testid={`row-result-${index}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="font-medium truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="text-muted-foreground truncate text-xs" title={item.address}>
                    {item.address || "—"}
                  </div>
                  <div className="flex items-center gap-1 truncate">
                    {item.domain ? (
                      <>
                        <Globe className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <span className="text-xs truncate" title={item.domain}>{item.domain}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 truncate">
                    {item.selected_email ? (
                      <>
                        <Mail className={`w-3 h-3 flex-shrink-0 ${
                          item.selected_status === 'valid' 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-yellow-600 dark:text-yellow-400'
                        }`} />
                        <span className="text-xs truncate" title={item.selected_email}>{item.selected_email}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 truncate">
                    {item.first_name ? (
                      <>
                        <User className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-xs truncate" title={`${item.first_name} ${item.last_name || ''}`}>
                          {item.first_name} {item.last_name || ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    {item.selected_email ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-600/20">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-600/20">
                        Skipped
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {items.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No results yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {job.error && (
        <Card className="border-red-600/20 bg-red-500/5" data-testid="card-error">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600/90 dark:text-red-400/90">{job.error}</p>
          </CardContent>
        </Card>
      )}

      {/* Hunter.io Contacts Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-hunter-contacts">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {selectedItem.name}
                </DialogTitle>
                <DialogDescription>
                  All email contacts found via Hunter.io • Target role: {job.targetRole}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Company Info */}
                <div className="flex flex-col gap-2 p-4 bg-muted/50 rounded-md">
                  {selectedItem.domain && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono">{selectedItem.domain}</span>
                    </div>
                  )}
                  {selectedItem.address && (
                    <div className="text-sm text-muted-foreground">{selectedItem.address}</div>
                  )}
                </div>

                {/* Hunter.io Contacts List */}
                {selectedItem.hunter_contacts && selectedItem.hunter_contacts.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <h3 className="font-semibold text-sm">
                        {selectedItem.hunter_contacts.length} Contact{selectedItem.hunter_contacts.length !== 1 ? 's' : ''} Found
                      </h3>
                    </div>

                    {selectedItem.hunter_contacts.map((contact, idx) => {
                      const isSelected = contact.email === selectedItem.selected_email;
                      const scoreColor = contact.score >= 80 ? "text-green-600 dark:text-green-400" :
                                        contact.score >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                                        "text-gray-600 dark:text-gray-400";

                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-md border transition-all ${
                            isSelected 
                              ? "border-green-600/50 bg-green-500/10" 
                              : "border-border/50 hover-elevate"
                          }`}
                          data-testid={`contact-${idx}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* Contact Info */}
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                {contact.first_name || contact.last_name ? (
                                  <div className="font-medium">
                                    {contact.first_name} {contact.last_name}
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground text-sm">No name</div>
                                )}
                                {isSelected && (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-600/20">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Selected
                                  </Badge>
                                )}
                              </div>

                              {contact.position && (
                                <div className="text-sm text-muted-foreground">
                                  {contact.position}
                                  {contact.department && ` • ${contact.department}`}
                                </div>
                              )}

                              <div className="flex items-center gap-2 text-sm font-mono">
                                <Mail className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                {contact.email}
                              </div>

                              {contact.confidence !== undefined && (
                                <div className="text-xs text-muted-foreground">
                                  Hunter.io confidence: {contact.confidence}%
                                </div>
                              )}
                            </div>

                            {/* Ranking Score */}
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <TrendingUp className={`w-4 h-4 ${scoreColor}`} />
                                <span className={`text-2xl font-bold ${scoreColor}`}>
                                  {contact.score}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Match Score
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No contacts found via Hunter.io</p>
                    <p className="text-xs mt-1">
                      {selectedItem.domain ? "Try adding contacts manually" : "No domain available for search"}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  </div>
  );
}
