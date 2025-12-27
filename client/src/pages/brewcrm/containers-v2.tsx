import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Container, ArrowRightLeft, Home, MapPin } from "lucide-react";
import { 
  getContainers, upsertContainer, updateContainerStatus, getCustomers, formatDate,
  type BrewContainer, type BrewCustomer,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const CONTAINER_TYPES: { value: BrewContainer['containerType']; label: string }[] = [
  { value: 'cask', label: 'Cask' },
  { value: 'keg', label: 'Keg' },
];

const CONTAINER_STATUSES: { value: BrewContainer['status']; label: string; color: string }[] = [
  { value: 'at_brewery', label: 'At Brewery', color: 'default' },
  { value: 'with_customer', label: 'With Customer', color: 'secondary' },
  { value: 'in_transit', label: 'In Transit', color: 'outline' },
  { value: 'lost', label: 'Lost', color: 'destructive' },
  { value: 'retired', label: 'Retired', color: 'outline' },
];

export default function BrewCrmContainersPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [containers, setContainers] = useState<BrewContainer[]>(() => getContainers(workspaceId));
  const customers = useMemo(() => getCustomers(workspaceId), [workspaceId]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<BrewContainer | null>(null);
  
  // Form state
  const [containerCode, setContainerCode] = useState('');
  const [containerType, setContainerType] = useState<BrewContainer['containerType']>('cask');
  const [volumeLitres, setVolumeLitres] = useState<number>(40.9);
  const [notes, setNotes] = useState('');
  
  // Status update state
  const [newStatus, setNewStatus] = useState<BrewContainer['status']>('at_brewery');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  const refreshContainers = () => {
    setContainers(getContainers(workspaceId));
  };
  
  const handleAddNew = () => {
    setEditingContainer(null);
    setContainerCode('');
    setContainerType('cask');
    setVolumeLitres(40.9);
    setNotes('');
    setIsDialogOpen(true);
  };
  
  const handleSubmit = () => {
    if (!containerCode.trim()) {
      toast({ title: "Container code is required", variant: "destructive" });
      return;
    }
    
    try {
      upsertContainer(workspaceId, {
        id: editingContainer?.id,
        containerCode,
        containerType,
        volumeLitres,
        notes,
      });
      toast({ title: editingContainer ? "Container updated" : "Container created" });
      setIsDialogOpen(false);
      refreshContainers();
    } catch (error) {
      toast({ title: "Failed to save container", variant: "destructive" });
    }
  };
  
  const handleOpenStatusUpdate = (container: BrewContainer) => {
    setEditingContainer(container);
    setNewStatus(container.status);
    setSelectedCustomerId(container.currentCustomerId || '');
    setIsStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = () => {
    if (!editingContainer) return;
    
    const customer = customers.find(c => c.id === selectedCustomerId);
    
    try {
      updateContainerStatus(
        workspaceId,
        editingContainer.id,
        newStatus,
        selectedCustomerId || undefined,
        customer?.name
      );
      toast({ title: "Container status updated" });
      setIsStatusDialogOpen(false);
      refreshContainers();
    } catch (error) {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };
  
  // Summary stats
  const stats = useMemo(() => {
    const atBrewery = containers.filter(c => c.status === 'at_brewery').length;
    const withCustomer = containers.filter(c => c.status === 'with_customer').length;
    const lost = containers.filter(c => c.status === 'lost').length;
    return { atBrewery, withCustomer, lost, total: containers.length };
  }, [containers]);
  
  const getStatusBadgeVariant = (status: BrewContainer['status']): 'default' | 'secondary' | 'outline' | 'destructive' => {
    const s = CONTAINER_STATUSES.find(cs => cs.value === status);
    return (s?.color as any) || 'default';
  };
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Containers</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Track casks and kegs: at brewery, with customers, or in transit.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Container
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Home className="h-4 w-4" />
              At Brewery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.atBrewery}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              With Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.withCustomer}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.lost}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fleet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Containers Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Location</TableHead>
                <TableHead>Last Out</TableHead>
                <TableHead>Last Return</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    <Container className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No containers registered. Add your first container.</p>
                  </TableCell>
                </TableRow>
              ) : (
                containers.map(container => (
                  <TableRow key={container.id}>
                    <TableCell className="font-mono font-medium">{container.containerCode}</TableCell>
                    <TableCell className="capitalize">{container.containerType}</TableCell>
                    <TableCell>{container.volumeLitres}L</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(container.status)}>
                        {container.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {container.currentCustomerName || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {container.lastOutboundDate ? formatDate(container.lastOutboundDate) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {container.lastReturnDate ? formatDate(container.lastReturnDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleOpenStatusUpdate(container)}
                      >
                        <ArrowRightLeft className="h-4 w-4 mr-1" />
                        Update
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Add Container Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Container</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Container Code *</Label>
              <Input
                value={containerCode}
                onChange={(e) => setContainerCode(e.target.value)}
                placeholder="e.g., C001, K-2024-001"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type *</Label>
                <Select value={containerType} onValueChange={(v: BrewContainer['containerType']) => setContainerType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Volume (litres) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={volumeLitres}
                  onChange={(e) => setVolumeLitres(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this container..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Create Container</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Container Status</DialogTitle>
          </DialogHeader>
          
          {editingContainer && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="font-mono font-medium">{editingContainer.containerCode}</div>
                <div className="text-sm text-muted-foreground">
                  {editingContainer.containerType} • {editingContainer.volumeLitres}L
                </div>
              </div>
              
              <div>
                <Label>New Status *</Label>
                <Select value={newStatus} onValueChange={(v: BrewContainer['status']) => setNewStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {newStatus === 'with_customer' && (
                <div>
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStatusUpdate}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

