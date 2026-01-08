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
import { useSearchBreweries, useBreweryBeers, useImportBeer, type UntappdBeer, type UntappdBrewery } from './useUntappd';
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

// Default package sizes for each type (in litres)
const DEFAULT_PACKAGE_SIZES: Record<'cask' | 'keg' | 'can' | 'bottle', number> = {
  cask: 40.9, // 9 gallon cask
  keg: 30,    // 30L keg
  can: 0.44,  // 440ml can
  bottle: 0.5, // 500ml bottle
};

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
  const { data: breweryBeers, isLoading: isLoadingBeers } = useBreweryBeers(selectedBrewery?.brewery_id || null, {
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
      const beers: BeerToImport[] = breweryBeers.beers.map((beer) => ({
        ...beer,
        packageType: 'keg',
        packageSizeLitres: DEFAULT_PACKAGE_SIZES.keg,
        unitPriceExVat: 0,
        selected: true,
      }));
      setBeersToImport(beers);
      setStep('beer-list');
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
    const beer = beersToImport[currentBeerIndex];
    if (beer.selected) {
      try {
        await importBeer.mutateAsync({
          bid: beer.bid,
          packageType: beer.packageType,
          packageSizeLitres: beer.packageSizeLitres,
          unitPriceExVat: beer.unitPriceExVat > 0 ? beer.unitPriceExVat : undefined,
        });
        setImportedCount((prev) => prev + 1);
      } catch (error) {
        // Error is handled by the hook
        setSkippedCount((prev) => prev + 1);
      }
    } else {
      setSkippedCount((prev) => prev + 1);
    }

    // Move to next selected beer or complete
    const nextSelectedIndex = beersToImport.findIndex((beer, idx) => idx > currentBeerIndex && beer.selected);
    if (nextSelectedIndex === -1) {
      // No more beers to import
      setStep('complete');
    } else {
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
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{currentBeer.beer_style}</Badge>
                    <Badge variant="outline">{currentBeer.beer_abv}% ABV</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Duty Band: {calculateDutyRate(currentBeer.beer_abv).dutyBand}
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
                      <SelectItem value="cask">Cask 9G (40.9L)</SelectItem>
                      <SelectItem value="keg">Keg 30L</SelectItem>
                      <SelectItem value="can">Can 440ml</SelectItem>
                      <SelectItem value="bottle">Bottle 500ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packageSize">Package Size (litres) *</Label>
                  <Input
                    id="packageSize"
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentBeer.packageSizeLitres}
                    onChange={(e) => handleUpdateCurrentBeer({ packageSizeLitres: parseFloat(e.target.value) || 0 })}
                  />
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
              <Button onClick={handleImportCurrent} disabled={importBeer.isPending || currentBeer.packageSizeLitres <= 0}>
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
