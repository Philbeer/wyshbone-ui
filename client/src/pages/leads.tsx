import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  LeadsTable,
  LeadsTableSkeleton,
  LeadsError,
  useLeads,
} from "@/features/leads";
import type { Lead, LeadStatus } from "@/features/leads";
import { useToast } from "@/hooks/use-toast";
import { useVerticalLabels } from "@/lib/verticals";

export default function LeadsPage() {
  const { toast } = useToast();
  const { labels } = useVerticalLabels();
  const {
    leads,
    isLoading,
    error,
    refetch,
    deleteLead,
    updateLeadStatus,
  } = useLeads();

  /**
   * Handle View action - logs lead to console for now
   */
  const handleView = (lead: Lead) => {
    console.log("View lead:", lead);
  };

  /**
   * Handle Delete action - removes lead from state with error handling
   */
  const handleDelete = async (leadId: string) => {
    try {
      await deleteLead(leadId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete lead";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  /**
   * Handle Status change - updates lead status in state with error handling
   */
  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      await updateLeadStatus(leadId, newStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{labels.lead_plural_cap}</h1>
          <p className="text-muted-foreground">
            View and manage AI-generated {labels.lead_plural}.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card data-testid="card-leads-loading">
            <div className="p-4">
              <LeadsTableSkeleton rows={5} />
            </div>
          </Card>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <LeadsError message={error} onRetry={refetch} />
        )}

        {/* Empty State */}
        {!isLoading && !error && leads.length === 0 && (
          <Card data-testid="card-leads-empty">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{labels.empty_leads_title}</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {labels.empty_leads_description}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Leads Table */}
        {!isLoading && !error && leads.length > 0 && (
          <Card data-testid="card-leads-table">
            <div className="p-1">
              <LeadsTable
                leads={leads}
                onView={handleView}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                businessNameLabel={labels.table_business_name}
                leadLabelPlural={labels.lead_plural}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
