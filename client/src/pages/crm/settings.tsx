import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmSettingsSchema } from "@shared/schema";
import { z } from "zod";

const formSchema = insertCrmSettingsSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function CrmSettings() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/crm/settings', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: settings || {
      industryVertical: "generic",
      defaultCountry: "United Kingdom",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', '/api/crm/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/settings'] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold" data-testid="text-settings-title">CRM Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your CRM system preferences</p>
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
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Manage your CRM system configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="industryVertical"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry Vertical *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-industry-vertical">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="generic">Generic</SelectItem>
                          <SelectItem value="brewery">Brewery</SelectItem>
                          <SelectItem value="animal_physio">Animal Physiotherapy</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Country *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-default-country" />
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
