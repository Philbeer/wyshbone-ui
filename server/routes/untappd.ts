import { Router, type Request, type Response } from "express";
import type { IStorage } from "../storage";
import { generateId } from "../auth";
import { abvPercentToBasisPoints, calculateDutyRate } from "../../client/src/utils/dutyCalculations";

// Untappd API configuration
const UNTAPPD_CLIENT_ID = process.env.UNTAPPD_CLIENT_ID;
const UNTAPPD_CLIENT_SECRET = process.env.UNTAPPD_CLIENT_SECRET;
const UNTAPPD_API_BASE = "https://api.untappd.com/v4";

if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
  console.warn("⚠️ WARNING: Untappd API credentials not configured. Set UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET");
}

// SECURITY: Authentication middleware
async function getAuthenticatedUserId(req: Request, storage: IStorage): Promise<{ userId: string; userEmail: string; workspaceId: string } | null> {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    return null;
  }

  try {
    const session = await storage.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      userId: session.userId,
      userEmail: session.userEmail,
      workspaceId: session.userId // Using userId as workspaceId for now
    };
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// Untappd API types
interface UntappdBeer {
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

interface UntappdBrewery {
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

interface UntappdSearchResponse {
  meta: {
    code: number;
    error_detail?: string;
    error_type?: string;
  };
  response: {
    message?: string;
    beers?: {
      count: number;
      items: Array<{ beer: UntappdBeer }>;
    };
    brewery?: {
      count: number;
      items: Array<{ brewery: UntappdBrewery }>;
    };
  };
}

export function createUntappdRouter(storage: IStorage): Router {
  const router = Router();

  /**
   * GET /api/untappd/search
   * Search for beers on Untappd
   *
   * Query params:
   * - q: Search query (beer name, brewery, style, etc.)
   * - limit: Number of results to return (default: 25, max: 50)
   */
  router.get("/search", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    try {
      // Call Untappd API
      const url = new URL(`${UNTAPPD_API_BASE}/search/beer`);
      url.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      url.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", limit.toString());

      const response = await fetch(url.toString());
      const data = await response.json() as UntappdSearchResponse;

      if (data.meta.code !== 200) {
        console.error("Untappd API error:", data.meta.error_detail);
        return res.status(data.meta.code === 500 ? 503 : data.meta.code).json({
          error: data.meta.error_type || "Untappd API error",
          message: data.meta.error_detail || "Failed to search beers"
        });
      }

      // Return the beer results
      return res.json({
        count: data.response.beers?.count || 0,
        beers: data.response.beers?.items.map(item => item.beer) || []
      });
    } catch (error: any) {
      console.error("Untappd search error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to search Untappd"
      });
    }
  });

  /**
   * GET /api/untappd/search/brewery
   * Search for breweries on Untappd
   *
   * Query params:
   * - q: Search query (brewery name)
   * - limit: Number of results to return (default: 25, max: 50)
   */
  router.get("/search/brewery", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    try {
      // Call Untappd API
      const url = new URL(`${UNTAPPD_API_BASE}/search/brewery`);
      url.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      url.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);
      url.searchParams.set("q", query);

      const response = await fetch(url.toString());
      const data = await response.json() as UntappdSearchResponse;

      if (data.meta.code !== 200) {
        console.error("Untappd API error:", data.meta.error_detail);
        return res.status(data.meta.code === 500 ? 503 : data.meta.code).json({
          error: data.meta.error_type || "Untappd API error",
          message: data.meta.error_detail || "Failed to search breweries"
        });
      }

      // Return the brewery results
      return res.json({
        count: data.response.brewery?.count || 0,
        breweries: data.response.brewery?.items.map(item => item.brewery) || []
      });
    } catch (error: any) {
      console.error("Untappd brewery search error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to search breweries on Untappd"
      });
    }
  });

  /**
   * GET /api/untappd/brewery/:brewery_id/beers
   * Get all beers from a specific brewery
   *
   * Query params:
   * - limit: Number of results to return (default: 50, max: 50)
   * - offset: Offset for pagination (default: 0)
   */
  router.get("/brewery/:brewery_id/beers", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const breweryId = req.params.brewery_id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      // Call Untappd API
      // Note: The brewery/info endpoint doesn't officially support pagination, but we'll try anyway
      const url = new URL(`${UNTAPPD_API_BASE}/brewery/info/${breweryId}`);
      url.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      url.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);
      // Try to request more beers (max documented limit is 50 for other endpoints)
      url.searchParams.set("limit", "50");
      if (offset > 0) {
        url.searchParams.set("offset", offset.toString());
      }

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.meta.code !== 200) {
        console.error("Untappd API error:", data.meta.error_detail);
        return res.status(data.meta.code === 500 ? 503 : data.meta.code).json({
          error: data.meta.error_type || "Untappd API error",
          message: data.meta.error_detail || "Failed to fetch brewery beers"
        });
      }

      // Extract beers from the brewery info response
      const brewery = data.response.brewery;
      const rawBeers = brewery.beer_list?.items?.map((item: any) => item.beer) || [];

      // Add brewery info to each beer since Untappd's brewery endpoint doesn't include it
      const beers = rawBeers.map((beer: any) => ({
        ...beer,
        brewery: {
          brewery_id: brewery.brewery_id,
          brewery_name: brewery.brewery_name,
          brewery_label: brewery.brewery_label,
          brewery_slug: brewery.brewery_slug || '',
        }
      }));

      return res.json({
        brewery: {
          brewery_id: brewery.brewery_id,
          brewery_name: brewery.brewery_name,
          brewery_label: brewery.brewery_label,
          beer_count: brewery.beer_count,
        },
        count: beers.length,
        beers: beers.slice(offset, offset + limit)
      });
    } catch (error: any) {
      console.error("Untappd brewery beers error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to fetch brewery beers from Untappd"
      });
    }
  });

  /**
   * POST /api/untappd/import
   * Import a beer from Untappd as a brew product
   *
   * Body:
   * - bid: Untappd beer ID
   * - packageType: Default package type ('cask', 'keg', 'can', 'bottle')
   * - packageSizeLitres: Default package size in litres (will be converted to millilitres)
   * - unitPriceExVat: Optional default unit price in pounds (will be converted to pence)
   */
  router.post("/import", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const { bid, packageType, packageSizeLitres, unitPriceExVat } = req.body;

    // Validate input
    if (!bid) {
      return res.status(400).json({ error: "Beer ID (bid) is required" });
    }
    if (!packageType || !['cask', 'keg', 'can', 'bottle'].includes(packageType)) {
      return res.status(400).json({ error: "Valid packageType is required (cask, keg, can, bottle)" });
    }
    if (!packageSizeLitres || packageSizeLitres <= 0) {
      return res.status(400).json({ error: "packageSizeLitres must be > 0" });
    }

    try {
      // Fetch beer details from Untappd
      const url = new URL(`${UNTAPPD_API_BASE}/beer/info/${bid}`);
      url.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      url.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);

      const response = await fetch(url.toString());
      const data = await response.json() as UntappdSearchResponse;

      if (data.meta.code !== 200) {
        console.error("Untappd API error:", data.meta.error_detail);
        return res.status(data.meta.code === 500 ? 503 : data.meta.code).json({
          error: data.meta.error_type || "Untappd API error",
          message: data.meta.error_detail || "Failed to fetch beer details"
        });
      }

      const beer = (data.response as any).beer as UntappdBeer;

      // Calculate duty band based on ABV
      const abvBasisPoints = abvPercentToBasisPoints(beer.beer_abv);
      const { dutyBand } = calculateDutyRate(beer.beer_abv);

      // Convert package size to millilitres
      const packageSizeMl = Math.round(packageSizeLitres * 1000);

      // Convert price to pence if provided
      const priceInPence = unitPriceExVat ? Math.round(unitPriceExVat * 100) : 0;

      // Generate SKU from beer name and brewery
      const sku = `${beer.brewery.brewery_slug}-${beer.beer_slug}`.toUpperCase().substring(0, 50);

      // Create brew product
      const productId = generateId();
      const now = Date.now();

      await storage.createBrewProduct({
        id: productId,
        workspaceId: auth.workspaceId,
        name: beer.beer_name,
        style: beer.beer_style,
        imageUrl: beer.beer_label, // Save Untappd beer label image URL
        sku: sku,
        abv: abvBasisPoints,
        defaultPackageType: packageType,
        defaultPackageSizeLitres: packageSizeMl,
        dutyBand: dutyBand,
        defaultUnitPriceExVat: priceInPence,
        defaultVatRate: 2000, // 20% VAT
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`✅ Imported beer from Untappd: ${beer.beer_name} (${beer.brewery.brewery_name})`);

      return res.status(201).json({
        success: true,
        product: {
          id: productId,
          name: beer.beer_name,
          brewery: beer.brewery.brewery_name,
          style: beer.beer_style,
          abv: beer.beer_abv,
          sku: sku,
          packageType: packageType,
          packageSizeLitres: packageSizeLitres,
        }
      });
    } catch (error: any) {
      console.error("Untappd import error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to import beer from Untappd"
      });
    }
  });

  /**
   * GET /api/untappd/brewery/:brewery_id/all-beers
   * Get ALL beers from a brewery using hybrid approach:
   * 1. Fetch first 25 beers from brewery/info (1 API call)
   * 2. If brewery has >25 beers, fetch check-ins to find remaining beers
   * 3. Stop when we have all unique beers (based on brewery.beer_count)
   *
   * This minimizes API calls while ensuring complete beer list.
   */
  router.get("/brewery/:brewery_id/all-beers", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const breweryId = req.params.brewery_id;

    try {
      // STEP 1: Fetch initial 25 beers from brewery/info
      const infoUrl = new URL(`${UNTAPPD_API_BASE}/brewery/info/${breweryId}`);
      infoUrl.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      infoUrl.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);

      const infoResponse = await fetch(infoUrl.toString());
      const infoData = await infoResponse.json() as any;

      if (infoData.meta.code !== 200) {
        console.error("Untappd API error:", infoData.meta.error_detail);
        return res.status(infoData.meta.code === 500 ? 503 : infoData.meta.code).json({
          error: infoData.meta.error_type || "Untappd API error",
          message: infoData.meta.error_detail || "Failed to fetch brewery info"
        });
      }

      const brewery = infoData.response.brewery;
      const totalBeerCount = brewery.beer_count || 0;
      const initialBeers = brewery.beer_list?.items?.map((item: any) => item.beer) || [];

      // Add brewery info to each beer
      const beersWithBreweryInfo = initialBeers.map((beer: any) => ({
        ...beer,
        brewery: {
          brewery_id: brewery.brewery_id,
          brewery_name: brewery.brewery_name,
          brewery_label: brewery.brewery_label,
          brewery_slug: brewery.brewery_slug || '',
        }
      }));

      // Track unique beer IDs using a Set
      const uniqueBeerIds = new Set<number>(beersWithBreweryInfo.map((b: any) => b.bid));
      const allBeers = [...beersWithBreweryInfo];

      // Track serving styles per beer (bid -> serving types)
      const servingStylesMap = new Map<number, Set<string>>();

      console.log(`✅ Fetched ${beersWithBreweryInfo.length} beers from brewery/info. Brewery has ${totalBeerCount} total beers.`);

      // STEP 2: Fetch check-ins to get serving style data
      // We always fetch at least a few check-ins to gather serving style information
      const needsMoreBeers = totalBeerCount > 25 && uniqueBeerIds.size < totalBeerCount;
      const maxCheckInPages = needsMoreBeers ? 20 : 3; // If we have all beers, just fetch 3 pages for serving styles

      console.log(`🔍 Fetching check-ins for serving style data${needsMoreBeers ? ' and additional beers' : ''}...`);

      let maxId: string | undefined = undefined;
      let checkInPages = 0;

      // Loop through check-ins:
      // - If brewery has >25 beers: fetch until we have all beers (up to maxCheckInPages)
      // - If brewery has ≤25 beers: fetch 3 pages for serving style data
      while (checkInPages < maxCheckInPages) {
        // Stop early if we have all beers and collected serving styles from at least 3 pages
        if (!needsMoreBeers && checkInPages >= 3) {
          console.log(`📊 Collected serving style data from ${checkInPages} check-in pages`);
          break;
        }

        // Stop if we're fetching more beers and we've found them all
        if (needsMoreBeers && uniqueBeerIds.size >= totalBeerCount) {
          console.log(`✅ Found all ${totalBeerCount} beers!`);
          break;
        }
        const checkInsUrl = new URL(`${UNTAPPD_API_BASE}/brewery/checkins/${breweryId}`);
        checkInsUrl.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
        checkInsUrl.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);
        checkInsUrl.searchParams.set("limit", "25");
        if (maxId) {
          checkInsUrl.searchParams.set("max_id", maxId);
        }

        const checkInsResponse = await fetch(checkInsUrl.toString());
        const checkInsData = await checkInsResponse.json() as any;

        if (checkInsData.meta.code !== 200) {
          console.error("Untappd check-ins API error:", checkInsData.meta.error_detail);
          break; // Return what we have so far
        }

        const checkins = checkInsData.response?.checkins?.items || [];
        if (checkins.length === 0) {
          console.log("📭 No more check-ins available");
          break;
        }

        // Extract beers from check-ins
        for (const checkin of checkins) {
          const beer = checkin.beer;

          // Debug: Log ENTIRE first checkin to see all available fields
          if (checkInPages === 0 && checkins.indexOf(checkin) === 0) {
            console.log('🔍 FULL FIRST CHECKIN:', JSON.stringify(checkin, null, 2));
          }

          const servingType = checkin.serving_type;

          if (beer && beer.bid) {
            // Track serving style if available
            if (servingType && servingType.trim().length > 0) {
              if (!servingStylesMap.has(beer.bid)) {
                servingStylesMap.set(beer.bid, new Set());
              }
              servingStylesMap.get(beer.bid)!.add(servingType);
            }

            // Add beer if not already added
            if (!uniqueBeerIds.has(beer.bid)) {
              uniqueBeerIds.add(beer.bid);
              allBeers.push({
                ...beer,
                brewery: {
                  brewery_id: brewery.brewery_id,
                  brewery_name: brewery.brewery_name,
                  brewery_label: brewery.brewery_label,
                  brewery_slug: brewery.brewery_slug || '',
                }
              });
            }
          }
        }

        // Update pagination cursor
        maxId = checkins[checkins.length - 1]?.checkin_id;
        checkInPages++;

        console.log(`📄 Check-in page ${checkInPages}: Found ${uniqueBeerIds.size}/${totalBeerCount} unique beers`);
      }

      console.log(`✅ Hybrid fetch complete: ${uniqueBeerIds.size} unique beers from ${1 + checkInPages} API calls`);

      // Attach serving styles to each beer
      const beersWithServingStyles = allBeers.map(beer => {
        const servingStyles = servingStylesMap.get(beer.bid);
        return {
          ...beer,
          serving_styles: servingStyles ? Array.from(servingStyles) : [],
          serving_styles_count: servingStyles ? servingStyles.size : 0
        };
      });

      console.log(`📊 Serving style data: ${servingStylesMap.size} beers have serving style information`);

      return res.json({
        brewery: {
          brewery_id: brewery.brewery_id,
          brewery_name: brewery.brewery_name,
          brewery_label: brewery.brewery_label,
          beer_count: totalBeerCount,
        },
        count: beersWithServingStyles.length,
        total: totalBeerCount,
        beers: beersWithServingStyles,
        source: checkInPages > 0 ? "hybrid_with_checkins" : "brewery_info_only",
        checkin_pages_fetched: checkInPages,
        api_calls_used: 1 + checkInPages
      });

    } catch (error: any) {
      console.error("Untappd all-beers error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to fetch all beers from Untappd"
      });
    }
  });

  /**
   * GET /api/untappd/beer/:bid
   * Get detailed information about a specific beer
   */
  router.get("/beer/:bid", async (req: Request, res: Response) => {
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!UNTAPPD_CLIENT_ID || !UNTAPPD_CLIENT_SECRET) {
      return res.status(501).json({
        error: "Untappd not configured",
        message: "UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET must be set"
      });
    }

    const bid = req.params.bid;

    try {
      const url = new URL(`${UNTAPPD_API_BASE}/beer/info/${bid}`);
      url.searchParams.set("client_id", UNTAPPD_CLIENT_ID);
      url.searchParams.set("client_secret", UNTAPPD_CLIENT_SECRET);

      const response = await fetch(url.toString());
      const data = await response.json() as UntappdSearchResponse;

      if (data.meta.code !== 200) {
        console.error("Untappd API error:", data.meta.error_detail);
        return res.status(data.meta.code === 500 ? 503 : data.meta.code).json({
          error: data.meta.error_type || "Untappd API error",
          message: data.meta.error_detail || "Failed to fetch beer details"
        });
      }

      return res.json({
        beer: (data.response as any).beer
      });
    } catch (error: any) {
      console.error("Untappd beer details error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to fetch beer details from Untappd"
      });
    }
  });

  return router;
}
