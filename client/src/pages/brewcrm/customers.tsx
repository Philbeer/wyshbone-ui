import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Users, Plus, Search, Edit } from "lucide-react";
import { getCustomers, upsertCustomer, type BrewCustomer } from "@/lib/brewcrmService";

export default function BrewCrmCustomers() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<BrewCustomer | null>(null);
  const [version, setVersion] = useState(0);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formAddress1, setFormAddress1] = useState("");
  const [formAddress2, setFormAddress2] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formPostcode, setFormPostcode] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive" | "on_hold">("active");
  
  const customers = useMemo(() => {
    let result = getCustomers(workspaceId);
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.postcode?.toLowerCase().includes(q)
      );
    }
    
    if (statusFilter !== "all") {
      result = result.filter(c => c.accountStatus === statusFilter);
    }
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, search, statusFilter, version]);
  
  const openNew = () => {
    setEditingCustomer(null);
    setFormName("");
    setFormAddress1("");
    setFormAddress2("");
    setFormCity("");
    setFormPostcode("");
    setFormNotes("");
    setFormStatus("active");
    setShowDialog(true);
  };
  
  const openEdit = (customer: BrewCustomer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormAddress1(customer.addressLine1 || "");
    setFormAddress2(customer.addressLine2 || "");
    setFormCity(customer.city || "");
    setFormPostcode(customer.postcode || "");
    setFormNotes(customer.deliveryNotes || "");
    setFormStatus(customer.accountStatus);
    setShowDialog(true);
  };
  
  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    
    upsertCustomer(workspaceId, {
      id: editingCustomer?.id,
      name: formName.trim(),
      addressLine1: formAddress1.trim() || undefined,
      addressLine2: formAddress2.trim() || undefined,
      city: formCity.trim() || undefined,
      postcode: formPostcode.trim() || undefined,
      deliveryNotes: formNotes.trim() || undefined,
      accountStatus: formStatus,
    });
    
    setShowDialog(false);
    setVersion(v => v + 1);
    toast({ title: editingCustomer ? "Customer updated" : "Customer created" });
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Customers
              <HelpTooltip content="Store customer details and track their purchase history. Add contacts, addresses, and notes to maintain strong relationships." />
            </h2>
            <p className="text-sm text-muted-foreground">Manage your customer accounts</p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>
      
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle>{customers.length} Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No customers yet"
              description="Add your first customer to start tracking sales and building relationships. You can add details now or fill them in later as you go."
              actionLabel="Add Your First Customer"
              onAction={openNew}
              variant="minimal"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map(customer => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[customer.city, customer.postcode].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={customer.accountStatus === "active" ? "default" : "secondary"}>
                        {customer.accountStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Address Line 1</Label>
              <Input value={formAddress1} onChange={(e) => setFormAddress1(e.target.value)} />
            </div>
            <div>
              <Label>Address Line 2</Label>
              <Input value={formAddress2} onChange={(e) => setFormAddress2(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input value={formCity} onChange={(e) => setFormCity(e.target.value)} />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={formPostcode} onChange={(e) => setFormPostcode(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as typeof formStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Delivery Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

