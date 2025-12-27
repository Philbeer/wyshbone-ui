import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Save, Lock, Info } from "lucide-react";
import { 
  computeDutyRate, saveLockedDutyRate, getLockedDutyRates, getProducts,
  formatCurrency,
  type DutyRateResult, type DutyCategoryKey, type LockedDutyRate,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const DUTY_CATEGORIES: { value: DutyCategoryKey; label: string }[] = [
  { value: 'beer_draught_lt_3_5', label: 'Beer (Draught, < 3.5%)' },
  { value: 'beer_draught_3_5_to_8_5', label: 'Beer (Draught, 3.5% - 8.5%)' },
  { value: 'beer_non_draught_lt_3_5', label: 'Beer (Non-Draught, < 3.5%)' },
  { value: 'beer_non_draught_3_5_to_8_5', label: 'Beer (Non-Draught, 3.5% - 8.5%)' },
  { value: 'beer_gt_8_5', label: 'Beer (> 8.5%)' },
  { value: 'cider_draught_lt_3_5', label: 'Cider (Draught, < 3.5%)' },
  { value: 'cider_draught_3_5_to_8_5', label: 'Cider (Draught, 3.5% - 8.5%)' },
  { value: 'cider_non_draught_lt_3_5', label: 'Cider (Non-Draught, < 3.5%)' },
  { value: 'cider_non_draught_3_5_to_8_5', label: 'Cider (Non-Draught, 3.5% - 8.5%)' },
  { value: 'cider_gt_8_5', label: 'Cider (> 8.5%)' },
];

export default function BrewCrmDutyCalculatorPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [hlpa, setHlpa] = useState<number>(4500);
  const [selectedCategory, setSelectedCategory] = useState<DutyCategoryKey>('beer_draught_3_5_to_8_5');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [taxPeriodStart, setTaxPeriodStart] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [taxPeriodEnd, setTaxPeriodEnd] = useState<string>(() => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;
  });
  
  const [lockedRates, setLockedRates] = useState<LockedDutyRate[]>(() => getLockedDutyRates(workspaceId));
  
  const products = useMemo(() => getProducts(workspaceId).filter(p => p.isActive), [workspaceId]);
  
  // Compute duty rate
  const result = useMemo<DutyRateResult | null>(() => {
    try {
      return computeDutyRate(hlpa, selectedCategory);
    } catch {
      return null;
    }
  }, [hlpa, selectedCategory]);
  
  // Handle product selection to auto-fill category
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedCategory(product.dutyCategoryKey);
    }
  };
  
  const handleSaveLockedRate = () => {
    if (!result) return;
    
    try {
      saveLockedDutyRate(
        workspaceId,
        result,
        new Date(taxPeriodStart).getTime(),
        new Date(taxPeriodEnd).getTime()
      );
      toast({ title: "Duty rate locked for period" });
      setLockedRates(getLockedDutyRates(workspaceId));
    } catch (error) {
      toast({ title: "Failed to save locked rate", variant: "destructive" });
    }
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold">Duty Rate Calculator</h1>
          <Badge variant="default">LIVE</Badge>
        </div>
        <p className="text-muted-foreground">
          Calculate Small Brewery Relief using the exact piecewise formula.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Calculator Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Calculate Rate
            </CardTitle>
            <CardDescription>
              Enter your annual production volume (HLPA) and select a duty category
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Annual Production (HLPA - Hectolitres Pure Alcohol)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={hlpa}
                onChange={(e) => setHlpa(parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                UK Small Brewery Relief applies to breweries producing up to 60,000 hl/year
              </p>
            </div>
            
            <div>
              <Label>Select Product (optional)</Label>
              <Select value={selectedProductId} onValueChange={handleProductSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a product to use its duty category..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.abv}% {p.productType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Duty Category</Label>
              <Select 
                value={selectedCategory} 
                onValueChange={(v: DutyCategoryKey) => setSelectedCategory(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUTY_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tax Period Start</Label>
                <Input
                  type="date"
                  value={taxPeriodStart}
                  onChange={(e) => setTaxPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <Label>Tax Period End</Label>
                <Input
                  type="date"
                  value={taxPeriodEnd}
                  onChange={(e) => setTaxPeriodEnd(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Result Display */}
        <Card>
          <CardHeader>
            <CardTitle>Calculation Result</CardTitle>
            <CardDescription>
              Based on piecewise SBR formula: discount = (C + M × (HLPA - threshold)) / HLPA
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/30 rounded-md">
                    <div className="text-sm text-muted-foreground">HLPA</div>
                    <div className="text-xl font-bold">{result.hlpa.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-md">
                    <div className="text-sm text-muted-foreground">Base Rate</div>
                    <div className="text-xl font-bold">{formatCurrency(result.baseRatePerHl)}/hl</div>
                  </div>
                </div>
                
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
                  <div className="text-sm text-green-700 dark:text-green-400">SBR Discount</div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {result.discountPercent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Save {formatCurrency(result.discountPerHl)} per hectolitre
                  </div>
                </div>
                
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-md">
                  <div className="text-sm text-primary">Final Duty Rate</div>
                  <div className="text-3xl font-bold text-primary">
                    {formatCurrency(result.finalRatePerHl)}/hl
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p><strong>Category:</strong> {result.displayCategory}</p>
                  <p><strong>Key:</strong> <code className="bg-muted px-1 rounded">{result.dutyCategoryKey}</code></p>
                </div>
                
                <Button className="w-full" onClick={handleSaveLockedRate}>
                  <Lock className="h-4 w-4 mr-2" />
                  Lock Rate for Tax Period
                </Button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Enter values to calculate duty rate
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Formula Explanation */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Small Brewery Relief Formula
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              The UK Small Brewery Relief (SBR) uses a <strong>piecewise/cumulative formula</strong> to calculate duty discounts based on annual production volume:
            </p>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto">
              discount = (C + M × (HLPA - previous_threshold)) / HLPA{'\n'}
              final_rate = base_rate × (1 - discount)
            </pre>
            <p>Where:</p>
            <ul>
              <li><strong>HLPA</strong> = Hectolitres of Pure Alcohol (annual production)</li>
              <li><strong>C</strong> = Cumulative constant from the band lookup table</li>
              <li><strong>M</strong> = Marginal rate for the current band</li>
              <li><strong>previous_threshold</strong> = Lower bound of the current band</li>
            </ul>
            <p className="text-yellow-600 dark:text-yellow-400">
              ⚠️ This uses mock lookup data. In production, rates should be loaded from an official HMRC source.
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Locked Rates History */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Locked Duty Rates</CardTitle>
          <CardDescription>
            Previously saved rates for specific tax periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Rate (per hl)</TableHead>
                <TableHead>Discount %</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lockedRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No locked rates. Calculate and lock a rate to save it here.
                  </TableCell>
                </TableRow>
              ) : (
                lockedRates.map(rate => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.dutyCategoryKey}</TableCell>
                    <TableCell>{new Date(rate.taxPeriodStart).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(rate.taxPeriodEnd).toLocaleDateString()}</TableCell>
                    <TableCell>{formatCurrency(rate.ratePerHl)}</TableCell>
                    <TableCell>{rate.discount.toFixed(2)}%</TableCell>
                    <TableCell><code className="text-xs">{rate.lookupVersion}</code></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

