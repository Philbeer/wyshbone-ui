/**
 * Untappd Integration React Query Hooks
 *
 * Provides hooks for searching beers on Untappd and importing them
 * as products into the brewery CRM.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/contexts/UserContext';

// ============================================
// TYPES
// ============================================

export interface UntappdBeer {
  bid: number;
  beer_name: string;
  beer_label: string;
  beer_style: string;
  beer_abv: number;
  beer_ibu: number;
  beer_description: string;
  beer_slug: string;
  brewery: {
    brewery_id: number;
    brewery_name: string;
    brewery_label: string;
    brewery_slug: string;
  };
}

export interface UntappdBrewery {
  brewery_id: number;
  brewery_name: string;
  brewery_slug: string;
  brewery_label: string;
  country_name: string;
  contact?: {
    twitter?: string;
    facebook?: string;
    url?: string;
  };
  location?: {
    brewery_city?: string;
    brewery_state?: string;
  };
  brewery_type?: string;
  beer_count?: number;
}

export interface UntappdSearchResult {
  count: number;
  beers: UntappdBeer[];
}

export interface UntappdBrewerySearchResult {
  count: number;
  breweries: UntappdBrewery[];
}

export interface UntappdBreweryBeersResult {
  brewery: {
    brewery_id: number;
    brewery_name: string;
    brewery_label: string;
    beer_count: number;
  };
  count: number;
  beers: UntappdBeer[];
}

export interface ImportBeerRequest {
  bid: number;
  packageType: 'cask' | 'keg' | 'can' | 'bottle';
  packageSizeLitres: number;
  unitPriceExVat?: number;
}

export interface ImportBeerResponse {
  success: boolean;
  product: {
    id: string;
    name: string;
    brewery: string;
    style: string;
    abv: number;
    sku: string;
    packageType: string;
    packageSizeLitres: number;
  };
}

// ============================================
// SEARCH BEERS
// ============================================

export function useSearchBeers(query: string, options?: { enabled?: boolean }) {
  return useQuery<UntappdSearchResult>({
    queryKey: ['untappd-search', query],
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return { count: 0, beers: [] };
      }

      const response = await apiRequest('GET', `/api/untappd/search?q=${encodeURIComponent(query)}&limit=25`);
      return response.json();
    },
    enabled: options?.enabled !== false && query.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================
// SEARCH BREWERIES
// ============================================

export function useSearchBreweries(query: string, options?: { enabled?: boolean }) {
  return useQuery<UntappdBrewerySearchResult>({
    queryKey: ['untappd-search-brewery', query],
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return { count: 0, breweries: [] };
      }

      const response = await apiRequest('GET', `/api/untappd/search/brewery?q=${encodeURIComponent(query)}`);
      return response.json();
    },
    enabled: options?.enabled !== false && query.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================
// GET BREWERY BEERS
// ============================================

export function useBreweryBeers(breweryId: number | null, options?: { enabled?: boolean }) {
  return useQuery<UntappdBreweryBeersResult>({
    queryKey: ['untappd-brewery-beers', breweryId],
    queryFn: async () => {
      if (!breweryId) {
        throw new Error('Brewery ID is required');
      }

      const response = await apiRequest('GET', `/api/untappd/brewery/${breweryId}/beers?limit=50`);
      return response.json();
    },
    enabled: options?.enabled !== false && !!breweryId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// ============================================
// GET BEER DETAILS
// ============================================

export function useBeerDetails(bid: number | null) {
  return useQuery<{ beer: UntappdBeer }>({
    queryKey: ['untappd-beer', bid],
    queryFn: async () => {
      if (!bid) {
        throw new Error('Beer ID is required');
      }

      const response = await apiRequest('GET', `/api/untappd/beer/${bid}`);
      return response.json();
    },
    enabled: !!bid,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// ============================================
// IMPORT BEER AS PRODUCT
// ============================================

export function useImportBeer() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation<ImportBeerResponse, Error, ImportBeerRequest>({
    mutationFn: async (request) => {
      const response = await apiRequest('POST', '/api/untappd/import', request);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import beer');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate brew products query to refresh the list
      qc.invalidateQueries({ queryKey: ['brew-products'] });

      toast({
        title: 'Beer Imported!',
        description: `${data.product.name} has been added to your products.`,
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import beer from Untappd.',
        variant: 'destructive',
      });
    },
  });
}

// ============================================
// BULK IMPORT BEERS
// ============================================

export interface BulkImportRequest {
  beers: Array<{
    bid: number;
    packageType: 'cask' | 'keg' | 'can' | 'bottle';
    packageSizeLitres: number;
    unitPriceExVat?: number;
  }>;
}

export interface BulkImportResponse {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{
    bid: number;
    beerName: string;
    error: string;
  }>;
}

export function useBulkImportBeers() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation<BulkImportResponse, Error, BulkImportRequest>({
    mutationFn: async (request) => {
      const results = {
        success: true,
        imported: 0,
        failed: 0,
        errors: [] as Array<{ bid: number; beerName: string; error: string }>,
      };

      // Import beers one by one
      for (const beer of request.beers) {
        try {
          const response = await apiRequest('POST', '/api/untappd/import', beer);

          if (!response.ok) {
            const error = await response.json();
            results.failed++;
            results.errors.push({
              bid: beer.bid,
              beerName: 'Unknown',
              error: error.message || 'Failed to import',
            });
          } else {
            results.imported++;
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            bid: beer.bid,
            beerName: 'Unknown',
            error: error.message || 'Network error',
          });
        }
      }

      return results;
    },
    onSuccess: (data) => {
      // Invalidate brew products query to refresh the list
      qc.invalidateQueries({ queryKey: ['brew-products'] });

      toast({
        title: 'Bulk Import Complete',
        description: `Successfully imported ${data.imported} beers${
          data.failed > 0 ? `, ${data.failed} failed` : ''
        }.`,
        variant: data.failed === 0 ? 'default' : 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Bulk Import Failed',
        description: error.message || 'Failed to import beers from Untappd.',
        variant: 'destructive',
      });
    },
  });
}
