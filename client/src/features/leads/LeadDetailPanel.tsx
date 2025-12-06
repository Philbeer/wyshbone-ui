/**
 * UI-14: Lead Detail Panel
 * 
 * A slide-out panel showing detailed information about a lead/pub.
 * Includes brewery-specific fields when in the brewery vertical.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Building2, Beer, UtensilsCrossed, TreeDeciduous } from "lucide-react";
import type { Lead, LeadStatus } from "./types";
import { extractBreweryLeadFields } from "./breweryLeadFields";
import { useVerticalLabels } from "@/lib/verticals";
import type { VerticalId } from "@/lib/verticals";

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Get status badge styling and label
 */
function getStatusBadge(status: LeadStatus) {
  switch (status) {
    case "new":
      return { label: "New", className: "bg-secondary text-secondary-foreground" };
    case "contacted":
      return { 
        label: "Contacted", 
        className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800" 
      };
    case "qualified":
      return { 
        label: "Qualified", 
        className: "bg-emerald-600 text-white hover:bg-emerald-600" 
      };
    case "do_not_contact":
      return { label: "Do Not Contact", className: "bg-destructive text-destructive-foreground" };
    default:
      return { label: status, className: "" };
  }
}

/**
 * Get source badge styling and label
 */
function getSourceLabel(source: string) {
  switch (source) {
    case "google":
      return "Google";
    case "database":
      return "Database";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

/**
 * Field display component for consistent styling
 */
function FieldDisplay({ 
  label, 
  value, 
  icon: Icon 
}: { 
  label: string; 
  value: string | number | undefined; 
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (value === undefined || value === null || value === "") return null;
  
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

/**
 * Brewery info section component
 */
function BreweryInfoSection({ 
  lead, 
  verticalId 
}: { 
  lead: Lead; 
  verticalId: VerticalId;
}) {
  const { labels } = useVerticalLabels();
  const brewery = extractBreweryLeadFields(lead);
  
  // Only show in brewery vertical and if there's brewery data
  if (verticalId !== "brewery" || !brewery.hasBreweryData) {
    return null;
  }
  
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Beer className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold">
          {labels.brewery_info_title}
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {brewery.pubTypeDisplay && (
          <FieldDisplay 
            label={labels.field_pub_type} 
            value={brewery.pubTypeDisplay}
            icon={Building2}
          />
        )}
        
        {brewery.beerRangeSummary && (
          <FieldDisplay 
            label={labels.field_beer_range} 
            value={brewery.beerRangeSummary}
          />
        )}
        
        {brewery.rotationStyle && (
          <FieldDisplay 
            label={labels.field_rotation_style} 
            value={brewery.rotationStyle}
          />
        )}
        
        {brewery.caskBiasDisplay && (
          <FieldDisplay 
            label={labels.field_cask_bias} 
            value={brewery.caskBiasDisplay}
          />
        )}
      </div>
      
      {/* Feature badges */}
      {(brewery.servesFood || brewery.hasBeerGarden) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {brewery.servesFood && (
            <Badge 
              variant="outline" 
              className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800"
            >
              <UtensilsCrossed className="h-3 w-3 mr-1" />
              {labels.badge_serves_food}
            </Badge>
          )}
          {brewery.hasBeerGarden && (
            <Badge 
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
            >
              <TreeDeciduous className="h-3 w-3 mr-1" />
              {labels.badge_beer_garden}
            </Badge>
          )}
        </div>
      )}
      
      {/* Venue notes */}
      {brewery.venueNotes && (
        <div className="pt-1">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
            {labels.field_venue_notes}
          </div>
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
            {brewery.venueNotes}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Lead detail panel component
 * Shows comprehensive lead information in a slide-out sheet
 */
export function LeadDetailPanel({ lead, open, onOpenChange }: LeadDetailPanelProps) {
  const { labels, verticalId } = useVerticalLabels();
  
  if (!lead) return null;
  
  const statusBadge = getStatusBadge(lead.status);
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-xl pr-8">
              {lead.businessName}
            </SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5" />
            {lead.location}
          </SheetDescription>
        </SheetHeader>
        
        {/* Status and Source */}
        <div className="flex items-center gap-2 pb-4">
          <Badge variant="outline" className={statusBadge.className}>
            {statusBadge.label}
          </Badge>
          <Badge variant="secondary">
            {getSourceLabel(lead.source)}
          </Badge>
        </div>
        
        <Separator className="my-4" />
        
        {/* Brewery-specific info section */}
        <BreweryInfoSection lead={lead} verticalId={verticalId} />
        
        {/* Show placeholder when no brewery data but in brewery vertical */}
        {verticalId === "brewery" && !extractBreweryLeadFields(lead).hasBreweryData && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Beer className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground">
                {labels.brewery_info_title}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground italic">
              No pub details available yet. Add brewery-specific information to see it here.
            </p>
          </section>
        )}
        
        {/* TODO: Add more sections as needed:
          - Contact information
          - Activity history
          - Notes/comments
          - Quick actions (change status, add note, etc.)
        */}
      </SheetContent>
    </Sheet>
  );
}

