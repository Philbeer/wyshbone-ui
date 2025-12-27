import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBrewSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { Calculator } from "lucide-react";

const formSchema = insertBrewSettingsSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

interface DutyLookupBand {
  id: string;
  regime: string;
  dutyCategoryKey: string;
  thresholdHl: string;
  m: string;
  c: string;
  baseRatePerHl: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface CalculatedRate {
  category: string;
  ratePerHl: number;
  baseRate: number;
  reliefApplied: number;
}

export default function BrewCrmSettings() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [annualHl, setAnnualHl] = useState<string>("");
  const [calculatedRates, setCalculatedRates] = useState<CalculatedRate[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

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

  const calculateDutyRates = async () => {
    const annual = parseFloat(annualHl);
    if (isNaN(annual) || annual <= 0) {
      toast({ 
        title: "Invalid input", 
        description: "Please enter a valid annual production in hectolitres", 
        variant: "destructive" 
      });
      return;
    }

    setIsCalculating(true);
    try {
      const response = await apiRequest('GET', '/api/brewcrm/duty-lookup-bands?regime=UK');
      
      // Check for error response
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const bands: DutyLookupBand[] = await response.json();

      if (!Array.isArray(bands)) {
        throw new Error("Invalid response format from server");
      }

      if (bands.length === 0) {
        toast({ 
          title: "No duty bands found", 
          description: "No active duty lookup bands are configured. Please run the SQL migration first.", 
        });
        setCalculatedRates([]);
        return;
      }

      // Group bands by category
      const bandsByCategory = new Map<string, DutyLookupBand[]>();
      for (const band of bands) {
        const existing = bandsByCategory.get(band.dutyCategoryKey) || [];
        existing.push(band);
        bandsByCategory.set(band.dutyCategoryKey, existing);
      }

      // Calculate rate for each category
      const rates: CalculatedRate[] = [];
      for (const [category, categoryBands] of bandsByCategory) {
        // Sort by threshold ASCENDING - threshold_hl is an UPPER threshold
        const sortedBands = [...categoryBands].sort((a, b) => 
          parseFloat(a.thresholdHl) - parseFloat(b.thresholdHl)
        );
        
        // Debug: Log sorted thresholds for this category
        const thresholds = sortedBands.map(b => parseFloat(b.thresholdHl));
        console.log(`[DutyCalc] Category: ${category}, annual_hl: ${annual}`);
        console.log(`[DutyCalc] Sorted thresholds: [${thresholds.join(', ')}]`);
        
        // Find the FIRST band where annual_hl < threshold_hl (strict less than)
        // This selects the segment where annual_hl falls below the upper threshold
        let matchingIndex = sortedBands.findIndex(band => 
          annual < parseFloat(band.thresholdHl)
        );
        
        // If no band found (annual_hl exceeds all thresholds), use the last band
        if (matchingIndex === -1 && sortedBands.length > 0) {
          matchingIndex = sortedBands.length - 1;
        }

        if (matchingIndex !== -1) {
          const matchingBand = sortedBands[matchingIndex];
          const threshold = parseFloat(matchingBand.thresholdHl);
          const m = parseFloat(matchingBand.m);
          const c = parseFloat(matchingBand.c);
          const baseRate = parseFloat(matchingBand.baseRatePerHl);
          
          // prev_threshold is the previous band's threshold (or 0 if first band)
          const prevThreshold = matchingIndex > 0 
            ? parseFloat(sortedBands[matchingIndex - 1].thresholdHl) 
            : 0;

          // Formula from spreadsheet:
          // relief_per_hl = (C + M * (annual_hl - prev_threshold)) / annual_hl
          // final_rate_per_hl = base_rate_per_hl - relief_per_hl
          const reliefTotal = c + m * (annual - prevThreshold);
          const reliefPerHl = reliefTotal / annual;
          const finalRatePerHl = baseRate - reliefPerHl;

          // Debug: Log calculation details
          console.log(`[DutyCalc] === ${category} ===`);
          console.log(`[DutyCalc] Selected band: threshold=${threshold}, M=${m}, C=${c}, base_rate=${baseRate}`);
          console.log(`[DutyCalc] prev_threshold=${prevThreshold}`);
          console.log(`[DutyCalc] Calculation: relief_total = C + M * (annual_hl - prev_threshold)`);
          console.log(`[DutyCalc]              relief_total = ${c} + ${m} * (${annual} - ${prevThreshold})`);
          console.log(`[DutyCalc]              relief_total = ${c} + ${m} * ${annual - prevThreshold}`);
          console.log(`[DutyCalc]              relief_total = ${c} + ${m * (annual - prevThreshold)}`);
          console.log(`[DutyCalc]              relief_total = ${reliefTotal.toFixed(2)}`);
          console.log(`[DutyCalc] relief_per_hl = ${reliefTotal.toFixed(2)} / ${annual} = ${reliefPerHl.toFixed(2)}`);
          console.log(`[DutyCalc] final_rate = ${baseRate} - ${reliefPerHl.toFixed(2)} = ${finalRatePerHl.toFixed(2)}`);
          
          // Proof case verification (for annual_hl = 120, beer_smallpack_lt_3_5)
          if (annual === 120 && category === 'beer_smallpack_lt_3_5') {
            console.log(`[DutyCalc] *** PROOF CASE CHECK ***`);
            console.log(`[DutyCalc] Expected: relief=1.91, final=7.36`);
            console.log(`[DutyCalc] Actual:   relief=${reliefPerHl.toFixed(2)}, final=${finalRatePerHl.toFixed(2)}`);
            console.log(`[DutyCalc] Match: ${Math.abs(reliefPerHl - 1.91) < 0.01 && Math.abs(finalRatePerHl - 7.36) < 0.01 ? '✓ PASS' : '✗ FAIL'}`);
          }

          rates.push({
            category,
            ratePerHl: Math.max(0, finalRatePerHl), // Ensure non-negative
            baseRate,
            reliefApplied: Math.abs(reliefPerHl), // Always store as positive
          });
        }
      }

      // Sort by explicit display order (not alphabetical)
      // Order: smallpack (non-draught) first, then draught
      // Within each: lower ABV before higher ABV
      const categoryOrder: Record<string, number> = {
        // Non-draught (smallpack) categories first
        'beer_smallpack_lt_3_5': 1,      // Beer <3.5%
        'beer_smallpack_3_5_to_8_5': 2,  // Beer >3.5%, <8.5%
        'cider_smallpack_3_5_to_8_5': 3, // Cider >3.5%, <8.5%
        // Draught categories second
        'beer_draught_lt_3_5': 4,        // Beer <3.5%
        'beer_draught_3_5_to_8_5': 5,    // Beer >3.5%, <8.5%
        'cider_draught_3_5_to_8_5': 6,   // Cider >3.5%, <8.5%
      };
      rates.sort((a, b) => {
        const orderA = categoryOrder[a.category] ?? 999;
        const orderB = categoryOrder[b.category] ?? 999;
        return orderA - orderB;
      });
      setCalculatedRates(rates);

      if (rates.length === 0) {
        toast({ 
          title: "No matching bands", 
          description: "No duty bands match the specified annual production volume", 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Calculation failed", 
        description: error.message || "Failed to fetch duty lookup bands", 
        variant: "destructive" 
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCategoryName = (key: string): string => {
    // Map category keys to user-friendly display names
    const displayNames: Record<string, string> = {
      // Non-draught (smallpack) categories
      'beer_smallpack_lt_3_5': 'Non-draught beer <3.5%',
      'beer_smallpack_3_5_to_8_5': 'Non-draught beer >3.5%, <8.5%',
      'cider_smallpack_lt_3_5': 'Non-draught cider <3.5%',
      'cider_smallpack_3_5_to_8_5': 'Non-draught cider >3.5%, <8.5%',
      // Draught categories
      'beer_draught_lt_3_5': 'Draught beer <3.5%',
      'beer_draught_3_5_to_8_5': 'Draught beer >3.5%, <8.5%',
      'cider_draught_lt_3_5': 'Draught cider <3.5%',
      'cider_draught_3_5_to_8_5': 'Draught cider >3.5%, <8.5%',
    };
    
    // Return mapped name or fallback to formatted key
    if (displayNames[key]) {
      return displayNames[key];
    }
    
    // Fallback: convert keys to readable format
    return key
      .replace(/_/g, ' ')
      .replace(/lt (\d+) (\d+)/g, '< $1.$2%')
      .replace(/(\d+) (\d+) to (\d+) (\d+)/gi, '>$1.$2%, <$3.$4%')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold" data-testid="text-settings-title">Brewery Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your brewery-specific settings</p>
      </div>

      <div className="space-y-6">
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

        {/* Duty Rate Calculator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Duty Rate Calculator
            </CardTitle>
            <CardDescription>
              Calculate duty rates based on your annual production volume
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">
                  Annual Production (hectolitres)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 5000"
                  value={annualHl}
                  onChange={(e) => setAnnualHl(e.target.value)}
                  data-testid="input-annual-production"
                />
              </div>
              <Button 
                onClick={calculateDutyRates} 
                disabled={isCalculating || !annualHl}
                data-testid="button-calculate-duty"
              >
                {isCalculating ? "Calculating..." : "Calculate Duty Rates"}
              </Button>
            </div>

            {calculatedRates.length > 0 && (
              <div className="border rounded-md mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Duty Category</TableHead>
                      <TableHead className="text-right">Base Rate (£/hl)</TableHead>
                      <TableHead className="text-right">Relief (£/hl)</TableHead>
                      <TableHead className="text-right">Final Rate (£/hl)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculatedRates.map((rate) => (
                      <TableRow key={rate.category} data-testid={`row-rate-${rate.category}`}>
                        <TableCell className="font-medium">
                          {formatCategoryName(rate.category)}
                        </TableCell>
                        <TableCell className="text-right">
                          £{rate.baseRate.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          £{Math.abs(rate.reliefApplied).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          £{rate.ratePerHl.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {calculatedRates.length === 0 && annualHl && !isCalculating && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Enter your annual production and click "Calculate Duty Rates" to see results.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
