/**
 * Schedule Call Dialog Component
 * 
 * Modal dialog for scheduling new calls or rescheduling existing ones.
 */

import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useScheduleCall, useRescheduleCall } from "./useDiary";
import type { EntityType, CallDiaryEntry } from "./types";

interface ScheduleCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  existingEntry?: CallDiaryEntry; // For rescheduling
  onSuccess?: () => void;
}

export function ScheduleCallDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  existingEntry,
  onSuccess,
}: ScheduleCallDialogProps) {
  // Default to tomorrow at 10:00 AM
  const getDefaultDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow;
  };

  const [date, setDate] = useState<Date | undefined>(
    existingEntry ? new Date(existingEntry.scheduledDate) : getDefaultDate()
  );
  const [time, setTime] = useState(
    existingEntry 
      ? format(new Date(existingEntry.scheduledDate), 'HH:mm')
      : '10:00'
  );
  const [notes, setNotes] = useState(existingEntry?.notes || '');
  
  const scheduleCall = useScheduleCall();
  const rescheduleCall = useRescheduleCall();
  
  const isRescheduling = !!existingEntry;
  const isLoading = scheduleCall.isPending || rescheduleCall.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (existingEntry) {
        setDate(new Date(existingEntry.scheduledDate));
        setTime(format(new Date(existingEntry.scheduledDate), 'HH:mm'));
        setNotes(existingEntry.notes || '');
      } else {
        setDate(getDefaultDate());
        setTime('10:00');
        setNotes('');
      }
    }
  }, [open, existingEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date) return;
    
    // Combine date and time
    const [hours, minutes] = time.split(':').map(Number);
    const scheduledDate = new Date(date);
    scheduledDate.setHours(hours, minutes, 0, 0);
    const scheduledTimestamp = scheduledDate.getTime();

    try {
      if (isRescheduling && existingEntry) {
        await rescheduleCall.mutateAsync({
          id: existingEntry.id,
          scheduledDate: scheduledTimestamp,
        });
      } else {
        await scheduleCall.mutateAsync({
          entityType,
          entityId,
          scheduledDate: scheduledTimestamp,
          notes: notes || undefined,
        });
      }
      
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
            {isRescheduling ? 'Reschedule Call' : 'Schedule Call'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              {entityType === 'customer' ? 'Customer' : 'Lead'}
            </Label>
            <div className="font-medium" data-testid="entity-name">
              {entityName}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                  data-testid="button-date-picker"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              data-testid="input-time"
            />
          </div>
          
          {!isRescheduling && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this call..."
                rows={3}
                data-testid="input-notes"
              />
            </div>
          )}
          
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
              disabled={!date || isLoading}
              data-testid="button-submit"
            >
              {isLoading 
                ? (isRescheduling ? 'Rescheduling...' : 'Scheduling...') 
                : (isRescheduling ? 'Reschedule' : 'Schedule Call')
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleCallDialog;

