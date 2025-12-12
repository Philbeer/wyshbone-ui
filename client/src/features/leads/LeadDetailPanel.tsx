/**
 * V1-1.5: Lead Detail Panel
 * 
 * A slide-out panel showing detailed information about a lead.
 * - Generic CRM fields (contact info) always visible and editable
 * - Classification fields (status, entity type, relationship, priority) always visible
 * - Pub/venue-specific fields shown when lead_entity_type === "pub"
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Pencil, Save, X, Loader2, User, Tag, Building2 } from "lucide-react";
import type { Lead } from "./types";
import { useVerticalLabels } from "@/lib/verticals";
import {
  BREWERY_FIELDS,
  getFieldValueLabel,
  type BreweryFieldDef,
  type BreweryFieldKey,
} from "@/verticals/brewery/schema";
import { buildLeadUpdatePayload, type LeadDraft } from "@/verticals/brewery/updatePayload";
import {
  STATUS_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  RELATIONSHIP_ROLE_OPTIONS,
  PRIORITY_TAG_OPTIONS,
  NONE_VALUE,
  getOptionLabel,
  type SelectOption,
} from "@/constants/leadOptions";

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback to update lead - injected from parent that has useLeads */
  onUpdateLead?: (leadId: string, updates: LeadDraft) => Promise<void>;
}

/**
 * Get status badge styling
 */
function getStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "new":
      return "bg-secondary text-secondary-foreground";
    case "contacted":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800";
    case "replied":
      return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300";
    case "qualified":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "won":
      return "bg-green-600 text-white";
    case "lost":
      return "bg-gray-400 text-white";
    default:
      return "";
  }
}

/**
 * Get source badge label
 */
function getSourceLabel(source: string) {
  switch (source) {
    case "google": return "Google";
    case "database": return "Database";
    case "manual": return "Manual";
    case "supervisor": return "Supervisor";
    default: return source;
  }
}

/**
 * Read-only field display component
 */
function FieldDisplay({ 
  label, 
  value,
}: { 
  label: string; 
  value: string | number | undefined | null; 
}) {
  const displayValue = (value === null || value === undefined || value === '') 
    ? '—' 
    : value;
    
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm">{displayValue}</div>
    </div>
  );
}

/**
 * Generic select input for classification fields
 * Handles null/undefined values correctly using NONE_VALUE sentinel
 */
function ClassificationSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  // Use undefined for controlled empty state, not empty string
  const selectValue = value || undefined;
  
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase">{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(val) => onChange(val === NONE_VALUE ? null : val)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>Not set</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Pub/venue field input component - renders the appropriate input based on field type
 */
function PubFieldInput({
  field,
  value,
  onChange,
}: {
  field: BreweryFieldDef;
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number | boolean | null) => void;
}) {
  switch (field.type) {
    case 'boolean':
      const boolValue = value === true;
      return (
        <div className="flex items-center justify-between">
          <Label htmlFor={field.key} className="text-sm font-normal">
            {field.label}
          </Label>
          <Switch
            id={field.key}
            checked={boolValue}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );

    case 'number':
      const numValue = value !== null && value !== undefined ? String(value) : '';
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.key} className="text-xs text-muted-foreground uppercase">
            {field.label}
          </Label>
          <Input
            id={field.key}
            type="number"
            value={numValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onChange(null);
              } else {
                const parsed = parseInt(val, 10);
                onChange(isNaN(parsed) ? null : parsed);
              }
            }}
            placeholder={field.placeholder}
            className="h-9"
          />
        </div>
      );

    case 'select':
      const selectValue = (value as string) || undefined;
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.key} className="text-xs text-muted-foreground uppercase">
            {field.label}
          </Label>
          <Select
            value={selectValue}
            onValueChange={(val) => onChange(val === NONE_VALUE ? null : val)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Not set</SelectItem>
              {field.options?.filter(opt => opt.value && opt.value.trim() !== '').map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'text':
    default:
      const textValue = (value as string) || '';
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.key} className="text-xs text-muted-foreground uppercase">
            {field.label}
          </Label>
          <Input
            id={field.key}
            type="text"
            value={textValue}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={field.placeholder}
            className="h-9"
          />
        </div>
      );
  }
}

/**
 * Pub/venue details section - shows either view or edit mode
 */
function PubDetailsSection({
  lead,
  isEditing,
  draft,
  onDraftChange,
}: {
  lead: Lead;
  isEditing: boolean;
  draft: LeadDraft;
  onDraftChange: (key: BreweryFieldKey, value: string | number | boolean | null) => void;
}) {
  if (!isEditing) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {BREWERY_FIELDS.map((field) => {
          const rawValue = lead[field.key as keyof Lead];
          const displayValue = getFieldValueLabel(field.key, rawValue as any);
          return (
            <FieldDisplay 
              key={field.key}
              label={field.label} 
              value={displayValue}
            />
          );
        })}
      </div>
    );
  }

  // Edit mode
  const booleanFields = BREWERY_FIELDS.filter((f) => f.type === 'boolean');
  const otherFields = BREWERY_FIELDS.filter((f) => f.type !== 'boolean');

  const getDraftValue = (key: BreweryFieldKey) => draft[key as keyof LeadDraft];

  return (
    <div className="space-y-4">
      <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
        {booleanFields.map((field) => (
          <PubFieldInput
            key={field.key}
            field={field}
            value={getDraftValue(field.key)}
            onChange={(val) => onDraftChange(field.key, val)}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {otherFields.map((field) => (
          <PubFieldInput
            key={field.key}
            field={field}
            value={getDraftValue(field.key)}
            onChange={(val) => onDraftChange(field.key, val)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Initialize draft from lead values
 */
function initializeDraftFromLead(lead: Lead): LeadDraft {
  return {
    // Lead name
    businessName: lead.businessName ?? '',
    // Classification fields
    status: lead.status ?? null,
    lead_entity_type: lead.lead_entity_type ?? null,
    relationship_role: lead.relationship_role ?? null,
    priority_tag: lead.priority_tag ?? null,
    // Pub/venue fields
    is_freehouse: lead.is_freehouse ?? null,
    cask_lines: lead.cask_lines ?? null,
    keg_lines: lead.keg_lines ?? null,
    has_taproom: lead.has_taproom ?? null,
    annual_production_hl: lead.annual_production_hl ?? null,
    distribution_type: lead.distribution_type ?? null,
    beer_focus: lead.beer_focus ?? null,
    owns_pubs: lead.owns_pubs ?? null,
  };
}

/**
 * Lead detail panel component
 */
export function LeadDetailPanel({ 
  lead, 
  open, 
  onOpenChange,
  onUpdateLead,
}: LeadDetailPanelProps) {
  const { labels } = useVerticalLabels();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>({});
  
  // Reset edit state when panel closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setDraft({});
    }
  }, [open]);

  // Re-init draft if lead ID changes while editing
  useEffect(() => {
    if (isEditing && lead) {
      setDraft(initializeDraftFromLead(lead));
    }
  }, [lead?.id]);

  const handleStartEdit = () => {
    if (!lead) return;
    const initialDraft = initializeDraftFromLead(lead);
    console.log('[LeadDetailPanel] Starting edit:', lead.id, initialDraft);
    setDraft(initialDraft);
    setIsEditing(true);
  };

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setDraft({});
  }, []);

  const handleDraftChange = useCallback((key: string, value: string | number | boolean | null) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!lead || !onUpdateLead) return;
    
    setIsSaving(true);
    try {
      const payload = buildLeadUpdatePayload(draft);
      console.log('[LeadDetailPanel] Saving:', lead.id, payload);
      await onUpdateLead(lead.id, payload);
      setIsEditing(false);
    } catch (error) {
      console.error('[LeadDetailPanel] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!lead) return null;
  
  // Show pub fields when entity type is 'pub' (or null for backwards compat)
  const showPubFields = lead.lead_entity_type === 'pub' || lead.lead_entity_type === null;
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            {isEditing ? (
              <div className="space-y-1.5 flex-1 pr-8">
                <Label htmlFor="lead-name" className="text-xs text-muted-foreground uppercase">
                  Lead Name
                </Label>
                <Input
                  id="lead-name"
                  type="text"
                  value={draft.businessName ?? ''}
                  onChange={(e) => handleDraftChange('businessName', e.target.value)}
                  placeholder="Enter lead name"
                  className="text-lg font-semibold h-10"
                />
              </div>
            ) : (
              <SheetTitle className="text-xl pr-8">
                {lead.businessName}
              </SheetTitle>
            )}
          </div>
          <SheetDescription className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5" />
            {lead.location}
          </SheetDescription>
        </SheetHeader>
        
        {/* Status and Source badges */}
        <div className="flex items-center gap-2 pb-4">
          <Badge variant="outline" className={getStatusBadgeClass(lead.status)}>
            {getOptionLabel(STATUS_OPTIONS, lead.status)}
          </Badge>
          <Badge variant="secondary">
            {getSourceLabel(lead.source)}
          </Badge>
        </div>
        
        {/* Edit/Save Controls */}
        {onUpdateLead && (
          <div className="flex items-center justify-end gap-2 pb-4">
            {isEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button variant="default" size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        )}
        
        <Separator className="my-4" />

        {/* Classification Section - always visible */}
        <section className="space-y-3 mb-6">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Lead Classification</h3>
          </div>
          
          {isEditing ? (
            <div className="grid grid-cols-2 gap-3">
              <ClassificationSelect
                label="Status"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(val) => handleDraftChange('status', val)}
                placeholder="Select status"
              />
              <ClassificationSelect
                label="Entity Type"
                value={draft.lead_entity_type}
                options={ENTITY_TYPE_OPTIONS}
                onChange={(val) => handleDraftChange('lead_entity_type', val)}
                placeholder="Select type"
              />
              <ClassificationSelect
                label="Relationship"
                value={draft.relationship_role}
                options={RELATIONSHIP_ROLE_OPTIONS}
                onChange={(val) => handleDraftChange('relationship_role', val)}
                placeholder="Select relationship"
              />
              <ClassificationSelect
                label="Priority Tag"
                value={draft.priority_tag}
                options={PRIORITY_TAG_OPTIONS}
                onChange={(val) => handleDraftChange('priority_tag', val)}
                placeholder="Select priority"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FieldDisplay label="Status" value={getOptionLabel(STATUS_OPTIONS, lead.status)} />
              <FieldDisplay label="Entity Type" value={getOptionLabel(ENTITY_TYPE_OPTIONS, lead.lead_entity_type)} />
              <FieldDisplay label="Relationship" value={getOptionLabel(RELATIONSHIP_ROLE_OPTIONS, lead.relationship_role)} />
              <FieldDisplay label="Priority Tag" value={getOptionLabel(PRIORITY_TAG_OPTIONS, lead.priority_tag)} />
            </div>
          )}
        </section>
        
        <Separator className="my-4" />

        {/* Contact Information Section - always visible */}
        <section className="space-y-3 mb-6">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Contact Information</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <FieldDisplay label="Email" value={lead.email} />
            <FieldDisplay label="Phone" value={lead.phone} />
            <FieldDisplay label="Website" value={lead.website} />
          </div>
          
          {lead.notes && (
            <div className="pt-1">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                Notes
              </div>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                {lead.notes}
              </p>
            </div>
          )}
        </section>
        
        <Separator className="my-4" />
        
        {/* Pub/Venue Details Section - only when entity type is pub */}
        {showPubFields ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{labels.brewery_info_title}</h3>
            </div>
            
            <PubDetailsSection
              lead={lead}
              isEditing={isEditing}
              draft={draft}
              onDraftChange={handleDraftChange}
            />
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Industry Fields</h3>
            </div>
            <p className="text-sm text-muted-foreground italic">
              No industry-specific fields available for this lead yet.
            </p>
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}
