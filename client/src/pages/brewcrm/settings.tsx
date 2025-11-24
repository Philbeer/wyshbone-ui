import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBrewSettingsSchema } from "@shared/schema";
import { z } from "zod";

const formSchema = insertBrewSettingsSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function BrewCrmSettings() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/brewcrm/settings', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: settings ? {
      defaultWarehouseLocation: settings.defaultWarehouseLocation || "",
      defaultDutyRatePerLitre: settings.defaultDutyRatePerLitre ? settings.defaultDutyRatePerLitre / 100 : undefined,
    } : {
      defaultWarehouseLocation: "",
      defaultDutyRatePerLitre: undefined,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', '/api/brewcrm/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/settings'] });
      toast({ title: "Brewery settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    const payload = {
      ...formValues,
      defaultDutyRatePerLitre: formValues.defaultDutyRatePerLitre ? Math.round(formValues.defaultDutyRatePerLitre * 100) : undefined,
    };
    updateMutation.mutate(payload);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold" data-testid="text-settings-title">Brewery Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your brewery-specific settings</p>
      </div>

      {isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Brewery Configuration</CardTitle>
            <CardDescription>Manage warehouse and duty rate defaults</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="defaultWarehouseLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Warehouse Location</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-warehouse-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultDutyRatePerLitre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Duty Rate Per Litre (£)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          data-testid="input-duty-rate"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-settings">
                  {updateMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
