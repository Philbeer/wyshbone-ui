/**
 * V1-1.4: Lead Filters Component
 * 
 * Provides filtering UI for leads, including brewery-specific filters
 * when in brewery vertical mode.
 * 
 * V1-1.6: Vertical-aware filtering
 * - Generic mode shows only generic filters (status, entity type, relationship, priority)
 * - Non-generic verticals show generic filters PLUS venue-specific filters
 */

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, X, Building2 } from "lucide-react";
import type { Lead, LeadStatus } from "./types";
import {
  getFilterableFields,
  type BreweryFieldDef,
  type BreweryFieldKey,
} from "@/verticals/brewery/schema";
import { hasAnyPubLead } from "@/verticals/isBreweryLead";
import { useVertical } from "@/contexts/VerticalContext";
import {
  ENTITY_TYPE_OPTIONS,
  RELATIONSHIP_ROLE_OPTIONS,
  PRIORITY_TAG_OPTIONS,
} from "@/constants/leadOptions";

/**
 * Filter value types
 */
export interface BreweryFilterValue {
  key: BreweryFieldKey;
  operator: 'equals' | 'gte' | 'lte' | 'contains';
  value: string | number | boolean;
}

export interface LeadFiltersState {
  /** Text search on business name / location */
  search: string;
  /** Status filter */
  status: LeadStatus | 'all';
  /** Entity type filter (generic) */
  entityType: string | 'all';
  /** Relationship role filter (generic) */
  relationship: string | 'all';
  /** Priority tag filter (generic) */
  priorityTag: string | 'all';
  /** Brewery-specific filters (venue filters - only shown in non-generic verticals) */
  breweryFilters: BreweryFilterValue[];
}

export interface LeadFiltersProps {
  /** Current filter state */
  filters: LeadFiltersState;
  /** Callback when filters change */
  onFiltersChange: (filters: LeadFiltersState) => void;
  /** Leads array to check if any warrant pub-specific filters */
  leads?: Lead[];
}

/**
 * Default/empty filter state
 */
export const DEFAULT_FILTERS: LeadFiltersState = {
  search: '',
  status: 'all',
  entityType: 'all',
  relationship: 'all',
  priorityTag: 'all',
  breweryFilters: [],
};

/**
 * Status options for dropdown
 */
const STATUS_OPTIONS: { value: LeadStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];

/**
 * Single brewery filter row
 */
function BreweryFilterRow({
  field,
  value,
  onChange,
  onRemove,
}: {
  field: BreweryFieldDef;
  value: BreweryFilterValue;
  onChange: (value: BreweryFilterValue) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
      <span className="text-xs font-medium min-w-[100px]">{field.label}</span>
      
      {field.type === 'boolean' && (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-muted-foreground">is</span>
          <Switch
            checked={value.value === true}
            onCheckedChange={(checked) =>
              onChange({ ...value, value: checked })
            }
          />
          <span className="text-xs">{value.value ? 'Yes' : 'No'}</span>
        </div>
      )}
      
      {field.type === 'number' && (
        <div className="flex items-center gap-2 flex-1">
          <Select
            value={value.operator}
            onValueChange={(op) =>
              onChange({ ...value, operator: op as 'gte' | 'lte' | 'equals' })
            }
          >
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">=</SelectItem>
              <SelectItem value="gte">≥</SelectItem>
              <SelectItem value="lte">≤</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={value.value as number}
            onChange={(e) =>
              onChange({ ...value, value: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 h-7 text-xs"
          />
        </div>
      )}
      
      {field.type === 'select' && (
        <div className="flex items-center gap-2 flex-1">
          <Select
            value={(value.value as string) || undefined}
            onValueChange={(v) => onChange({ ...value, value: v })}
          >
            <SelectTrigger className="flex-1 h-7 text-xs">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.filter(opt => opt.value && opt.value.trim() !== '').map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {field.type === 'text' && (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-muted-foreground">contains</span>
          <Input
            type="text"
            value={value.value as string}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            className="flex-1 h-7 text-xs"
          />
        </div>
      )}
      
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Lead Filters component
 */
export function LeadFilters({
  filters,
  onFiltersChange,
  leads = [],
}: LeadFiltersProps) {
  const [isBreweryPopoverOpen, setIsBreweryPopoverOpen] = useState(false);
  
  // Get vertical from context to gate venue filters
  const { currentVerticalId } = useVertical();
  const isGenericVertical = currentVerticalId === 'generic';
  
  const filterableFields = useMemo(() => getFilterableFields(), []);
  
  // Show venue filters only when:
  // 1. NOT in generic vertical mode
  // 2. AND there are pub leads in the data
  const hasPubLeads = useMemo(() => {
    if (leads.length === 0) return false;
    return hasAnyPubLead(leads);
  }, [leads]);
  
  // Only show venue filters in non-generic verticals AND when there are pub leads
  const showVenueFilters = !isGenericVertical && hasPubLeads;
  
  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status !== 'all') count++;
    if (filters.entityType !== 'all') count++;
    if (filters.relationship !== 'all') count++;
    if (filters.priorityTag !== 'all') count++;
    count += filters.breweryFilters.length;
    return count;
  }, [filters]);
  
  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, search: value });
  }, [filters, onFiltersChange]);
  
  const handleStatusChange = useCallback((value: LeadStatus | 'all') => {
    onFiltersChange({ ...filters, status: value });
  }, [filters, onFiltersChange]);
  
  const handleEntityTypeChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, entityType: value });
  }, [filters, onFiltersChange]);
  
  const handleRelationshipChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, relationship: value });
  }, [filters, onFiltersChange]);
  
  const handlePriorityTagChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, priorityTag: value });
  }, [filters, onFiltersChange]);
  
  const handleAddBreweryFilter = useCallback((field: BreweryFieldDef) => {
    // Find first valid option value (non-empty)
    const validOptions = field.options?.filter(o => o.value && o.value.trim() !== '') ?? [];
    const firstValidOption = validOptions[0]?.value;
    
    const defaultValue: BreweryFilterValue = {
      key: field.key,
      operator: field.type === 'boolean' ? 'equals' : 
                field.type === 'number' ? 'gte' : 
                field.type === 'select' ? 'equals' : 'contains',
      value: field.type === 'boolean' ? true :
             field.type === 'number' ? 0 :
             firstValidOption ?? 'unknown',
    };
    onFiltersChange({
      ...filters,
      breweryFilters: [...filters.breweryFilters, defaultValue],
    });
    setIsBreweryPopoverOpen(false);
  }, [filters, onFiltersChange]);
  
  const handleUpdateBreweryFilter = useCallback((index: number, value: BreweryFilterValue) => {
    const newFilters = [...filters.breweryFilters];
    newFilters[index] = value;
    onFiltersChange({ ...filters, breweryFilters: newFilters });
  }, [filters, onFiltersChange]);
  
  const handleRemoveBreweryFilter = useCallback((index: number) => {
    const newFilters = filters.breweryFilters.filter((_, i) => i !== index);
    onFiltersChange({ ...filters, breweryFilters: newFilters });
  }, [filters, onFiltersChange]);
  
  const handleClearAll = useCallback(() => {
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange]);
  
  // Fields not yet filtered
  const availableFields = useMemo(() => {
    const usedKeys = new Set(filters.breweryFilters.map((f) => f.key));
    return filterableFields.filter((f) => !usedKeys.has(f.key));
  }, [filterableFields, filters.breweryFilters]);
  
  return (
    <div className="space-y-3">
      {/* Main filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input - always string-safe */}
        <Input
          placeholder="Search by name or location..."
          value={filters.search ?? ""}
          onChange={(e) => handleSearchChange(e.target.value ?? "")}
          className="w-64 h-9"
        />
        
        {/* Status filter */}
        <Select
          value={filters.status}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Entity Type filter (generic) */}
        <Select
          value={filters.entityType}
          onValueChange={handleEntityTypeChange}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Relationship filter (generic) */}
        <Select
          value={filters.relationship}
          onValueChange={handleRelationshipChange}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Relationship" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All relationships</SelectItem>
            {RELATIONSHIP_ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Priority Tag filter (generic) */}
        <Select
          value={filters.priorityTag}
          onValueChange={handlePriorityTagChange}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_TAG_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Venue filters button - only show in non-generic verticals when there are pub leads */}
        {showVenueFilters && (
          <Popover open={isBreweryPopoverOpen} onOpenChange={setIsBreweryPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Building2 className="h-4 w-4 mr-1" />
                Venue Filters
                {filters.breweryFilters.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {filters.breweryFilters.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Add venue filter
                </p>
                {availableFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    All filters added
                  </p>
                ) : (
                  availableFields.map((field) => (
                    <Button
                      key={field.key}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => handleAddBreweryFilter(field)}
                    >
                      {field.label}
                    </Button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        
        {/* Clear all button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={handleClearAll}
          >
            <X className="h-4 w-4 mr-1" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
      
      {/* Active brewery filters */}
      {filters.breweryFilters.length > 0 && (
        <div className="space-y-2">
          {filters.breweryFilters.map((filter, index) => {
            const field = filterableFields.find((f) => f.key === filter.key);
            if (!field) return null;
            
            return (
              <BreweryFilterRow
                key={`${filter.key}-${index}`}
                field={field}
                value={filter}
                onChange={(value) => handleUpdateBreweryFilter(index, value)}
                onRemove={() => handleRemoveBreweryFilter(index)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Apply filters to a list of leads
 * This is a client-side filter function
 * 
 * All field accesses are null-safe to prevent crashes on incomplete lead data.
 */
export function applyLeadFilters(leads: Lead[], filters: LeadFiltersState): Lead[] {
  // Safely normalize the search term (never crashes even if filters.search is somehow null/undefined)
  const searchTerm = (filters.search ?? "").toString().toLowerCase().trim();
  
  return leads.filter((lead) => {
    // Search filter - safely coerce all fields to strings before comparison
    if (searchTerm) {
      const businessName = (lead.businessName ?? "").toString().toLowerCase();
      const location = (lead.location ?? "").toString().toLowerCase();
      const website = (lead.website ?? "").toString().toLowerCase();
      
      const matchesName = businessName.includes(searchTerm);
      const matchesLocation = location.includes(searchTerm);
      const matchesWebsite = website.includes(searchTerm);
      
      if (!matchesName && !matchesLocation && !matchesWebsite) return false;
    }
    
    // Status filter
    if (filters.status !== 'all' && lead.status !== filters.status) {
      return false;
    }
    
    // Entity Type filter (generic)
    if (filters.entityType !== 'all') {
      const leadEntityType = (lead.lead_entity_type ?? "").toString();
      if (leadEntityType !== filters.entityType) return false;
    }
    
    // Relationship filter (generic)
    if (filters.relationship !== 'all') {
      const leadRelationship = (lead.relationship_role ?? "").toString();
      if (leadRelationship !== filters.relationship) return false;
    }
    
    // Priority Tag filter (generic)
    if (filters.priorityTag !== 'all') {
      const leadPriority = (lead.priority_tag ?? "").toString();
      if (leadPriority !== filters.priorityTag) return false;
    }
    
    // Brewery/Venue filters - all field accesses are null-safe
    for (const filter of filters.breweryFilters) {
      const value = lead[filter.key as keyof Lead];
      
      if (filter.operator === 'equals') {
        if (value !== filter.value) return false;
      } else if (filter.operator === 'gte') {
        if (typeof value !== 'number' || value < (filter.value as number)) return false;
      } else if (filter.operator === 'lte') {
        if (typeof value !== 'number' || value > (filter.value as number)) return false;
      } else if (filter.operator === 'contains') {
        // Safely coerce to string before calling toLowerCase
        const strValue = (value ?? "").toString().toLowerCase();
        const filterStr = (filter.value ?? "").toString().toLowerCase();
        if (!strValue.includes(filterStr)) {
          return false;
        }
      }
    }
    
    return true;
  });
}

