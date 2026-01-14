/**
 * Overdue Calls List Component
 * 
 * Displays calls that are past their scheduled date and not yet completed.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { useOverdueCalls, useDeleteCallDiary } from "./useDiary";
import { CallListFilters } from "./CallListFilters";
import { ScheduleCallDialog } from "./ScheduleCallDialog";
import { CompleteCallDialog } from "./CompleteCallDialog";
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
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Check, Calendar, Trash2, Users, Building2, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { DiaryFilters, CallDiaryEntry, EntityType } from "./types";

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

export function OverdueCallsList() {
  const { user } = useUser();
  const [filters, setFilters] = useState<DiaryFilters>({});
  const [rescheduleEntry, setRescheduleEntry] = useState<CallDiaryEntry | null>(null);
  const [completeEntry, setCompleteEntry] = useState<CallDiaryEntry | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const { data: entries, isLoading, error } = useOverdueCalls(filters);
  const deleteMutation = useDeleteCallDiary();
  
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

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        Failed to load overdue calls. Please try again.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="title-overdue">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Overdue Calls
          </h2>
          <p className="text-sm text-muted-foreground">
            Calls that were scheduled in the past but not yet completed
          </p>
        </div>
        {entries && entries.length > 0 && (
          <Badge variant="destructive" className="text-sm">
            {entries.length} overdue
          </Badge>
        )}
      </div>
      
      <CallListFilters filters={filters} onFilterChange={setFilters} />

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-md border-destructive/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Was Scheduled</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No overdue calls! You're all caught up.
                  </TableCell>
                </TableRow>
              ) : (
                entries?.map((entry) => {
                  const entityName = getEntityName(entry);
                  const scheduledDate = new Date(entry.scheduledDate);
                  const timeAgo = formatDistanceToNow(scheduledDate, { addSuffix: true });
                  
                  return (
                    <TableRow 
                      key={entry.id} 
                      className="bg-destructive/5 hover:bg-destructive/10"
                      data-testid={`row-call-${entry.id}`}
                    >
                      <TableCell>
                        <EntityBadge type={entry.entityType as EntityType} name={entityName} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-destructive font-medium">
                            {format(scheduledDate, 'EEE, MMM d')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {timeAgo} · {format(scheduledDate, 'h:mm a')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {entry.notes || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRescheduleEntry(entry)}
                            data-testid={`button-reschedule-${entry.id}`}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            Reschedule
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-menu-${entry.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => setCompleteEntry(entry)}
                                data-testid={`menu-complete-${entry.id}`}
                              >
                                <Check className="mr-2 h-4 w-4" />
                                Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteId(entry.id)}
                                className="text-destructive"
                                data-testid={`menu-delete-${entry.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reschedule Dialog */}
      {rescheduleEntry && (
        <ScheduleCallDialog
          open={!!rescheduleEntry}
          onOpenChange={(open) => !open && setRescheduleEntry(null)}
          entityType={rescheduleEntry.entityType as EntityType}
          entityId={rescheduleEntry.entityId}
          entityName={getEntityName(rescheduleEntry)}
          existingEntry={rescheduleEntry}
        />
      )}

      {/* Complete Dialog */}
      {completeEntry && (
        <CompleteCallDialog
          open={!!completeEntry}
          onOpenChange={(open) => !open && setCompleteEntry(null)}
          entry={completeEntry}
          entityName={getEntityName(completeEntry)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Call</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this call? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default OverdueCallsList;

