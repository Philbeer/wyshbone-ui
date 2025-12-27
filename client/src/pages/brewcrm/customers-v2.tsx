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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Users, Search, ArrowUpDown, Filter } from "lucide-react";
import { 
  getCustomers, upsertCustomer, getOrders, formatCurrency, formatDate,
  type BrewCustomer,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const ACCOUNT_STATUSES: { value: BrewCustomer['accountStatus']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_hold', label: 'On Hold' },
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface CustomerFormData {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  deliveryNotes: string;
  accountStatus: BrewCustomer['accountStatus'];
  defaultDeliveryDay: string;
  primaryContactName: string;
  email: string;
  phone: string;
}

const defaultFormData: CustomerFormData = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postcode: '',
  country: 'United Kingdom',
  deliveryNotes: '',
  accountStatus: 'active',
  defaultDeliveryDay: '',
  primaryContactName: '',
  email: '',
  phone: '',
};

type SortField = 'name' | 'lastOrder' | 'totalVolume';
type SortDir = 'asc' | 'desc';

export default function BrewCrmCustomersPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<BrewCustomer[]>(() => getCustomers(workspaceId));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<BrewCustomer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(defaultFormData);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  
  // Filters & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderedInDays, setOrderedInDays] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  
  const refreshCustomers = () => {
    setCustomers(getCustomers(workspaceId));
  };
  
  const filteredAndSortedCustomers = useMemo(() => {
    let result = [...customers];
    
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.postcode?.toLowerCase().includes(q)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => c.accountStatus === statusFilter);
    }
    
    // Ordered in last X days filter
    if (orderedInDays && parseInt(orderedInDays) > 0) {
      const cutoff = Date.now() - parseInt(orderedInDays) * 24 * 60 * 60 * 1000;
      result = result.filter(c => c.lastOrderDate && c.lastOrderDate >= cutoff);
    }
    
    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'lastOrder':
          cmp = (a.lastOrderDate || 0) - (b.lastOrderDate || 0);
          break;
        case 'totalVolume':
          cmp = a.totalVolumeLitres - b.totalVolumeLitres;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    
    return result;
  }, [customers, searchQuery, statusFilter, orderedInDays, sortField, sortDir]);
  
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };
  
  const handleAddNew = () => {
    setEditingCustomer(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (customer: BrewCustomer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      addressLine1: customer.addressLine1 || '',
      addressLine2: customer.addressLine2 || '',
      city: customer.city || '',
      postcode: customer.postcode || '',
      country: customer.country,
      deliveryNotes: customer.deliveryNotes || '',
      accountStatus: customer.accountStatus,
      defaultDeliveryDay: customer.defaultDeliveryDay || '',
      primaryContactName: customer.primaryContactName || '',
      email: customer.email || '',
      phone: customer.phone || '',
    });
    setIsDialogOpen(true);
  };
  
  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    
    try {
      upsertCustomer(workspaceId, {
        id: editingCustomer?.id,
        ...formData,
      });
      toast({ title: editingCustomer ? "Customer updated" : "Customer created" });
      setIsDialogOpen(false);
      refreshCustomers();
    } catch (error) {
      toast({ title: "Failed to save customer", variant: "destructive" });
    }
  };
  
  const handleDelete = () => {
    // In reality we'd soft delete, for now just remove from localStorage
    if (deletingCustomerId) {
      const all = customers.filter(c => c.id !== deletingCustomerId);
      localStorage.setItem('brewcrm_customers', JSON.stringify(all));
      toast({ title: "Customer deleted" });
      setDeletingCustomerId(null);
      refreshCustomers();
    }
  };
  
  const activeCount = customers.filter(c => c.accountStatus === 'active').length;
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Customers</h1>
            <Badge variant="default">LIVE</Badge>
          </div>
          <p className="text-muted-foreground">
            Manage customers with delivery notes, filters, and sorting.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>
      
      {/* Filters Row */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-48">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, city, postcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {ACCOUNT_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs text-muted-foreground">Ordered in last X days</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g., 30"
                value={orderedInDays}
                onChange={(e) => setOrderedInDays(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredAndSortedCustomers.length} of {customers.length} customers
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('name')}>
                    Name
                    <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('lastOrder')}>
                    Last Order
                    <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('totalVolume')}>
                    Total Volume
                    <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No customers found.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCustomers.map(customer => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-sm">
                      {customer.primaryContactName && <div>{customer.primaryContactName}</div>}
                      {customer.phone && <div className="text-muted-foreground">{customer.phone}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{customer.city}</div>
                      <div className="text-muted-foreground">{customer.postcode}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={customer.accountStatus === 'active' ? 'default' : 'secondary'}>
                        {customer.accountStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer.totalVolumeLitres.toFixed(0)}L
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingCustomerId(customer.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Customer Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., The Red Lion"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Primary Contact</Label>
                <Input
                  value={formData.primaryContactName}
                  onChange={(e) => setFormData({ ...formData, primaryContactName: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            
            <div>
              <Label>Address Line 1</Label>
              <Input
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              />
            </div>
            
            <div>
              <Label>Address Line 2</Label>
              <Input
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input
                  value={formData.postcode}
                  onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Account Status</Label>
                <Select 
                  value={formData.accountStatus} 
                  onValueChange={(v: BrewCustomer['accountStatus']) => setFormData({ ...formData, accountStatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default Delivery Day</Label>
                <Select 
                  value={formData.defaultDeliveryDay || 'none'} 
                  onValueChange={(v) => setFormData({ ...formData, defaultDeliveryDay: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DAYS_OF_WEEK.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Delivery Notes</Label>
              <Textarea
                value={formData.deliveryNotes}
                onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                placeholder="Special instructions for deliveries..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>
              {editingCustomer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCustomerId} onOpenChange={() => setDeletingCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the customer. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

