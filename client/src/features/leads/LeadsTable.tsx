import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Lead, LeadSource, LeadStatus } from "./types";

interface LeadsTableProps {
  leads: Lead[];
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
 * Returns badge styling for lead statuses
 */
function getStatusBadge(status: LeadStatus) {
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

export function LeadsTable({ leads }: LeadsTableProps) {
  return (
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
        {leads.map((lead) => (
          <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
            <TableCell className="font-medium">{lead.businessName}</TableCell>
            <TableCell>{lead.location}</TableCell>
            <TableCell>{getSourceBadge(lead.source)}</TableCell>
            <TableCell>{getStatusBadge(lead.status)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

