/**
 * Call History List Component
 * 
 * Displays completed calls with outcomes and notes.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { useCallHistory, useScheduleCall } from "./useDiary";
import { CallListFilters } from "./CallListFilters";
import { ScheduleCallDialog } from "./ScheduleCallDialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Users, Building2, History } from "lucide-react";
import { format } from "date-fns";
import type { DiaryFilters, CallDiaryEntry, EntityType, CallOutcome } from "./types";
import { outcomeLabels, outcomeColors } from "./types";

// Customer/Lead display component
function EntityBadge({ type, name }: { type: EntityType; name: string }) {
  return (
    <div className="flex items-center gap-2">
      {type === 'customer' ? (
        <Building2 className="h-4 w-4 text-blue-500" />
      ) : (
        <Users className="h-4 w-4 text-purple-500" />
      )}
      <span className="font-medium">{name || 'Unknown'}</span>
      <Badge variant="outline" className="text-xs">
        {type === 'customer' ? 'Customer' : 'Lead'}
      </Badge>
    </div>
  );
}

// Outcome badge component
function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-muted-foreground">-</span>;
  
  const label = outcomeLabels[outcome as CallOutcome] || outcome;
  const colorClass = outcomeColors[outcome as CallOutcome] || 'bg-gray-100 text-gray-800';
  
  return (
    <Badge className={colorClass}>
      {label}
    </Badge>
  );
}

export function CallHistoryList() {
  const { user } = useUser();
  const [filters, setFilters] = useState<DiaryFilters>({});
  const [scheduleFollowUp, setScheduleFollowUp] = useState<{
    entityType: EntityType;
    entityId: string;
    entityName: string;
  } | null>(null);
  
  const { data: entries, isLoading, error } = useCallHistory(filters);
  
  // Fetch customers for name lookup
  const { data: customers } = useQuery({
    queryKey: ['/api/crm/customers', user.id],
    enabled: !!user.id,
  });
  
  // Helper to get entity name
  const getEntityName = (entry: CallDiaryEntry): string => {
    if (entry.entityType === 'customer') {
      const customer = (customers as any[])?.find((c: any) => c.id === entry.entityId);
      return customer?.name || 'Unknown Customer';
    }
    return `Lead ${entry.entityId}`;
  };

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        Failed to load call history. Please try again.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="title-history">
            <History className="h-5 w-5" />
            Call History
          </h2>
          <p className="text-sm text-muted-foreground">
            Completed calls with outcomes and notes
          </p>
        </div>
      </div>
      
      <CallListFilters filters={filters} onFilterChange={setFilters} showDateFilters />

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No completed calls yet. Your call history will appear here.
                  </TableCell>
                </TableRow>
              ) : (
                entries?.map((entry) => {
                  const entityName = getEntityName(entry);
                  const completedDate = entry.completedDate 
                    ? new Date(entry.completedDate) 
                    : new Date(entry.updatedAt);
                  
                  return (
                    <TableRow key={entry.id} data-testid={`row-call-${entry.id}`}>
                      <TableCell>
                        <EntityBadge type={entry.entityType as EntityType} name={entityName} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{format(completedDate, 'EEE, MMM d')}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(completedDate, 'h:mm a')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <OutcomeBadge outcome={entry.outcome} />
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        {entry.notes ? (
                          <span className="line-clamp-2">{entry.notes}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setScheduleFollowUp({
                            entityType: entry.entityType as EntityType,
                            entityId: entry.entityId,
                            entityName,
                          })}
                          data-testid={`button-followup-${entry.id}`}
                        >
                          <CalendarPlus className="mr-2 h-4 w-4" />
                          Schedule Follow-up
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Schedule Follow-up Dialog */}
      {scheduleFollowUp && (
        <ScheduleCallDialog
          open={!!scheduleFollowUp}
          onOpenChange={(open) => !open && setScheduleFollowUp(null)}
          entityType={scheduleFollowUp.entityType}
          entityId={scheduleFollowUp.entityId}
          entityName={scheduleFollowUp.entityName}
        />
      )}
    </div>
  );
}

export default CallHistoryList;

