/**
 * Container QR Scan Page
 * 
 * Scan container QR codes and log movements.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { 
  useScanContainer, 
  useLogContainerMovement, 
  useContainerMovements 
} from '@/features/brewery/useContainerTracking';
import { useCrmCustomers } from '@/features/crm/useCrmCustomers';
import { 
  QrCode, 
  Package, 
  Search, 
  ArrowRight, 
  History,
  MapPin,
  Clock,
  Truck
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const movementTypes = [
  { value: 'filled', label: 'Filled', description: 'Container filled with product' },
  { value: 'dispatched', label: 'Dispatched', description: 'Sent to customer' },
  { value: 'returned', label: 'Returned', description: 'Returned from customer' },
  { value: 'cleaned', label: 'Cleaned', description: 'Cleaned and ready for use' },
];

export default function ContainerScan() {
  const [scanCode, setScanCode] = useState('');
  const [scannedCode, setScannedCode] = useState('');
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const { toast } = useToast();

  // Container data
  const { data: container, isLoading: containerLoading, error: containerError } = useScanContainer(scannedCode);
  const { data: movements } = useContainerMovements(container?.id?.toString() || '');
  const { data: customers } = useCrmCustomers();
  const logMovement = useLogContainerMovement();

  // Movement form state
  const [movementType, setMovementType] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');

  const handleScan = () => {
    if (!scanCode.trim()) {
      toast({ title: 'Please enter a QR code', variant: 'destructive' });
      return;
    }
    setScannedCode(scanCode.trim());
  };

  const resetScan = () => {
    setScanCode('');
    setScannedCode('');
  };

  const handleLogMovement = async () => {
    if (!movementType || !container) {
      toast({ title: 'Movement type is required', variant: 'destructive' });
      return;
    }

    try {
      await logMovement.mutateAsync({
        containerId: container.id.toString(),
        data: {
          movementType,
          toLocation: toLocation || null,
          customerId: customerId || null,
          notes: notes || null,
        },
      });
      setIsLogDialogOpen(false);
      resetMovementForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const resetMovementForm = () => {
    setMovementType('');
    setToLocation('');
    setCustomerId('');
    setNotes('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-100 text-green-800">Available</Badge>;
      case 'in_use':
        return <Badge className="bg-blue-100 text-blue-800">In Use</Badge>;
      case 'with_customer':
        return <Badge className="bg-purple-100 text-purple-800">With Customer</Badge>;
      case 'maintenance':
        return <Badge className="bg-yellow-100 text-yellow-800">Maintenance</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <QrCode className="h-8 w-8" />
          Container Scanner
        </h1>
        <p className="text-muted-foreground">
          Scan container QR codes to track movements
        </p>
      </div>

      {/* Scan Input */}
      <Card>
        <CardHeader>
          <CardTitle>Scan Container</CardTitle>
          <CardDescription>
            Enter the QR code or scan with your device camera
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Enter QR code (e.g., C-1-123-ABC12345)"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              />
            </div>
            <Button onClick={handleScan} disabled={containerLoading}>
              <Search className="h-4 w-4 mr-2" />
              {containerLoading ? 'Searching...' : 'Search'}
            </Button>
            {scannedCode && (
              <Button variant="outline" onClick={resetScan}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Container Details */}
      {scannedCode && (
        containerError ? (
          <Card className="border-red-200">
            <CardContent className="py-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-red-400" />
              <h3 className="text-lg font-medium mb-1">Container Not Found</h3>
              <p className="text-muted-foreground">
                No container matches the code: <code className="bg-muted px-1 rounded">{scannedCode}</code>
              </p>
            </CardContent>
          </Card>
        ) : container ? (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Container Info */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {container.name || `Container #${container.id}`}
                  </CardTitle>
                  <CardDescription>
                    {container.containerType} - {container.size}
                  </CardDescription>
                </div>
                {getStatusBadge(container.status)}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">QR Code</Label>
                    <p className="font-mono text-sm">{container.qrCode}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Barcode</Label>
                    <p className="font-mono text-sm">{container.barcode || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Capacity</Label>
                    <p>{container.capacity} {container.unit}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Current Location</Label>
                    <p>{container.currentLocation || 'Unknown'}</p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button onClick={() => setIsLogDialogOpen(true)} className="w-full">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Log Movement
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Movement History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Movement History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {movements && movements.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {movements.map((movement: any) => (
                      <div 
                        key={movement.id || movement.movement?.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="mt-1">
                          {movement.movement?.movementType === 'dispatched' && <Truck className="h-4 w-4 text-blue-500" />}
                          {movement.movement?.movementType === 'returned' && <Package className="h-4 w-4 text-green-500" />}
                          {movement.movement?.movementType === 'filled' && <Package className="h-4 w-4 text-purple-500" />}
                          {movement.movement?.movementType === 'cleaned' && <Package className="h-4 w-4 text-gray-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium capitalize">
                              {movement.movement?.movementType || movement.movementType}
                            </p>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(movement.movement?.scannedAt || movement.scannedAt), 'PPp')}
                            </span>
                          </div>
                          {(movement.movement?.toLocation || movement.toLocation) && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {movement.movement?.toLocation || movement.toLocation}
                            </p>
                          )}
                          {movement.customerName && (
                            <p className="text-sm text-muted-foreground">
                              Customer: {movement.customerName}
                            </p>
                          )}
                          {(movement.movement?.notes || movement.notes) && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {movement.movement?.notes || movement.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2" />
                    <p>No movements recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : containerLoading ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="animate-pulse">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p>Searching for container...</p>
              </div>
            </CardContent>
          </Card>
        ) : null
      )}

      {/* Quick Actions */}
      {!scannedCode && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Button variant="outline" className="h-24 flex-col">
                <Truck className="h-8 w-8 mb-2" />
                <span>Dispatch Containers</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col">
                <Package className="h-8 w-8 mb-2" />
                <span>Returns Check-in</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col">
                <History className="h-8 w-8 mb-2" />
                <span>View All Containers</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Movement Dialog */}
      <Dialog open={isLogDialogOpen} onOpenChange={(open) => {
        setIsLogDialogOpen(open);
        if (!open) resetMovementForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Container Movement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Movement Type */}
            <div className="space-y-2">
              <Label>Movement Type</Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select movement type..." />
                </SelectTrigger>
                <SelectContent>
                  {movementTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <p>{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>To Location</Label>
              <Input
                placeholder="e.g., Warehouse A, Customer Site"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
              />
            </div>

            {/* Customer (for dispatched/returned) */}
            {(movementType === 'dispatched' || movementType === 'returned') && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogMovement} disabled={logMovement.isPending}>
              {logMovement.isPending ? 'Logging...' : 'Log Movement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

