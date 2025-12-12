import { useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Eye, Trash2, Building2, Home, GlassWater, Loader2 } from "lucide-react";
import type { Lead, LeadSource, LeadStatus } from "./types";
import { shouldShowPubFields, hasAnyPubLead } from "@/verticals/isBreweryLead";
import { getCardDisplayFields, formatFieldForCard, type BreweryFieldKey } from "@/verticals/brewery/schema";

const PAGE_SIZE = 10;

interface LeadsTableProps {
  leads: Lead[];
  onView?: (lead: Lead) => void;
  onDelete?: (leadId: string) => void;
  onStatusChange?: (leadId: string, newStatus: LeadStatus) => void;
  /** Vertical-aware label for the business name column (default: "Business Name") */
  businessNameLabel?: string;
  /** Vertical-aware plural label for leads (default: "leads") */
  leadLabelPlural?: string;
}

/**
 * Returns badge styling for lead sources
 */
function getSourceBadge(source: LeadSource) {
  switch (source) {
    case "google":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        >
          Google
        </Badge>
      );
    case "database":
      return (
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
        >
          Database
        </Badge>
      );
    case "supervisor":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
        >
          Supervisor
        </Badge>
      );
    case "manual":
      return (
        <Badge variant="secondary">
          Manual
        </Badge>
      );
    default:
      return <Badge variant="secondary">{source}</Badge>;
  }
}

/**
 * Status options for the dropdown
 */
const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

/**
 * Returns styling classes for status select trigger
 */
function getStatusSelectClasses(status: LeadStatus): string {
  switch (status) {
    case "new":
      return "bg-secondary text-secondary-foreground border-secondary-border";
    case "contacted":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800";
    case "qualified":
      return "bg-emerald-600 text-white border-emerald-600";
    case "do_not_contact":
      return "bg-destructive text-destructive-foreground border-destructive";
    default:
      return "";
  }
}

/**
 * V1-1.4: Compact brewery info display for table rows
 * Shows key brewery fields as badges/text
 * Only shows for entity types that warrant brewery-specific fields
 */
function BreweryInfoCell({ lead }: { lead: Lead }) {
  // Only show for leads with pub/venue entity type
  if (!shouldShowPubFields(lead)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  // Get fields marked for card display
  const cardFields = getCardDisplayFields();
  
  // Build display items
  const displayItems: string[] = [];
  
  for (const field of cardFields) {
    const value = lead[field.key as keyof Lead];
    const formatted = formatFieldForCard(field.key, value as any);
    if (formatted) {
      displayItems.push(formatted);
    }
  }
  
  if (displayItems.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {/* Freehouse badge */}
        {lead.is_freehouse && (
          <Badge 
            variant="outline" 
            className="text-[10px] px-1.5 py-0 h-5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
          >
            <Home className="h-2.5 w-2.5 mr-0.5" />
            Freehouse
          </Badge>
        )}
        {/* Taproom badge */}
        {lead.has_taproom && (
          <Badge 
            variant="outline" 
            className="text-[10px] px-1.5 py-0 h-5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
          >
            <GlassWater className="h-2.5 w-2.5 mr-0.5" />
            Taproom
          </Badge>
        )}
      </div>
      {/* Cask/Keg lines as text */}
      {(lead.cask_lines || lead.keg_lines) && (
        <span className="text-xs text-muted-foreground">
          {[
            lead.cask_lines ? `${lead.cask_lines} cask` : null,
            lead.keg_lines ? `${lead.keg_lines} keg` : null,
          ].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * Delete confirmation dialog with checkbox safety
 */
function DeleteConfirmationDialog({
  open,
  onOpenChange,
  leadName,
  onConfirm,
  isDeleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  // Reset checkbox when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmed(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete lead?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              This will permanently delete <strong>{leadName}</strong>. This cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {/* Confirmation checkbox */}
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="confirm-delete"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
            disabled={isDeleting}
          />
          <Label
            htmlFor="confirm-delete"
            className="text-sm font-normal cursor-pointer"
          >
            I understand this is permanent
          </Label>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Prevent auto-close
              onConfirm();
            }}
            disabled={!confirmed || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LeadsTable({ 
  leads, 
  onView, 
  onDelete, 
  onStatusChange,
  businessNameLabel = "Business Name",
  leadLabelPlural = "leads",
}: LeadsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Show pub info column if ANY lead in the list has pub fields
  // This is based on lead_entity_type, NOT industry_vertical
  const showPubInfo = hasAnyPubLead(leads);
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteLead, setPendingDeleteLead] = useState<Lead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calculate pagination values
  const totalPages = Math.ceil(leads.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedLeads = leads.slice(startIndex, endIndex);

  // Reset to page 1 if current page exceeds total pages (e.g., after deletions)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages);
  }

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  // Open delete confirmation dialog
  const handleDeleteClick = useCallback((lead: Lead) => {
    setPendingDeleteLead(lead);
    setDeleteDialogOpen(true);
  }, []);

  // Execute delete after confirmation
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteLead || !onDelete) return;
    
    setIsDeleting(true);
    try {
      await onDelete(pendingDeleteLead.id);
      setDeleteDialogOpen(false);
      setPendingDeleteLead(null);
    } catch (error) {
      // Error is handled by parent (toast), keep dialog open
      console.error('[LeadsTable] Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [pendingDeleteLead, onDelete]);

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{businessNameLabel}</TableHead>
            <TableHead>Location</TableHead>
            {showPubInfo && (
              <TableHead>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Venue Info
                </span>
              </TableHead>
            )}
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedLeads.map((lead) => (
            <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
              <TableCell className="font-medium">{lead.businessName}</TableCell>
              <TableCell>{lead.location}</TableCell>
              {showPubInfo && (
                <TableCell>
                  <BreweryInfoCell lead={lead} />
                </TableCell>
              )}
              <TableCell>{getSourceBadge(lead.source)}</TableCell>
              <TableCell>
                {onStatusChange ? (
                  <Select
                    value={lead.status}
                    onValueChange={(value: LeadStatus) => onStatusChange(lead.id, value)}
                  >
                    <SelectTrigger 
                      className={`w-[140px] h-8 text-xs font-medium ${getStatusSelectClasses(lead.status)}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusBadge status={lead.status} />
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onView?.(lead)}
                    data-testid={`btn-view-${lead.id}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(lead)}
                    data-testid={`btn-delete-${lead.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}–{Math.min(endIndex, leads.length)} of {leads.length} {leadLabelPlural}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={isFirstPage}
              data-testid="btn-pagination-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={isLastPage}
              data-testid="btn-pagination-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        leadName={pendingDeleteLead?.businessName ?? ''}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

/**
 * Static badge for status (used when no onStatusChange handler)
 */
function StatusBadge({ status }: { status: LeadStatus }) {
  switch (status) {
    case "new":
      return (
        <Badge variant="secondary">
          New
        </Badge>
      );
    case "contacted":
      return (
        <Badge
          variant="outline"
          className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800"
        >
          Contacted
        </Badge>
      );
    case "qualified":
      return (
        <Badge
          variant="default"
          className="bg-emerald-600 hover:bg-emerald-600"
        >
          Qualified
        </Badge>
      );
    case "do_not_contact":
      return (
        <Badge variant="destructive">
          Do Not Contact
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
