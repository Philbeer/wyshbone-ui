/**
 * CRM Activities Page
 * 
 * View and log customer interactions (calls, meetings, notes, etc.)
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActivities, useCreateActivity } from '@/features/crm/useActivities';
import { useCrmCustomers } from '@/features/crm/useCrmCustomers';
import { useLeads } from '@/features/leads/useLeads';
import { 
  Plus, 
  Phone, 
  Users, 
  Mail, 
  StickyNote, 
  Activity,
  Clock,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const activityTypes = [
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'note', label: 'Note', icon: StickyNote },
];

const getActivityIcon = (type: string) => {
  const activity = activityTypes.find(a => a.value === type);
  const Icon = activity?.icon || Activity;
  return <Icon className="h-4 w-4" />;
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'call': return 'bg-blue-100 text-blue-800';
    case 'meeting': return 'bg-purple-100 text-purple-800';
    case 'email': return 'bg-green-100 text-green-800';
    case 'note': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function CrmActivities() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  
  const { data: activities, isLoading } = useActivities(
    filterType !== 'all' ? { activityType: filterType } : undefined
  );
  const { data: customers } = useCrmCustomers();
  const { leads } = useLeads();
  const createActivity = useCreateActivity();
  const { toast } = useToast();

  // Form state
  const [formType, setFormType] = useState('call');
  const [formSubject, setFormSubject] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOutcome, setFormOutcome] = useState('');
  const [formDuration, setFormDuration] = useState('');
  const [formEntityType, setFormEntityType] = useState<'customer' | 'lead'>('customer');
  const [formEntityId, setFormEntityId] = useState('');

  const resetForm = () => {
    setFormType('call');
    setFormSubject('');
    setFormNotes('');
    setFormOutcome('');
    setFormDuration('');
    setFormEntityType('customer');
    setFormEntityId('');
  };

  const handleSave = async () => {
    if (!formEntityId) {
      toast({ title: 'Please select a customer or lead', variant: 'destructive' });
      return;
    }

    try {
      await createActivity.mutateAsync({
        activityType: formType,
        subject: formSubject || null,
        notes: formNotes || null,
        outcome: formOutcome || null,
        durationMinutes: formDuration ? parseInt(formDuration) : null,
        customerId: formEntityType === 'customer' ? formEntityId : null,
        leadId: formEntityType === 'lead' ? formEntityId : null,
        completedAt: new Date().toISOString(),
      });
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Group activities by date
  const groupedActivities = activities?.reduce((groups: Record<string, any[]>, activity: any) => {
    const date = format(new Date(activity.createdAt), 'yyyy-MM-dd');
    if (!groups[date]) groups[date] = [];
    groups[date].push(activity);
    return groups;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Activities
          </h1>
          <p className="text-muted-foreground">
            Track all customer interactions and communications
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Activity
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label>Filter by type:</Label>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {activityTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Activities List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : activities && activities.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedActivities || {}).map(([date, dateActivities]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {format(new Date(date), 'EEEE, MMMM d, yyyy')}
              </h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">Type</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Related To</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="w-24">Duration</TableHead>
                        <TableHead className="w-20">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dateActivities as any[]).map((activity: any) => (
                        <TableRow key={activity.id}>
                          <TableCell>
                            <Badge className={getActivityColor(activity.activityType)}>
                              <span className="flex items-center gap-1">
                                {getActivityIcon(activity.activityType)}
                                {activityTypes.find(t => t.value === activity.activityType)?.label || activity.activityType}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {activity.subject || '-'}
                            {activity.notes && (
                              <p className="text-sm text-muted-foreground truncate max-w-xs">
                                {activity.notes}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {activity.customerName || 
                             (activity.customerId && customers?.find(c => c.id === activity.customerId)?.name) ||
                             (activity.leadId && leads?.find(l => l.id === activity.leadId)?.businessName) ||
                             '-'}
                          </TableCell>
                          <TableCell>{activity.outcome || '-'}</TableCell>
                          <TableCell>
                            {activity.durationMinutes ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {activity.durationMinutes}m
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(activity.createdAt), 'HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-1">No activities yet</h3>
            <p className="text-muted-foreground mb-4">
              Start logging your customer interactions
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Log First Activity
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Log Activity Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Activity Type */}
            <div className="grid grid-cols-4 gap-2">
              {activityTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Button
                    key={type.value}
                    type="button"
                    variant={formType === type.value ? 'default' : 'outline'}
                    className="flex flex-col h-auto py-3"
                    onClick={() => setFormType(type.value)}
                  >
                    <Icon className="h-5 w-5 mb-1" />
                    <span className="text-xs">{type.label}</span>
                  </Button>
                );
              })}
            </div>

            {/* Related To */}
            <div className="space-y-2">
              <Label>Related To</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select 
                  value={formEntityType} 
                  onValueChange={(v: 'customer' | 'lead') => {
                    setFormEntityType(v);
                    setFormEntityId('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={formEntityId} onValueChange={setFormEntityId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${formEntityType}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {formEntityType === 'customer' ? (
                      customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    ) : (
                      leads?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.businessName}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Brief description..."
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Details of the interaction..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Outcome and Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select value={formOutcome} onValueChange={setFormOutcome}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select outcome..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="successful">Successful</SelectItem>
                    <SelectItem value="follow_up_needed">Follow-up Needed</SelectItem>
                    <SelectItem value="no_answer">No Answer</SelectItem>
                    <SelectItem value="voicemail">Left Voicemail</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="15"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createActivity.isPending}>
              {createActivity.isPending ? 'Saving...' : 'Log Activity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

