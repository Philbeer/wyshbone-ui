/**
 * Untappd Import Modal
 *
 * Multi-step modal flow for importing beers from Untappd:
 * 1. Search for beers
 * 2. Review and configure each beer (package type, price, etc.)
 * 3. Import selected beers
 */

import { useState } from 'react';
import { Search, Beer, Loader2, Check, X, ChevronRight, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSearchBeers, useImportBeer, type UntappdBeer } from './useUntappd';
import { useDebounce } from '@/hooks/useDebounce';
import { calculateDutyRate } from '@/utils/dutyCalculations';

interface UntappdImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'search' | 'review' | 'complete';

interface BeerToImport extends UntappdBeer {
  packageType: 'cask' | 'keg' | 'can' | 'bottle';
  packageSizeLitres: number;
  unitPriceExVat: number;
  skip: boolean;
}

// Default package sizes for each type (in litres)
const DEFAULT_PACKAGE_SIZES: Record<'cask' | 'keg' | 'can' | 'bottle', number> = {
  cask: 40.9, // 9 gallon cask
  keg: 30,    // 30L keg
  can: 0.44,  // 440ml can
  bottle: 0.5, // 500ml bottle
};

export function UntappdImportModal({ open, onOpenChange }: UntappdImportModalProps) {
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBeers, setSelectedBeers] = useState<BeerToImport[]>([]);
  const [currentBeerIndex, setCurrentBeerIndex] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const debouncedQuery = useDebounce(searchQuery, 500);
  const { data: searchResults, isLoading: isSearching } = useSearchBeers(debouncedQuery, {
    enabled: step === 'search' && debouncedQuery.length > 0,
  });
  const importBeer = useImportBeer();

  const handleReset = () => {
    setStep('search');
    setSearchQuery('');
    setSelectedBeers([]);
    setCurrentBeerIndex(0);
    setImportedCount(0);
    setSkippedCount(0);
  };

  const handleSelectBeer = (beer: UntappdBeer) => {
    const beerToImport: BeerToImport = {
      ...beer,
      packageType: 'keg',
      packageSizeLitres: DEFAULT_PACKAGE_SIZES.keg,
      unitPriceExVat: 0,
      skip: false,
    };
    setSelectedBeers([beerToImport]);
    setCurrentBeerIndex(0);
    setStep('review');
  };

  const handleUpdateBeer = (updates: Partial<BeerToImport>) => {
    const updatedBeers = [...selectedBeers];
    updatedBeers[currentBeerIndex] = { ...updatedBeers[currentBeerIndex], ...updates };
    setSelectedBeers(updatedBeers);
  };

  const handleImportCurrent = async () => {
    const beer = selectedBeers[currentBeerIndex];
    if (!beer.skip) {
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

    // Move to complete or next beer
    setStep('complete');
  };

  const handleSkipCurrent = () => {
    handleUpdateBeer({ skip: true });
    setSkippedCount((prev) => prev + 1);
    setStep('complete');
  };

  const handlePackageTypeChange = (packageType: 'cask' | 'keg' | 'can' | 'bottle') => {
    handleUpdateBeer({
      packageType,
      packageSizeLitres: DEFAULT_PACKAGE_SIZES[packageType],
    });
  };

  const currentBeer = selectedBeers[currentBeerIndex];
  const totalBeers = selectedBeers.length;
  const progress = totalBeers > 0 ? ((importedCount + skippedCount) / totalBeers) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        {/* STEP 1: SEARCH */}
        {step === 'search' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Beer className="h-5 w-5" />
                Import Products from Untappd
              </DialogTitle>
              <DialogDescription>
                Search for beers on Untappd and import them as products
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for beers (e.g., IPA, Lager, Brewery name...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Searching Untappd...</span>
                </div>
              )}

              {searchResults && searchResults.count > 0 && !isSearching && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Found {searchResults.count} result{searchResults.count !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {searchResults.beers.map((beer) => (
                      <Card key={beer.bid} className="cursor-pointer hover:bg-accent transition-colors" onClick={() => handleSelectBeer(beer)}>
                        <CardContent className="p-4 flex gap-4">
                          <img
                            src={beer.beer_label}
                            alt={beer.beer_name}
                            className="w-16 h-16 rounded object-cover"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold truncate">{beer.beer_name}</h4>
                            <p className="text-sm text-muted-foreground truncate">{beer.brewery?.brewery_name || 'Unknown Brewery'}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="secondary">{beer.beer_style}</Badge>
                              <Badge variant="outline">{beer.beer_abv}% ABV</Badge>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground self-center" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {searchResults && searchResults.count === 0 && !isSearching && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No beers found. Try a different search.</p>
                </div>
              )}

              {!searchQuery && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Start typing to search for beers on Untappd</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP 2: REVIEW */}
        {step === 'review' && currentBeer && (
          <>
            <DialogHeader>
              <DialogTitle>Review & Configure Beer</DialogTitle>
              <DialogDescription>
                Add package details and pricing for this beer
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Beer details */}
              <div className="flex gap-4">
                <img
                  src={currentBeer.beer_label}
                  alt={currentBeer.beer_name}
                  className="w-24 h-24 rounded object-cover"
                />
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
                  <Select
                    value={currentBeer.packageType}
                    onValueChange={(value) => handlePackageTypeChange(value as any)}
                  >
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
                    onChange={(e) => handleUpdateBeer({ packageSizeLitres: parseFloat(e.target.value) || 0 })}
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
                    onChange={(e) => handleUpdateBeer({ unitPriceExVat: parseFloat(e.target.value) || 0 })}
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
              <Button
                variant="ghost"
                onClick={() => setStep('search')}
                className="sm:mr-auto"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Search
              </Button>
              <Button variant="outline" onClick={handleSkipCurrent}>
                Skip This Beer
              </Button>
              <Button
                onClick={handleImportCurrent}
                disabled={importBeer.isPending || currentBeer.packageSizeLitres <= 0}
              >
                {importBeer.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import Beer
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 3: COMPLETE */}
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
                  The beer has been successfully imported to your products.
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
                Import Another Beer
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
