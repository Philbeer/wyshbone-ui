/**
 * Untappd Import Modal
 *
 * Multi-step modal flow for importing beers from Untappd:
 * 1. Search for brewery by name
 * 2. Select brewery from search results
 * 3. View all beers from that brewery
 * 4. Review and configure each beer (package type, price, etc.)
 * 5. Import selected beers
 */

import { useState, useEffect } from 'react';
import { Search, Beer, Loader2, Check, ChevronRight, ArrowLeft, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useSearchBreweries, useAllBreweryBeers, useImportBeer, type UntappdBeer, type UntappdBrewery } from './useUntappd';
import { useDebounce } from '@/hooks/useDebounce';
import { calculateDutyRate } from '@/utils/dutyCalculations';

interface UntappdImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'brewery-search' | 'beer-list' | 'beer-review' | 'complete';

interface BeerToImport extends UntappdBeer {
  packageType: 'cask' | 'keg' | 'can' | 'bottle';
  packageSizeLitres: number;
  unitPriceExVat: number;
  selected: boolean;
}

// Package size options for each type (in litres)
const PACKAGE_SIZE_OPTIONS: Record<'cask' | 'keg' | 'can' | 'bottle', Array<{ value: number; label: string }>> = {
  cask: [
    { value: 40.9, label: '40.9L (9 gallon)' },
    { value: 20.45, label: '20.45L (4.5 gallon / half)' },
  ],
  keg: [
    { value: 50, label: '50L' },
    { value: 30, label: '30L' },
    { value: 20, label: '20L' },
  ],
  can: [
    { value: 0.568, label: '568ml (pint can)' },
    { value: 0.5, label: '500ml' },
    { value: 0.44, label: '440ml (UK standard)' },
    { value: 0.33, label: '330ml (craft)' },
  ],
  bottle: [
    { value: 0.75, label: '750ml (special release)' },
    { value: 0.5, label: '500ml (UK standard)' },
    { value: 0.33, label: '330ml (EU standard)' },
    { value: 0.275, label: '275ml' },
  ],
};

// Default package sizes for each type (in litres) - first option in each list
const DEFAULT_PACKAGE_SIZES: Record<'cask' | 'keg' | 'can' | 'bottle', number> = {
  cask: 40.9,
  keg: 30,
  can: 0.44,
  bottle: 0.5,
};

/**
 * Suggests package type and size based on Untappd serving_styles data
 * @param servingStyles - Array of serving types from check-ins (e.g., ["Draft", "Bottle"])
 * @returns Suggested package type and size
 */
function suggestPackageFromServingStyles(servingStyles?: string[]): { type: 'cask' | 'keg' | 'can' | 'bottle'; size: number } {
  if (!servingStyles || servingStyles.length === 0) {
    // Default to keg if no serving style data
    return { type: 'keg', size: DEFAULT_PACKAGE_SIZES.keg };
  }

  // Normalize serving styles to lowercase for comparison
  const normalized = servingStyles.map(s => s.toLowerCase());

  // Priority order: Cask > Draft/Keg > Can > Bottle
  // Cask is highly specific to UK breweries
  if (normalized.some(s => s.includes('cask'))) {
    return { type: 'cask', size: DEFAULT_PACKAGE_SIZES.cask };
  }

  // Draft usually means keg
  if (normalized.some(s => s.includes('draft') || s.includes('tap') || s.includes('keg'))) {
    return { type: 'keg', size: DEFAULT_PACKAGE_SIZES.keg };
  }

  // Can
  if (normalized.some(s => s.includes('can'))) {
    return { type: 'can', size: DEFAULT_PACKAGE_SIZES.can };
  }

  // Bottle
  if (normalized.some(s => s.includes('bottle'))) {
    return { type: 'bottle', size: DEFAULT_PACKAGE_SIZES.bottle };
  }

  // Default to keg
  return { type: 'keg', size: DEFAULT_PACKAGE_SIZES.keg };
}

export function UntappdImportModal({ open, onOpenChange }: UntappdImportModalProps) {
  const [step, setStep] = useState<Step>('brewery-search');
  const [brewerySearchQuery, setBrewerySearchQuery] = useState('');
  const [selectedBrewery, setSelectedBrewery] = useState<UntappdBrewery | null>(null);
  const [beersToImport, setBeersToImport] = useState<BeerToImport[]>([]);
  const [currentBeerIndex, setCurrentBeerIndex] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const debouncedBreweryQuery = useDebounce(brewerySearchQuery, 500);
  const { data: breweryResults, isLoading: isSearchingBreweries } = useSearchBreweries(debouncedBreweryQuery, {
    enabled: step === 'brewery-search' && debouncedBreweryQuery.length > 0,
  });
  const { data: breweryBeers, isLoading: isLoadingBeers } = useAllBreweryBeers(selectedBrewery?.brewery_id || null, {
    enabled: !!selectedBrewery,
  });
  const importBeer = useImportBeer();

  const handleReset = () => {
    setStep('brewery-search');
    setBrewerySearchQuery('');
    setSelectedBrewery(null);
    setBeersToImport([]);
    setCurrentBeerIndex(0);
    setImportedCount(0);
    setSkippedCount(0);
  };

  const handleSelectBrewery = (brewery: UntappdBrewery) => {
    setSelectedBrewery(brewery);
    // Clear beers when selecting a new brewery to force fresh data
    setBeersToImport([]);
  };

  // When brewery beers load, populate the beersToImport list
  useEffect(() => {
    if (breweryBeers && breweryBeers.beers.length > 0 && beersToImport.length === 0) {
      const beers: BeerToImport[] = breweryBeers.beers.map((beer) => {
        // Suggest package type and size based on serving_styles data from check-ins
        const suggestion = suggestPackageFromServingStyles(beer.serving_styles);

        return {
          ...beer,
          packageType: suggestion.type,
          packageSizeLitres: suggestion.size,
          unitPriceExVat: 0,
          selected: true,
        };
      });
      setBeersToImport(beers);
      setStep('beer-list');

      // Log serving style suggestions for debugging
      console.log(`📊 Loaded ${beers.length} beers with serving style suggestions:`, {
        totalBeers: beers.length,
        source: breweryBeers.source,
        checkinPagesFetched: breweryBeers.checkin_pages_fetched,
        apiCallsUsed: breweryBeers.api_calls_used,
        beersWithServingStyles: beers.filter(b => b.serving_styles && b.serving_styles.length > 0).length,
      });
    }
  }, [breweryBeers, beersToImport.length]);

  const handleToggleBeerSelection = (index: number) => {
    const updated = [...beersToImport];
    updated[index].selected = !updated[index].selected;
    setBeersToImport(updated);
  };

  const handleSelectAllBeers = () => {
    const updated = beersToImport.map((beer) => ({ ...beer, selected: true }));
    setBeersToImport(updated);
  };

  const handleDeselectAllBeers = () => {
    const updated = beersToImport.map((beer) => ({ ...beer, selected: false }));
    setBeersToImport(updated);
  };

  const handleProceedToReview = () => {
    // Find first selected beer
    const firstSelectedIndex = beersToImport.findIndex((beer) => beer.selected);
    if (firstSelectedIndex === -1) {
      // No beers selected
      return;
    }
    setCurrentBeerIndex(firstSelectedIndex);
    setStep('beer-review');
  };

  const handleUpdateCurrentBeer = (updates: Partial<BeerToImport>) => {
    const updated = [...beersToImport];
    updated[currentBeerIndex] = { ...updated[currentBeerIndex], ...updates };
    setBeersToImport(updated);
  };

  const handlePackageTypeChange = (packageType: 'cask' | 'keg' | 'can' | 'bottle') => {
    handleUpdateCurrentBeer({
      packageType,
      packageSizeLitres: DEFAULT_PACKAGE_SIZES[packageType],
    });
  };

  const handleImportCurrent = async () => {
    console.log('🍺 [Untappd] handleImportCurrent called');
    const beer = beersToImport[currentBeerIndex];
    console.log('🍺 [Untappd] Current beer:', beer.beer_name, 'selected:', beer.selected);

    if (beer.selected) {
      try {
        console.log('🍺 [Untappd] Calling importBeer.mutateAsync with:', {
          bid: beer.bid,
          packageType: beer.packageType,
          packageSizeLitres: beer.packageSizeLitres,
          unitPriceExVat: beer.unitPriceExVat > 0 ? beer.unitPriceExVat : undefined,
        });

        await importBeer.mutateAsync({
          bid: beer.bid,
          packageType: beer.packageType,
          packageSizeLitres: beer.packageSizeLitres,
          unitPriceExVat: beer.unitPriceExVat > 0 ? beer.unitPriceExVat : undefined,
        });

        console.log('🍺 [Untappd] Import successful!');
        setImportedCount((prev) => prev + 1);
      } catch (error) {
        console.error('🍺 [Untappd] Import failed:', error);
        // Error is handled by the hook
        setSkippedCount((prev) => prev + 1);
      }
    } else {
      console.log('🍺 [Untappd] Beer not selected, skipping');
      setSkippedCount((prev) => prev + 1);
    }

    // Move to next selected beer or complete
    const nextSelectedIndex = beersToImport.findIndex((beer, idx) => idx > currentBeerIndex && beer.selected);
    console.log('🍺 [Untappd] Next selected index:', nextSelectedIndex);

    if (nextSelectedIndex === -1) {
      // No more beers to import
      console.log('🍺 [Untappd] No more beers, moving to complete step');
      setStep('complete');
    } else {
      console.log('🍺 [Untappd] Moving to next beer at index:', nextSelectedIndex);
      setCurrentBeerIndex(nextSelectedIndex);
    }
  };

  const handleSkipCurrent = () => {
    setSkippedCount((prev) => prev + 1);
    // Move to next selected beer or complete
    const nextSelectedIndex = beersToImport.findIndex((beer, idx) => idx > currentBeerIndex && beer.selected);
    if (nextSelectedIndex === -1) {
      setStep('complete');
    } else {
      setCurrentBeerIndex(nextSelectedIndex);
    }
  };

  const currentBeer = beersToImport[currentBeerIndex];
  const selectedBeersCount = beersToImport.filter((beer) => beer.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        {/* STEP 1: BREWERY SEARCH */}
        {step === 'brewery-search' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Search for Your Brewery
              </DialogTitle>
              <DialogDescription>
                Find your brewery on Untappd to import all your beers
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for brewery name (e.g., Limehouse Brewery)..."
                    value={brewerySearchQuery}
                    onChange={(e) => setBrewerySearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              {isSearchingBreweries && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Searching breweries...</span>
                </div>
              )}

              {breweryResults && breweryResults.count > 0 && !isSearchingBreweries && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Found {breweryResults.count} brewery{breweryResults.count !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {breweryResults.breweries.map((brewery) => (
                      <Card
                        key={brewery.brewery_id}
                        className="cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handleSelectBrewery(brewery)}
                      >
                        <CardContent className="p-4 flex gap-4">
                          <img
                            src={brewery.brewery_label}
                            alt={brewery.brewery_name}
                            className="w-16 h-16 rounded object-cover"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold truncate">{brewery.brewery_name}</h4>
                            <p className="text-sm text-muted-foreground truncate">
                              {brewery.location?.brewery_city && brewery.location.brewery_state
                                ? `${brewery.location.brewery_city}, ${brewery.location.brewery_state}`
                                : brewery.country_name}
                            </p>
                            {brewery.beer_count && (
                              <Badge variant="secondary" className="mt-1">
                                {brewery.beer_count} beers
                              </Badge>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground self-center" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {breweryResults && breweryResults.count === 0 && !isSearchingBreweries && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No breweries found. Try a different search.</p>
                </div>
              )}

              {!brewerySearchQuery && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Start typing to search for your brewery on Untappd</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP 2: BEER LIST */}
        {step === 'beer-list' && selectedBrewery && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Beer className="h-5 w-5" />
                Select Beers to Import
              </DialogTitle>
              <DialogDescription>
                {selectedBrewery.brewery_name} - {beersToImport.length} beers found
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {selectedBeersCount} of {beersToImport.length} selected
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAllBeers}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAllBeers}>
                    Deselect All
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-2">
                {beersToImport.map((beer, index) => (
                  <div
                    key={beer.bid}
                    className="flex items-start gap-3 p-3 rounded-md hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      checked={beer.selected}
                      onCheckedChange={() => handleToggleBeerSelection(index)}
                      className="mt-1"
                    />
                    <img src={beer.beer_label} alt={beer.beer_name} className="w-12 h-12 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{beer.beer_name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{beer.beer_style}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {beer.beer_abv}% ABV
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setStep('brewery-search')} className="sm:mr-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Search
              </Button>
              <Button onClick={handleProceedToReview} disabled={selectedBeersCount === 0}>
                Review {selectedBeersCount} Beer{selectedBeersCount !== 1 ? 's' : ''}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 3: BEER REVIEW */}
        {step === 'beer-review' && currentBeer && (
          <>
            <DialogHeader>
              <DialogTitle>Review & Configure Beer</DialogTitle>
              <DialogDescription>
                Beer {beersToImport.filter((b, i) => i <= currentBeerIndex && b.selected).length} of {selectedBeersCount}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Beer details */}
              <div className="flex gap-4">
                <img src={currentBeer.beer_label} alt={currentBeer.beer_name} className="w-24 h-24 rounded object-cover" />
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{currentBeer.beer_name}</h3>
                  <p className="text-sm text-muted-foreground">{currentBeer.brewery?.brewery_name || 'Unknown Brewery'}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary">{currentBeer.beer_style}</Badge>
                    <Badge variant="outline">{currentBeer.beer_abv}% ABV</Badge>
                    {currentBeer.serving_styles && currentBeer.serving_styles.length > 0 && (
                      <>
                        {currentBeer.serving_styles.map((style, idx) => (
                          <Badge key={idx} variant="default" className="bg-blue-500">
                            {style}
                          </Badge>
                        ))}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Duty Band: {calculateDutyRate(currentBeer.beer_abv).dutyBand}
                    {currentBeer.serving_styles && currentBeer.serving_styles.length > 0 && (
                      <span className="ml-2">• Package type suggested from {currentBeer.serving_styles.length} serving style{currentBeer.serving_styles.length > 1 ? 's' : ''}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Package configuration */}
              <div className="space-y-4 border rounded-lg p-4">
                <div className="space-y-2">
                  <Label htmlFor="packageType">Package Type *</Label>
                  <Select value={currentBeer.packageType} onValueChange={(value) => handlePackageTypeChange(value as any)}>
                    <SelectTrigger id="packageType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cask">Cask</SelectItem>
                      <SelectItem value="keg">Keg</SelectItem>
                      <SelectItem value="can">Can</SelectItem>
                      <SelectItem value="bottle">Bottle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packageSize">Package Size *</Label>
                  <Select
                    value={currentBeer.packageSizeLitres.toString()}
                    onValueChange={(value) => handleUpdateCurrentBeer({ packageSizeLitres: parseFloat(value) })}
                  >
                    <SelectTrigger id="packageSize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PACKAGE_SIZE_OPTIONS[currentBeer.packageType].map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Unit Price (ex VAT) £</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={currentBeer.unitPriceExVat || ''}
                    onChange={(e) => handleUpdateCurrentBeer({ unitPriceExVat: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to set later</p>
                </div>
              </div>

              {/* Serving Types Found on Untappd - Debug Panel */}
              {currentBeer.serving_styles && currentBeer.serving_styles.length > 0 && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <p className="font-semibold text-sm text-blue-900 mb-2">
                    Dispense/Serving Types Found on Untappd:
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {currentBeer.serving_styles.map((style, idx) => (
                      <Badge key={idx} variant="default" className="bg-blue-600">
                        {style}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    Package type was auto-suggested based on {currentBeer.serving_styles.length} serving style{currentBeer.serving_styles.length > 1 ? 's' : ''} found in check-ins
                  </p>
                </div>
              )}

              {currentBeer.beer_description && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-1">Description:</p>
                  <p className="line-clamp-3">{currentBeer.beer_description}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setStep('beer-list')} className="sm:mr-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to List
              </Button>
              <Button variant="outline" onClick={handleSkipCurrent}>
                Skip This Beer
              </Button>
              <Button
                onClick={() => {
                  console.log('🍺 [Untappd] Import Beer button clicked!');
                  console.log('🍺 [Untappd] isPending:', importBeer.isPending, 'packageSize:', currentBeer.packageSizeLitres);
                  handleImportCurrent();
                }}
                disabled={importBeer.isPending || currentBeer.packageSizeLitres <= 0}
              >
                {importBeer.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>Import Beer</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 4: COMPLETE */}
        {step === 'complete' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Import Complete!
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  {importedCount > 0
                    ? `Successfully imported ${importedCount} beer${importedCount !== 1 ? 's' : ''} to your products.`
                    : 'No beers were imported.'}
                </p>

                <div className="flex justify-center gap-8 mb-4">
                  <div>
                    <div className="text-3xl font-bold text-green-600">{importedCount}</div>
                    <div className="text-xs text-muted-foreground">Imported</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-gray-400">{skippedCount}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>
                Import More Beers
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
