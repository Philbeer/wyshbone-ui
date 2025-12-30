/**
 * Call List Filters Component
 * 
 * Dropdown filters for entity type filtering in call diary lists.
 */

import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { EntityType, DiaryFilters } from "./types";

interface CallListFiltersProps {
  filters: DiaryFilters;
  onFilterChange: (filters: DiaryFilters) => void;
  showDateFilters?: boolean;
}

export function CallListFilters({ 
  filters, 
  onFilterChange,
  showDateFilters = false,
}: CallListFiltersProps) {
  const handleEntityTypeChange = (value: string) => {
    if (value === 'all') {
      const { entityType, ...rest } = filters;
      onFilterChange(rest);
    } else {
      onFilterChange({ ...filters, entityType: value as EntityType });
    }
  };

  return (
    <div className="flex flex-wrap gap-4 mb-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="entityType" className="text-xs text-muted-foreground">
          Type
        </Label>
        <Select 
          value={filters.entityType || 'all'} 
          onValueChange={handleEntityTypeChange}
        >
          <SelectTrigger 
            id="entityType" 
            className="w-[160px]"
            data-testid="select-entity-type"
          >
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="lead">Leads</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default CallListFilters;

