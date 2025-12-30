/**
 * Complete Call Dialog Component
 * 
 * Modal dialog for marking a call as complete with outcome and notes.
 */

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompleteCall } from "./useDiary";
import type { CallOutcome, CallDiaryEntry, outcomeLabels } from "./types";

interface CompleteCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: CallDiaryEntry;
  entityName: string;
  onSuccess?: () => void;
}

const outcomes: { value: CallOutcome; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Left Voicemail' },
  { value: 'no-answer', label: 'No Answer' },
];

export function CompleteCallDialog({
  open,
  onOpenChange,
  entry,
  entityName,
  onSuccess,
}: CompleteCallDialogProps) {
  const [outcome, setOutcome] = useState<CallOutcome>('connected');
  const [notes, setNotes] = useState(entry.notes || '');
  
  const completeCall = useCompleteCall();
  const isLoading = completeCall.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await completeCall.mutateAsync({
        id: entry.id,
        outcome,
        notes: notes || undefined,
      });
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">
            Mark Call Complete
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              {entry.entityType === 'customer' ? 'Customer' : 'Lead'}
            </Label>
            <div className="font-medium" data-testid="entity-name">
              {entityName}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as CallOutcome)}>
              <SelectTrigger id="outcome" data-testid="select-outcome">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {outcomes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this call..."
              rows={3}
              data-testid="input-notes"
            />
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-submit"
            >
              {isLoading ? 'Saving...' : 'Mark Complete'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CompleteCallDialog;

