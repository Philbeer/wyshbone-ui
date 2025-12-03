import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { LeadsTable, mockLeads } from "@/features/leads";

export default function LeadsPage() {
  // Using mock data for now - will be replaced with real API data later
  const leads = mockLeads;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Leads</h1>
          <p className="text-muted-foreground">
            View and manage AI-generated leads.
          </p>
        </div>

        {leads.length === 0 ? (
          /* Empty State Panel */
          <Card data-testid="card-leads-empty">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                AI-generated leads will appear here once connected to the lead generation pipeline.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Leads Table */
          <Card data-testid="card-leads-table">
            <div className="p-1">
              <LeadsTable leads={leads} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
