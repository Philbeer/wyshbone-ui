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
