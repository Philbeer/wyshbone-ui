import { Router } from "express";
import { storage } from "../storage";

export const driverRoutes = Router();

async function getAuthenticatedUserId(req: any): Promise<{ userId: string } | null> {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    try {
      const session = await storage.getSession(sessionId);
      if (session) {
        return { userId: session.userId };
      }
    } catch (error) {
      console.error("Session lookup error:", error);
    }
  }
  const userId = req.query.user_id || req.query.userId;
  if (userId) {
    return { userId: userId as string };
  }
  return null;
}

async function isDriverOrAdmin(userId: string): Promise<boolean> {
  const user = await storage.getUserById(userId);
  if (!user) return false;
  return user.role === "driver" || user.role === "admin";
}

function getTodayBoundaries(): { start: number; end: number } {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start: startOfDay.getTime(), end: endOfDay.getTime() };
}

driverRoutes.get("/check-role", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await storage.getUserById(auth.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isDriver = user.role === "driver" || user.role === "admin";
    res.json({ 
      isDriver, 
      role: user.role,
      canAccessDriverUI: isDriver 
    });
  } catch (error: any) {
    console.error("Error checking driver role:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.get("/today", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const allRoutes = await storage.listDeliveryRoutesForDriver(auth.userId);
    const { start, end } = getTodayBoundaries();
    
    const todayRoutes = allRoutes.filter(route => {
      const deliveryDate = route.deliveryDate;
      return deliveryDate >= start && deliveryDate <= end;
    });

    const routesWithStops = [];
    for (const route of todayRoutes) {
      const stops = await storage.listRouteStops(route.id);
      const sortedStops = stops.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      routesWithStops.push({
        ...route,
        stops: sortedStops,
      });
    }

    res.json({ routes: routesWithStops });
  } catch (error: any) {
    console.error("Error getting driver today routes:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.get("/stop/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const { id } = req.params;
    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.driverId !== auth.userId) {
      return res.status(403).json({ error: "Not your assigned route" });
    }

    let items: any[] = [];
    if (stop.orderId) {
      try {
        items = await storage.listCrmOrderLinesByOrder(stop.orderId);
      } catch (e) {
        console.error("Failed to fetch order lines:", e);
      }
    }

    res.json({
      stop,
      route: {
        id: route.id,
        name: route.name,
        deliveryDate: route.deliveryDate,
        status: route.status,
      },
      items,
    });
  } catch (error: any) {
    console.error("Error getting stop detail:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.put("/stop/:id/arrive", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const { id } = req.params;
    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.driverId !== auth.userId) {
      return res.status(403).json({ error: "Not your assigned route" });
    }

    const updatedStop = await storage.updateRouteStop(id, {
      status: "arrived",
      actualArrivalTime: Date.now(),
    });

    res.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    console.error("Error marking stop as arrived:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.put("/stop/:id/deliver", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const { id } = req.params;
    const { recipientName, deliveryNotes, deliveryPhotoUrl, signatureUrl } = req.body;

    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.driverId !== auth.userId) {
      return res.status(403).json({ error: "Not your assigned route" });
    }

    const now = Date.now();
    const updatedStop = await storage.updateRouteStop(id, {
      status: "delivered",
      deliveredAt: now,
      actualArrivalTime: stop.actualArrivalTime || now,
      recipientName: recipientName || null,
      deliveryNotes: deliveryNotes || null,
      deliveryPhotoUrl: deliveryPhotoUrl || null,
      signatureUrl: signatureUrl || null,
    });

    const allStops = await storage.listRouteStops(stop.routeId);
    const completedCount = allStops.filter(s => s.status === "delivered").length;
    await storage.updateDeliveryRoute(stop.routeId, {
      completedStops: completedCount,
    });

    if (completedCount === allStops.length) {
      await storage.updateDeliveryRoute(stop.routeId, {
        status: "completed",
        actualEndTime: now,
      });
    }

    res.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    console.error("Error marking stop as delivered:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.put("/stop/:id/fail", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const { id } = req.params;
    const { failureReason, failureNotes, deliveryPhotoUrl } = req.body;

    if (!failureReason) {
      return res.status(400).json({ error: "failureReason is required" });
    }
    if (!failureNotes) {
      return res.status(400).json({ error: "failureNotes is required" });
    }

    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.driverId !== auth.userId) {
      return res.status(403).json({ error: "Not your assigned route" });
    }

    const updatedStop = await storage.updateRouteStop(id, {
      status: "failed",
      failureReason,
      failureNotes,
      deliveryPhotoUrl: deliveryPhotoUrl || null,
    });

    res.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    console.error("Error marking stop as failed:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.put("/stop/:id/skip", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    if (!driverCheck) {
      return res.status(403).json({ error: "Not authorized as driver" });
    }

    const { id } = req.params;
    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.driverId !== auth.userId) {
      return res.status(403).json({ error: "Not your assigned route" });
    }

    const updatedStop = await storage.updateRouteStop(id, {
      status: "skipped",
    });

    res.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    console.error("Error marking stop as skipped:", error);
    res.status(500).json({ error: error.message });
  }
});

driverRoutes.get("/check-role", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const driverCheck = await isDriverOrAdmin(auth.userId);
    res.json({ isDriver: driverCheck });
  } catch (error: any) {
    console.error("Error checking driver role:", error);
    res.status(500).json({ error: error.message });
  }
});
