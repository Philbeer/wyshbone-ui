import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBrewDutyReportSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const formSchema = insertBrewDutyReportSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function BrewCrmDutyReports() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const { data: dutyReports, isLoading } = useQuery({
    queryKey: ['/api/brewcrm/duty-reports', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      periodStart: Date.now(),
      periodEnd: Date.now(),
      totalLitres: 0,
      totalDutyAmount: 0,
      breakdownJson: {},
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/brewcrm/duty-reports', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/duty-reports'] });
      toast({ title: "Duty report created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create duty report", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/brewcrm/duty-reports/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/duty-reports'] });
      toast({ title: "Duty report updated successfully" });
      setIsDialogOpen(false);
      setEditingReport(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update duty report", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/brewcrm/duty-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/duty-reports'] });
      toast({ title: "Duty report deleted successfully" });
      setDeletingReportId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete duty report", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (report: any) => {
    setEditingReport(report);
    form.reset({
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      totalLitres: report.totalLitres / 1000 || 0,
      totalDutyAmount: report.totalDutyAmount / 100 || 0,
      breakdownJson: report.breakdownJson || {},
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingReport(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    const payload = {
      ...formValues,
      totalLitres: Math.round(formValues.totalLitres * 1000),
      totalDutyAmount: Math.round(formValues.totalDutyAmount * 100),
    };
    
    if (editingReport) {
      updateMutation.mutate({ id: editingReport.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-duty-reports-title">Duty Reports</h2>
          <p className="text-sm text-muted-foreground">Manage brewery duty reporting</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-duty-report">
          <Plus className="w-4 h-4 mr-2" />
          Add Duty Report
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Total Litres</TableHead>
                <TableHead>Total Duty</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dutyReports?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No duty reports found. Create your first duty report to get started.
                  </TableCell>
                </TableRow>
              ) : (
                dutyReports?.map((report: any) => (
                  <TableRow key={report.id} data-testid={`row-duty-report-${report.id}`}>
                    <TableCell>{new Date(report.periodStart).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(report.periodEnd).toLocaleDateString()}</TableCell>
                    <TableCell>{(report.totalLitres / 1000).toFixed(1)}L</TableCell>
                    <TableCell>£{((report.totalDutyAmount || 0) / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(report)}
                          data-testid={`button-edit-duty-report-${report.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingReportId(report.id)}
                          data-testid={`button-delete-duty-report-${report.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingReport ? "Edit Duty Report" : "Add Duty Report"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="periodStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period Start *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          value={new Date(field.value).toISOString().split('T')[0]}
                          onChange={(e) => field.onChange(new Date(e.target.value).getTime())}
                          data-testid="input-period-start"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="periodEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period End *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          value={new Date(field.value).toISOString().split('T')[0]}
                          onChange={(e) => field.onChange(new Date(e.target.value).getTime())}
                          data-testid="input-period-end"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="totalLitres"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Litres *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-total-litres"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="totalDutyAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Duty Amount (£) *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-total-duty-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="breakdownJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breakdown JSON *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}
                        onChange={(e) => {
                          try {
                            field.onChange(JSON.parse(e.target.value));
                          } catch {
                            field.onChange(e.target.value);
                          }
                        }}
                        rows={5}
                        data-testid="input-breakdown-json"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingReport ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingReportId} onOpenChange={() => setDeletingReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the duty report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingReportId && deleteMutation.mutate(deletingReportId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
