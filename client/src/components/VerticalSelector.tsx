/**
 * UI-16: Vertical Selector Component
 * 
 * A dropdown selector for switching between industry verticals.
 * Displays in the sidebar with a clear label showing the current selection.
 */

import { Factory } from "lucide-react";
import { useVertical } from "@/contexts/VerticalContext";
import { useToast } from "@/hooks/use-toast";
import type { VerticalId } from "@/lib/verticals/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Factory icon used in VerticalIndicator

export function VerticalSelector() {
  const { currentVerticalId, setCurrentVerticalId, availableVerticals, currentVerticalInfo } = useVertical();
  const { toast } = useToast();

  const handleVerticalChange = (value: string) => {
    const newVerticalId = value as VerticalId;
    setCurrentVerticalId(newVerticalId);
    
    const newVertical = availableVerticals.find(v => v.id === newVerticalId);
    
    toast({
      title: "Vertical Changed",
      description: `Switched to ${newVertical?.label || newVerticalId}. Future plans & leads will use this vertical.`,
    });
  };

  return (
    <div className="px-2">
      <Select value={currentVerticalId} onValueChange={handleVerticalChange}>
        <SelectTrigger 
          data-testid="select-vertical" 
          className="w-full"
        >
          <SelectValue placeholder="Select vertical">
            {currentVerticalInfo.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {availableVerticals.map((vertical) => (
            <SelectItem 
              key={vertical.id} 
              value={vertical.id}
              data-testid={`option-vertical-${vertical.id}`}
            >
              <div className="flex flex-col">
                <span>{vertical.label}</span>
                {vertical.description && (
                  <span className="text-xs text-muted-foreground">
                    {vertical.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Compact vertical indicator for the header
 * Shows the current vertical as a badge/label
 */
export function VerticalIndicator() {
  const { currentVerticalInfo } = useVertical();
  
  return (
    <div 
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs"
      data-testid="vertical-indicator"
    >
      <Factory className="h-3 w-3" />
      <span>Vertical: {currentVerticalInfo.label}</span>
    </div>
  );
}

