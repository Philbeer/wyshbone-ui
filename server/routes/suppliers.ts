/**
 * Suppliers API Routes
 * Handles CRUD operations for supplier management
 */
import { Router, type Request, type Response } from "express";
import type { IStorage } from "../storage";
import { getDrizzleDb } from "../storage";
import { suppliers, supplierPurchases, supplierProducts } from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export function createSuppliersRouter(storage: IStorage) {
  const router = Router();
  const db = getDrizzleDb();

  /**
   * Helper to get authenticated user from request
   */
  async function getAuthenticatedUser(req: Request): Promise<{ userId: string; workspaceId: string } | null> {
    // Development mode: allow URL params for testing
    const urlUserId = (req.query.userId || req.query.user_id) as string | undefined;
    if (process.env.NODE_ENV === 'development' && urlUserId) {
      return { userId: urlUserId, workspaceId: urlUserId };
    }

    // Check session header
    const sessionId = req.headers['x-session-id'] as string | undefined;
    if (sessionId) {
      const session = await storage.getSession(sessionId);
      if (session) {
        const user = await storage.getUserById(session.userId);
        if (user) {
          return { userId: user.id, workspaceId: user.id };
        }
      }
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await storage.getUserByApiKey(token);
      if (user) {
        return { userId: user.id, workspaceId: user.id };
      }
    }

    return null;
  }

  // ============================================
  // GET /api/suppliers - List suppliers
  // ============================================
  router.get("/", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { isOurSupplier, supplierType } = req.query;

      // Build filters
      const filters: any[] = [eq(suppliers.workspaceId, auth.workspaceId)];
      
      if (isOurSupplier === 'true') {
        filters.push(eq(suppliers.isOurSupplier, 1));
      } else if (isOurSupplier === 'false') {
        filters.push(eq(suppliers.isOurSupplier, 0));
      }

      if (supplierType && typeof supplierType === 'string') {
        filters.push(eq(suppliers.supplierType, supplierType));
      }

      // Query with filters
      const results = await db
        .select()
        .from(suppliers)
        .where(and(...filters))
        .orderBy(desc(suppliers.lastPurchaseDate), asc(suppliers.name));

      res.json(results);
    } catch (error: any) {
      console.error("[suppliers] List error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // GET /api/suppliers/:id - Get single supplier
  // ============================================
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;

      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, id),
          eq(suppliers.workspaceId, auth.workspaceId)
        ))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      res.json(supplier);
    } catch (error: any) {
      console.error("[suppliers] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // POST /api/suppliers - Create supplier
  // ============================================
  router.post("/", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, ...data } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const now = Date.now();
      const supplierId = `supp_${now}_${Math.random().toString(36).slice(2, 8)}`;

      const [newSupplier] = await db.insert(suppliers).values({
        id: supplierId,
        workspaceId: auth.workspaceId,
        name,
        isOurSupplier: 1,
        discoveredBy: 'manual',
        discoveredAt: now,
        createdAt: now,
        updatedAt: now,
        ...data,
      }).returning();

      res.status(201).json(newSupplier);
    } catch (error: any) {
      console.error("[suppliers] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PATCH /api/suppliers/:id - Update supplier
  // ============================================
  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const updates = req.body;

      // Verify supplier exists and belongs to workspace
      const [existing] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.id, id),
          eq(suppliers.workspaceId, auth.workspaceId)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      const [updated] = await db
        .update(suppliers)
        .set({
          ...updates,
          updatedAt: Date.now(),
        })
        .where(eq(suppliers.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[suppliers] Update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // DELETE /api/suppliers/:id - Delete supplier
  // ============================================
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;

      // Verify supplier exists and belongs to workspace
      const [existing] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.id, id),
          eq(suppliers.workspaceId, auth.workspaceId)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Delete related purchases first
      await db
        .delete(supplierPurchases)
        .where(eq(supplierPurchases.supplierId, id));

      // Delete related products
      await db
        .delete(supplierProducts)
        .where(eq(supplierProducts.supplierId, id));

      // Delete supplier
      await db
        .delete(suppliers)
        .where(eq(suppliers.id, id));

      res.json({ success: true, message: "Supplier deleted" });
    } catch (error: any) {
      console.error("[suppliers] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // GET /api/suppliers/:id/purchases - Get supplier purchases
  // ============================================
  router.get("/:id/purchases", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;

      // Verify supplier exists and belongs to workspace
      const [supplier] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.id, id),
          eq(suppliers.workspaceId, auth.workspaceId)
        ))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Get purchases
      const purchases = await db
        .select()
        .from(supplierPurchases)
        .where(eq(supplierPurchases.supplierId, id))
        .orderBy(desc(supplierPurchases.purchaseDate));

      res.json(purchases);
    } catch (error: any) {
      console.error("[suppliers] Get purchases error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // GET /api/suppliers/:id/products - Get supplier products
  // ============================================
  router.get("/:id/products", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;

      // Verify supplier exists and belongs to workspace
      const [supplier] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(
          eq(suppliers.id, id),
          eq(suppliers.workspaceId, auth.workspaceId)
        ))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Get products
      const products = await db
        .select()
        .from(supplierProducts)
        .where(eq(supplierProducts.supplierId, id))
        .orderBy(asc(supplierProducts.productName));

      res.json(products);
    } catch (error: any) {
      console.error("[suppliers] Get products error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

