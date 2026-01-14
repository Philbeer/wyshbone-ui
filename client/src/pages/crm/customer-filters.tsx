/**
 * Customer Filters Page
 * 
 * Advanced filtering and segmentation for customers.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrmCustomers } from '@/features/crm/useCrmCustomers';
import { useCustomerTags, useCreateTag } from '@/features/crm/useTags';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Filter, 
  Tags, 
  Users, 
  Plus,
  Search,
  Save,
  Trash2,
  Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function CustomerFilters() {
  const [activeTab, setActiveTab] = useState('filter');
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isSaveFilterDialogOpen, setIsSaveFilterDialogOpen] = useState(false);
  const [filteredResults, setFilteredResults] = useState<any[] | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const { data: customers } = useCrmCustomers();
  const { data: tags, isLoading: tagsLoading } = useCustomerTags();
  const createTag = useCreateTag();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCounty, setFilterCounty] = useState('');
  const [filterMinOrders, setFilterMinOrders] = useState('');
  const [filterLastOrderDays, setFilterLastOrderDays] = useState('');

  // Tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6b7280');

  // Saved filter form
  const [filterName, setFilterName] = useState('');
  const [filterDescription, setFilterDescription] = useState('');

  // Get saved filters
  const { data: savedFilters } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/crm/saved-filters');
      return response.json();
    },
  });

  // Apply filter
  const handleApplyFilter = async () => {
    setIsFiltering(true);
    try {
      const filters: Record<string, any> = {};
      if (filterStatus) filters.status = filterStatus;
      if (filterCounty) filters.county = filterCounty;
      if (filterMinOrders) filters.minOrderCount = parseInt(filterMinOrders);
      if (filterLastOrderDays) filters.lastOrderDaysAgo = parseInt(filterLastOrderDays);

      const response = await apiRequest('POST', '/api/crm/customers/filter', filters);
      const data = await response.json();
      setFilteredResults(data);
    } catch (error) {
      toast({ title: 'Failed to apply filter', variant: 'destructive' });
    } finally {
      setIsFiltering(false);
    }
  };

  // Reset filter
  const handleResetFilter = () => {
    setFilterStatus('');
    setFilterCounty('');
    setFilterMinOrders('');
    setFilterLastOrderDays('');
    setFilteredResults(null);
  };

  // Create tag
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast({ title: 'Tag name is required', variant: 'destructive' });
      return;
    }
    try {
      await createTag.mutateAsync({
        name: newTagName,
        color: newTagColor,
      });
      setIsTagDialogOpen(false);
      setNewTagName('');
      setNewTagColor('#6b7280');
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Save filter
  const handleSaveFilter = async () => {
    if (!filterName.trim()) {
      toast({ title: 'Filter name is required', variant: 'destructive' });
      return;
    }
    try {
      const filterConfig = {
        status: filterStatus || null,
        county: filterCounty || null,
        minOrderCount: filterMinOrders ? parseInt(filterMinOrders) : null,
        lastOrderDaysAgo: filterLastOrderDays ? parseInt(filterLastOrderDays) : null,
      };
      await apiRequest('POST', '/api/crm/saved-filters', {
        name: filterName,
        description: filterDescription || null,
        filterConfig,
        isDynamic: true,
      });
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setIsSaveFilterDialogOpen(false);
      setFilterName('');
      setFilterDescription('');
      toast({ title: 'Filter saved successfully' });
    } catch (error) {
      toast({ title: 'Failed to save filter', variant: 'destructive' });
    }
  };

  // Load saved filter
  const handleLoadFilter = (filter: any) => {
    const config = filter.filterConfig;
    setFilterStatus(config.status || '');
    setFilterCounty(config.county || '');
    setFilterMinOrders(config.minOrderCount?.toString() || '');
    setFilterLastOrderDays(config.lastOrderDaysAgo?.toString() || '');
    setActiveTab('filter');
  };

  // Get unique counties from customers
  const counties = [...new Set(customers?.map(c => c.country).filter(Boolean))];

  const displayResults = filteredResults || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Filter className="h-8 w-8" />
            Customer Filters
          </h1>
          <p className="text-muted-foreground">
            Filter and segment your customer base
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="filter">
            <Search className="h-4 w-4 mr-2" />
            Filter Customers
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Save className="h-4 w-4 mr-2" />
            Saved Filters
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tags className="h-4 w-4 mr-2" />
            Customer Tags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filter" className="space-y-6">
          {/* Filter Form */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Criteria</CardTitle>
              <CardDescription>
                Build a filter to find specific customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>County/Region</Label>
                  <Select value={filterCounty} onValueChange={setFilterCounty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any county" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any county</SelectItem>
                      {counties.map((county) => (
                        <SelectItem key={county} value={county as string}>{county}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Min Orders</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g., 5"
                    value={filterMinOrders}
                    onChange={(e) => setFilterMinOrders(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Last Order (days ago)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g., 30"
                    value={filterLastOrderDays}
                    onChange={(e) => setFilterLastOrderDays(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-6">
                <Button onClick={handleApplyFilter} disabled={isFiltering}>
                  <Search className="h-4 w-4 mr-2" />
                  {isFiltering ? 'Filtering...' : 'Apply Filter'}
                </Button>
                <Button variant="outline" onClick={handleResetFilter}>
                  Reset
                </Button>
                {filteredResults && filteredResults.length > 0 && (
                  <Button variant="outline" onClick={() => setIsSaveFilterDialogOpen(true)}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Filter
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {filteredResults !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Results</span>
                  <Badge variant="secondary">{displayResults.length} customers</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {displayResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Total Spend</TableHead>
                        <TableHead>Last Order</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayResults.map((result: any) => (
                        <TableRow key={result.customer?.id || result.id}>
                          <TableCell className="font-medium">
                            {result.customer?.name || result.name}
                          </TableCell>
                          <TableCell>{result.orderCount || 0}</TableCell>
                          <TableCell>
                            £{Number(result.totalSpend || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {result.lastOrder 
                              ? new Date(result.lastOrder).toLocaleDateString()
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Link href={`/crm/customers/${result.customer?.id || result.id}`}>
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No customers match your filter criteria
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved Filters</CardTitle>
              <CardDescription>
                Quick access to your frequently used filters
              </CardDescription>
            </CardHeader>
            <CardContent>
              {savedFilters && savedFilters.length > 0 ? (
                <div className="space-y-3">
                  {savedFilters.map((filter: any) => (
                    <div 
                      key={filter.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{filter.name}</p>
                        {filter.description && (
                          <p className="text-sm text-muted-foreground">{filter.description}</p>
                        )}
                        <div className="flex gap-2 mt-2">
                          {filter.filterConfig?.status && (
                            <Badge variant="outline">Status: {filter.filterConfig.status}</Badge>
                          )}
                          {filter.filterConfig?.minOrderCount && (
                            <Badge variant="outline">Min orders: {filter.filterConfig.minOrderCount}</Badge>
                          )}
                          {filter.filterConfig?.lastOrderDaysAgo && (
                            <Badge variant="outline">Last order: {filter.filterConfig.lastOrderDaysAgo}+ days</Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => handleLoadFilter(filter)}>
                        <Search className="h-4 w-4 mr-2" />
                        Load
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Save className="h-12 w-12 mx-auto mb-4" />
                  <p>No saved filters yet</p>
                  <p className="text-sm">Create a filter and save it for quick access</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Customer Tags</CardTitle>
                <CardDescription>
                  Create and manage tags to categorize customers
                </CardDescription>
              </div>
              <Button onClick={() => setIsTagDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Tag
              </Button>
            </CardHeader>
            <CardContent>
              {tagsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : tags && tags.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {tags.map((tag: any) => (
                    <div 
                      key={tag.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border"
                    >
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: tag.color || '#6b7280' }}
                      />
                      <span className="font-medium">{tag.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Tags className="h-12 w-12 mx-auto mb-4" />
                  <p>No tags created yet</p>
                  <p className="text-sm">Tags help you categorize and filter customers</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Tag Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Customer Tag</DialogTitle>
            <DialogDescription>
              Tags help you categorize customers for easier filtering
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tag Name</Label>
              <Input
                placeholder="e.g., VIP, Wholesale, Local"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTag} disabled={createTag.isPending}>
              {createTag.isPending ? 'Creating...' : 'Create Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Filter Dialog */}
      <Dialog open={isSaveFilterDialogOpen} onOpenChange={setIsSaveFilterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
            <DialogDescription>
              Save this filter for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Filter Name</Label>
              <Input
                placeholder="e.g., Inactive customers"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description..."
                value={filterDescription}
                onChange={(e) => setFilterDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveFilterDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFilter}>
              Save Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

