import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function LeadsPage() {
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

        {/* Empty State Panel */}
        <Card data-testid="card-leads-empty">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              AI-generated leads will appear here once connected to the lead generation pipeline.
            </p>
          </CardContent>
        </Card>

        {/* Table with headers only */}
        <Card data-testid="card-leads-table">
          <div className="p-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* No rows yet - empty state handled above */}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

