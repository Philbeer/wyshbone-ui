import { useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare } from "lucide-react";
import {
  LeadsTable,
  LeadsTableSkeleton,
  LeadsError,
  LeadDetailPanel,
  LeadFilters,
  applyLeadFilters,
  DEFAULT_FILTERS,
  useLeads,
} from "@/features/leads";
import type { Lead, LeadStatus, LeadUpdatePayload, LeadFiltersState } from "@/features/leads";
import { useToast } from "@/hooks/use-toast";
import { useVerticalLabels } from "@/lib/verticals";
import { useRefreshLeadsOnSearch } from "@/hooks/use-plan-step-watcher";

export default function LeadsPage() {
  const { toast } = useToast();
  const { labels } = useVerticalLabels();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [filters, setFilters] = useState<LeadFiltersState>(DEFAULT_FILTERS);
  const {
    leads,
    isLoading,
    error,
    refetch,
    deleteLead,
    updateLeadStatus,
    updateLead,
  } = useLeads();
  
  // Auto-refresh leads when search step completes
  useRefreshLeadsOnSearch(refetch);
  
  // Apply filters to leads
  const filteredLeads = useMemo(() => {
    return applyLeadFilters(leads, filters);
  }, [leads, filters]);

  /**
   * Handle View action - opens lead detail panel
   */
  const handleView = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailPanelOpen(true);
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

  /**
   * V1-1.4: Handle lead update (including brewery fields)
   */
  const handleUpdateLead = useCallback(async (leadId: string, updates: LeadUpdatePayload) => {
    try {
      await updateLead(leadId, updates);
      toast({
        title: "Lead updated",
        description: "Changes saved successfully.",
      });
      // Update selected lead in state so panel reflects changes immediately
      // Merge the updates into the existing selectedLead
      setSelectedLead((prev) => {
        if (!prev || prev.id !== leadId) return prev;
        return {
          ...prev,
          ...updates,
          // Ensure status persists
          status: updates.status ?? prev.status,
          // Entity type and relationship role
          lead_entity_type: updates.lead_entity_type !== undefined ? updates.lead_entity_type : prev.lead_entity_type,
          relationship_role: updates.relationship_role !== undefined ? updates.relationship_role : prev.relationship_role,
          // Ensure pub/venue fields are explicitly set (not undefined)
          is_freehouse: updates.is_freehouse !== undefined ? updates.is_freehouse : prev.is_freehouse,
          cask_lines: updates.cask_lines !== undefined ? updates.cask_lines : prev.cask_lines,
          keg_lines: updates.keg_lines !== undefined ? updates.keg_lines : prev.keg_lines,
          has_taproom: updates.has_taproom !== undefined ? updates.has_taproom : prev.has_taproom,
          annual_production_hl: updates.annual_production_hl !== undefined ? updates.annual_production_hl : prev.annual_production_hl,
          distribution_type: updates.distribution_type !== undefined ? updates.distribution_type : prev.distribution_type,
          beer_focus: updates.beer_focus !== undefined ? updates.beer_focus : prev.beer_focus,
          owns_pubs: updates.owns_pubs !== undefined ? updates.owns_pubs : prev.owns_pubs,
        } as Lead;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update lead";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
      throw err; // Re-throw so panel can handle loading state
    }
  }, [updateLead, toast]);

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

        {/* Empty State - UI-19: Added navigation to chat */}
        {!isLoading && !error && leads.length === 0 && (
          <Card data-testid="card-leads-empty">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{labels.empty_leads_title}</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                {labels.empty_leads_description}
              </p>
              <Button asChild variant="default">
                <Link href="/">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Go to Chat
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filters + Leads Table */}
        {!isLoading && !error && leads.length > 0 && (
          <>
            {/* V1-1.4: Lead Filters */}
            <Card data-testid="card-leads-filters">
              <div className="p-4">
                <LeadFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  leads={leads}
                />
              </div>
            </Card>
            
            {/* Leads Table */}
            <Card data-testid="card-leads-table">
              <div className="p-1">
                <LeadsTable
                  leads={filteredLeads}
                  onView={handleView}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  businessNameLabel={labels.table_business_name}
                  leadLabelPlural={labels.lead_plural}
                />
              </div>
            </Card>
            
            {/* Filtered results empty state */}
            {filteredLeads.length === 0 && leads.length > 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No leads match your filters. Try adjusting your search criteria.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                  >
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      
      {/* Lead Detail Panel */}
      <LeadDetailPanel
        lead={selectedLead}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        onUpdateLead={handleUpdateLead}
      />
    </div>
  );
}
