import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Eye, Trash2, Beer, UtensilsCrossed, TreeDeciduous } from "lucide-react";
import type { Lead, LeadSource, LeadStatus } from "./types";
import { getBrewerySummaryLine, extractBreweryLeadFields } from "./breweryLeadFields";

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
  /** Whether to show brewery-specific info (default: false) */
  showBreweryInfo?: boolean;
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
 * UI-14: Compact brewery info display for table rows
 */
function BreweryInfoCell({ lead }: { lead: Lead }) {
  const breweryFields = extractBreweryLeadFields(lead);
  const summaryLine = getBrewerySummaryLine(lead);
  
  if (!breweryFields.hasBreweryData) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  
  return (
    <div className="flex flex-col gap-0.5">
      {summaryLine && (
        <span className="text-xs text-foreground">{summaryLine}</span>
      )}
      <div className="flex items-center gap-1.5">
        {breweryFields.servesFood && (
          <span title="Serves food" className="text-orange-600">
            <UtensilsCrossed className="h-3 w-3" />
          </span>
        )}
        {breweryFields.hasBeerGarden && (
          <span title="Beer garden" className="text-green-600">
            <TreeDeciduous className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

export function LeadsTable({ 
  leads, 
  onView, 
  onDelete, 
  onStatusChange,
  businessNameLabel = "Business Name",
  leadLabelPlural = "leads",
  showBreweryInfo = false,
}: LeadsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

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

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{businessNameLabel}</TableHead>
            <TableHead>Location</TableHead>
            {showBreweryInfo && (
              <TableHead>
                <span className="flex items-center gap-1">
                  <Beer className="h-3.5 w-3.5" />
                  Pub Info
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
              {showBreweryInfo && (
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
                    onClick={() => onDelete?.(lead.id)}
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
