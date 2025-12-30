/**
 * Sales Diary Page
 * 
 * Main page for managing customer/lead call schedules with three tabs:
 * - Upcoming Calls (today + future)
 * - Overdue Calls (past, not completed)
 * - Call History (completed calls)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarPlus, Phone, Clock, History, AlertTriangle } from "lucide-react";
import { UpcomingCallsList } from "@/features/diary/UpcomingCallsList";
import { OverdueCallsList } from "@/features/diary/OverdueCallsList";
import { CallHistoryList } from "@/features/diary/CallHistoryList";
import { ScheduleCallDialog } from "@/features/diary/ScheduleCallDialog";
import { useUpcomingCalls, useOverdueCalls } from "@/features/diary/useDiary";
import type { EntityType } from "@/features/diary/types";

export default function SalesDiary() {
  const { user } = useUser();
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    type: EntityType;
    id: string;
    name: string;
  } | null>(null);
  
  // Fetch counts for badges
  const { data: upcomingCalls } = useUpcomingCalls();
  const { data: overdueCalls } = useOverdueCalls();
  
  // Fetch customers for the schedule dialog dropdown
  const { data: customers } = useQuery({
    queryKey: ['/api/crm/customers', user.id],
    enabled: !!user.id,
  });

  const upcomingCount = upcomingCalls?.length || 0;
  const overdueCount = overdueCalls?.length || 0;

  const handleScheduleNewCall = () => {
    setSelectedEntity(null);
    setScheduleDialogOpen(true);
  };

  const handleSelectCustomer = (customerId: string) => {
    const customer = (customers as any[])?.find((c: any) => c.id === customerId);
    if (customer) {
      setSelectedEntity({
        type: 'customer',
        id: customer.id,
        name: customer.name,
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-diary-title">
            <Phone className="h-6 w-6" />
            Sales Diary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule and track calls with customers and leads
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* Customer selector for quick scheduling */}
          <Select onValueChange={handleSelectCustomer} value="">
            <SelectTrigger className="w-[200px]" data-testid="select-customer-quick">
              <SelectValue placeholder="Quick schedule..." />
            </SelectTrigger>
            <SelectContent>
              {(customers as any[])?.map((customer: any) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={handleScheduleNewCall}
            data-testid="button-schedule-call"
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            Schedule Call
          </Button>
        </div>
      </div>
      
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <div className="text-2xl font-bold">{upcomingCount}</div>
              <div className="text-sm text-muted-foreground">Upcoming Calls</div>
            </div>
          </div>
        </div>
        
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" />
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
              <div className="text-sm text-muted-foreground">Overdue Calls</div>
            </div>
          </div>
        </div>
        
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
              <History className="h-5 w-5 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <div className="text-2xl font-bold">View</div>
              <div className="text-sm text-muted-foreground">Call History</div>
            </div>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="upcoming" className="flex items-center gap-2" data-testid="tab-upcoming">
            <Clock className="h-4 w-4" />
            Upcoming
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{upcomingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-2" data-testid="tab-overdue">
            <AlertTriangle className="h-4 w-4" />
            Overdue
            {overdueCount > 0 && (
              <Badge variant="destructive" className="ml-1">{overdueCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-history">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="mt-4">
          <UpcomingCallsList />
        </TabsContent>
        
        <TabsContent value="overdue" className="mt-4">
          <OverdueCallsList />
        </TabsContent>
        
        <TabsContent value="history" className="mt-4">
          <CallHistoryList />
        </TabsContent>
      </Tabs>
      
      {/* Schedule Dialog - opens when customer is selected or button is clicked */}
      {selectedEntity && (
        <ScheduleCallDialog
          open={!!selectedEntity}
          onOpenChange={(open) => !open && setSelectedEntity(null)}
          entityType={selectedEntity.type}
          entityId={selectedEntity.id}
          entityName={selectedEntity.name}
        />
      )}
      
      {/* Empty schedule dialog for new calls (placeholder - needs entity selection) */}
      {scheduleDialogOpen && !selectedEntity && (
        <ScheduleCallDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          entityType="customer"
          entityId=""
          entityName="Select a customer first"
        />
      )}
    </div>
  );
}

