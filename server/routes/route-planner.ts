// Route Planner API Endpoints
import { Router } from "express";
import { storage } from "../storage";
import { routeOptimizationService } from "../services/RouteOptimizationService";
import type { RouteStop } from "../services/RouteOptimizationService";
import { randomUUID } from "crypto";

export const routePlannerRoutes = Router();

/**
 * Helper to get authenticated user ID from session
 */
async function getAuthenticatedUserId(req: any): Promise<{ userId: string } | null> {
  // 1. Try session-based auth first
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

  // 2. Fallback for dev mode - check URL params (same pattern as main routes.ts)
  const userId = req.query.user_id || req.query.userId;
  if (userId) {
    console.log(`[route-planner] Using user_id from URL params: ${userId}`);
    return { userId: userId as string };
  }

  return null;
}

// ============================================
// DELIVERY BASES ENDPOINTS
// ============================================

/**
 * GET /api/delivery-bases
 * List all delivery bases for a workspace
 */
routePlannerRoutes.get("/delivery-bases", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bases = await storage.listDeliveryBases(auth.userId);
    res.json({ bases });
  } catch (error: any) {
    console.error("Error listing delivery bases:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/delivery-bases/default
 * Get the default delivery base for a workspace
 */
routePlannerRoutes.get("/delivery-bases/default", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const base = await storage.getDefaultDeliveryBase(auth.userId);
    res.json({ base });
  } catch (error: any) {
    console.error("Error getting default delivery base:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/delivery-bases/:id
 * Get a single delivery base
 */
routePlannerRoutes.get("/delivery-bases/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const base = await storage.getDeliveryBase(parseInt(id));

    if (!base) {
      return res.status(404).json({ error: "Delivery base not found" });
    }

    if (base.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json({ base });
  } catch (error: any) {
    console.error("Error getting delivery base:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/delivery-bases
 * Create a new delivery base
 */
routePlannerRoutes.post("/delivery-bases", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, address, addressLine1, addressLine2, city, postcode, country, latitude, longitude, isDefault, notes } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: "Name and address are required" });
    }

    const base = await storage.insertDeliveryBase({
      workspaceId: auth.userId,
      name,
      address,
      addressLine1,
      addressLine2,
      city,
      postcode,
      country: country || "United Kingdom",
      latitude,
      longitude,
      isDefault: isDefault || false,
      notes,
    });

    res.json({ success: true, base });
  } catch (error: any) {
    console.error("Error creating delivery base:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/delivery-bases/:id
 * Update a delivery base
 */
routePlannerRoutes.put("/delivery-bases/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const existing = await storage.getDeliveryBase(parseInt(id));

    if (!existing) {
      return res.status(404).json({ error: "Delivery base not found" });
    }

    if (existing.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, address, addressLine1, addressLine2, city, postcode, country, latitude, longitude, isDefault, notes } = req.body;

    const base = await storage.updateDeliveryBase(parseInt(id), {
      name,
      address,
      addressLine1,
      addressLine2,
      city,
      postcode,
      country,
      latitude,
      longitude,
      isDefault,
      notes,
    });

    res.json({ success: true, base });
  } catch (error: any) {
    console.error("Error updating delivery base:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/delivery-bases/:id
 * Delete (deactivate) a delivery base
 */
routePlannerRoutes.delete("/delivery-bases/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const existing = await storage.getDeliveryBase(parseInt(id));

    if (!existing) {
      return res.status(404).json({ error: "Delivery base not found" });
    }

    if (existing.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await storage.deleteDeliveryBase(parseInt(id));
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting delivery base:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELIVERY ROUTES ENDPOINTS
// ============================================

/**
 * GET /api/routes/:workspaceId
 * List all delivery routes for a workspace
 */
routePlannerRoutes.get("/routes/:workspaceId", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { workspaceId } = req.params;
    if (workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const routes = await storage.listDeliveryRoutes(workspaceId);
    res.json({ routes });
  } catch (error: any) {
    console.error("Error listing routes:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/routes/detail/:id
 * Get a single delivery route with all stops
 */
routePlannerRoutes.get("/routes/detail/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const route = await storage.getDeliveryRoute(id);

    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }

    if (route.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Get all stops for this route
    const stops = await storage.listRouteStops(id);

    res.json({ route, stops });
  } catch (error: any) {
    console.error("Error getting route:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/routes/create
 * Create a new delivery route from orders
 */
routePlannerRoutes.post("/routes/create", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      name,
      deliveryDate,
      orderIds,
      optimizeImmediately = false,
      startBaseId,
      endBaseId,
      startLocation,
    } = req.body;

    if (!name || !deliveryDate) {
      return res.status(400).json({ error: "Missing required fields: name, deliveryDate" });
    }

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: "Must provide at least one order" });
    }

    // Fetch base locations if provided
    let startBase = null;
    let endBase = null;
    
    if (startBaseId) {
      startBase = await storage.getDeliveryBase(startBaseId);
      if (!startBase || startBase.workspaceId !== auth.userId) {
        return res.status(400).json({ error: "Invalid start base" });
      }
    }
    
    if (endBaseId) {
      endBase = await storage.getDeliveryBase(endBaseId);
      if (!endBase || endBase.workspaceId !== auth.userId) {
        return res.status(400).json({ error: "Invalid end base" });
      }
    }

    // Fetch all orders
    const orders = [];
    for (const orderId of orderIds) {
      const order = await storage.getCrmOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: `Order ${orderId} not found` });
      }
      if (order.workspaceId !== auth.userId) {
        return res.status(403).json({ error: `Order ${orderId} not accessible` });
      }
      orders.push(order);
    }

    // Fetch customers for each order
    const stops: RouteStop[] = [];
    for (const order of orders) {
      const customer = await storage.getCrmCustomer(order.customerId);
      if (!customer) {
        console.warn(`Customer ${order.customerId} not found for order ${order.id}`);
        continue;
      }

      stops.push({
        orderId: order.id,
        customerId: customer.id,
        customerName: customer.name,
        address: {
          line1: customer.addressLine1 || "",
          line2: customer.addressLine2 || undefined,
          city: customer.city || undefined,
          postcode: customer.postcode || undefined,
          country: customer.country || "United Kingdom",
        },
        orderNumber: order.orderNumber,
        itemCount: undefined, // Could calculate from order lines
        totalValue: order.totalIncVat || undefined,
      });
    }

    if (stops.length === 0) {
      return res.status(400).json({ error: "No valid stops found from orders" });
    }

    // Create route
    const routeId = randomUUID();
    const now = Date.now();

    // Determine start/end locations from bases or provided location
    const startLocationName = startBase?.name || startLocation?.name;
    const startLatitude = startBase?.latitude || startLocation?.latitude;
    const startLongitude = startBase?.longitude || startLocation?.longitude;
    const endLocationName = endBase?.name || startBase?.name || startLocation?.name;
    const endLatitude = endBase?.latitude || startBase?.latitude || startLocation?.latitude;
    const endLongitude = endBase?.longitude || startBase?.longitude || startLocation?.longitude;

    const route = await storage.insertDeliveryRoute({
      id: routeId,
      workspaceId: auth.userId,
      name,
      deliveryDate: typeof deliveryDate === "number" ? deliveryDate : new Date(deliveryDate).getTime(),
      status: "draft",
      totalStops: stops.length,
      completedStops: 0,
      isOptimized: false,
      startBaseId: startBase?.id,
      endBaseId: endBase?.id,
      startLocationName,
      startLatitude,
      startLongitude,
      endLocationName,
      endLatitude,
      endLongitude,
      createdAt: now,
      updatedAt: now,
    });

    // Create stops (unoptimized order)
    const createdStops = [];
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const stopId = randomUUID();

      const createdStop = await storage.insertRouteStop({
        id: stopId,
        routeId: route.id,
        orderId: stop.orderId,
        customerId: stop.customerId,
        sequenceNumber: i + 1,
        originalSequenceNumber: i + 1,
        customerName: stop.customerName,
        addressLine1: stop.address.line1,
        addressLine2: stop.address.line2,
        city: stop.address.city,
        postcode: stop.address.postcode,
        country: stop.address.country,
        status: "pending",
        orderNumber: stop.orderNumber,
        itemCount: stop.itemCount,
        totalValue: stop.totalValue,
        createdAt: now,
        updatedAt: now,
      });

      createdStops.push(createdStop);
    }

    // Update orders to link to this route
    for (const order of orders) {
      await storage.updateCrmOrder(order.id, {
        deliveryRunId: routeId,
      });
    }

    let optimizationResults = null;

    // Optionally optimize immediately
    if (optimizeImmediately) {
      try {
        const optimizationResponse = await optimizeRoute(routeId, auth.userId);
        optimizationResults = optimizationResponse.optimizationResults;
      } catch (error: any) {
        console.error("Error optimizing route on creation:", error);
        // Continue without optimization
      }
    }

    res.json({
      success: true,
      route,
      stops: createdStops,
      optimizationResults,
    });
  } catch (error: any) {
    console.error("Error creating route:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/routes/:id/optimize
 * Optimize an existing route
 */
routePlannerRoutes.put("/routes/:id/optimize", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const result = await optimizeRoute(id, auth.userId);

    res.json(result);
  } catch (error: any) {
    console.error("Error optimizing route:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper function to optimize a route
 */
async function optimizeRoute(routeId: string, workspaceId: string) {
  const route = await storage.getDeliveryRoute(routeId);
  if (!route) {
    throw new Error("Route not found");
  }
  if (route.workspaceId !== workspaceId) {
    throw new Error("Forbidden");
  }

  const stops = await storage.listRouteStops(routeId);
  if (stops.length === 0) {
    throw new Error("No stops to optimize");
  }

  // Build waypoints from stops
  const waypointsInput = stops.map(stop => ({
    orderId: stop.orderId,
    customerId: stop.customerId,
    customerName: stop.customerName,
    address: {
      line1: stop.addressLine1,
      line2: stop.addressLine2 || undefined,
      city: stop.city || undefined,
      postcode: stop.postcode || undefined,
      country: stop.country || undefined,
    },
    latitude: stop.latitude || undefined,
    longitude: stop.longitude || undefined,
  }));

  // Add start base as first waypoint if available
  if (route.startLatitude && route.startLongitude) {
    waypointsInput.unshift({
      orderId: undefined,
      customerId: "START_BASE",
      customerName: route.startLocationName || "Start Base",
      address: {
        line1: route.startLocationName || "Start Base",
      },
      latitude: route.startLatitude,
      longitude: route.startLongitude,
    });
  }

  // Add end base as last waypoint if different from start
  if (route.endLatitude && route.endLongitude && 
      (route.endLatitude !== route.startLatitude || route.endLongitude !== route.startLongitude)) {
    waypointsInput.push({
      orderId: undefined,
      customerId: "END_BASE",
      customerName: route.endLocationName || "End Base",
      address: {
        line1: route.endLocationName || "End Base",
      },
      latitude: route.endLatitude,
      longitude: route.endLongitude,
    });
  } else if (route.startLatitude && route.startLongitude) {
    // Round trip - add start as end
    waypointsInput.push({
      orderId: undefined,
      customerId: "END_BASE",
      customerName: route.startLocationName || "Return to Start",
      address: {
        line1: route.startLocationName || "Return to Start",
      },
      latitude: route.startLatitude,
      longitude: route.startLongitude,
    });
  }

  const waypoints = await routeOptimizationService.buildWaypoints(waypointsInput);

  if (waypoints.length < 2) {
    throw new Error("Not enough valid waypoints after geocoding. Please ensure your delivery base and customers have valid addresses.");
  }

  // Calculate unoptimized metrics
  const unoptimized = await routeOptimizationService.calculateUnoptimizedRoute(waypoints);

  // Optimize
  const optimized = await routeOptimizationService.optimizeRoute(waypoints);

  // Update stops with new sequence (skip base waypoints)
  // Find which indices are base waypoints (not actual stops)
  const hasStartBase = route.startLatitude && route.startLongitude;
  const hasEndBase = route.endLatitude && route.endLongitude;
  
  let stopSequence = 1;
  for (let i = 0; i < optimized.optimizedOrder.length; i++) {
    const originalIndex = optimized.optimizedOrder[i];
    
    // Skip base waypoints (first and last if they exist)
    const isStartBase = hasStartBase && originalIndex === 0;
    const isEndBase = hasEndBase && originalIndex === waypointsInput.length - 1;
    
    if (isStartBase || isEndBase) {
      continue; // Skip base waypoints
    }
    
    // Adjust index to account for start base offset
    const stopIndex = hasStartBase ? originalIndex - 1 : originalIndex;
    
    if (stopIndex >= 0 && stopIndex < stops.length) {
      const stop = stops[stopIndex];
      
      await storage.updateRouteStop(stop.id, {
        sequenceNumber: stopSequence,
        distanceFromPreviousMiles: optimized.distances[i] || null,
        durationFromPreviousMinutes: optimized.durations[i] || null,
        latitude: waypoints[originalIndex]?.latitude,
        longitude: waypoints[originalIndex]?.longitude,
      });
      
      stopSequence++;
    }
  }

  // Update route
  const updatedRoute = await storage.updateDeliveryRoute(routeId, {
    isOptimized: true,
    lastOptimizedAt: Date.now(),
    optimizationVersion: (route.optimizationVersion || 0) + 1,
    totalDistanceMiles: optimized.totalDistanceMiles,
    estimatedDurationMinutes: optimized.totalDurationMinutes,
    encodedPolyline: optimized.encodedPolyline,
  });

  // Save optimization result
  const optimizationResult = await storage.insertOptimizationResult({
    id: randomUUID(),
    routeId,
    workspaceId,
    optimizationMethod: "google_maps_directions",
    optimizationVersion: updatedRoute.optimizationVersion || 1,
    originalDistanceMiles: unoptimized.totalDistanceMiles,
    originalDurationMinutes: unoptimized.totalDurationMinutes,
    originalSequence: stops.map(s => s.id),
    optimizedDistanceMiles: optimized.totalDistanceMiles,
    optimizedDurationMinutes: optimized.totalDurationMinutes,
    optimizedSequence: optimized.optimizedOrder.map(i => stops[i].id),
    distanceSavedMiles: unoptimized.totalDistanceMiles - optimized.totalDistanceMiles,
    distanceSavedPercent:
      ((unoptimized.totalDistanceMiles - optimized.totalDistanceMiles) /
        unoptimized.totalDistanceMiles) *
      100,
    timeSavedMinutes: unoptimized.totalDurationMinutes - optimized.totalDurationMinutes,
    timeSavedPercent:
      ((unoptimized.totalDurationMinutes - optimized.totalDurationMinutes) /
        unoptimized.totalDurationMinutes) *
      100,
    apiProvider: optimized.apiProvider,
    apiCallCount: optimized.apiCallCount,
    waypointDistances: optimized.waypointDistances,
    waypointDurations: optimized.waypointDurations,
    fullResponseData: optimized.rawResponse,
    success: true,
    createdAt: Date.now(),
  });

  // Re-fetch stops in optimized order
  const optimizedStops = await storage.listRouteStops(routeId);

  return {
    success: true,
    route: updatedRoute,
    stops: optimizedStops,
    optimizationResults: optimizationResult,
  };
}

/**
 * PUT /api/routes/:id/assign-driver
 * Assign a driver to a route
 */
routePlannerRoutes.put("/routes/:id/assign-driver", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { driverId, driverName, driverPhone, driverEmail } = req.body;

    const route = await storage.getDeliveryRoute(id);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (route.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updatedRoute = await storage.updateDeliveryRoute(id, {
      driverId,
      driverName,
      driverPhone,
      driverEmail,
      status: "assigned",
    });

    res.json({ success: true, route: updatedRoute });
  } catch (error: any) {
    console.error("Error assigning driver:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/routes/:id/start
 * Start a route (driver begins deliveries)
 */
routePlannerRoutes.put("/routes/:id/start", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const route = await storage.getDeliveryRoute(id);

    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (route.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updatedRoute = await storage.updateDeliveryRoute(id, {
      status: "in_progress",
      actualStartTime: Date.now(),
    });

    res.json({ success: true, route: updatedRoute });
  } catch (error: any) {
    console.error("Error starting route:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/routes/:id
 * Delete a route
 */
routePlannerRoutes.delete("/routes/:id", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const route = await storage.getDeliveryRoute(id);

    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (route.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Delete all stops first
    const stops = await storage.listRouteStops(id);
    for (const stop of stops) {
      await storage.deleteRouteStop(stop.id);
    }

    // Delete route
    await storage.deleteDeliveryRoute(id);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting route:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROUTE STOPS ENDPOINTS
// ============================================

/**
 * PUT /api/routes/stops/:id/status
 * Update stop status (delivered, failed, etc.)
 */
routePlannerRoutes.put("/routes/stops/:id/status", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const {
      status,
      recipientName,
      deliveryNotes,
      failureReason,
      failureNotes,
    } = req.body;

    const stop = await storage.getRouteStop(id);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    // Verify workspace access via route
    const route = await storage.getDeliveryRoute(stop.routeId);
    if (!route || route.workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updates: any = { status };

    if (status === "delivered") {
      updates.deliveredAt = Date.now();
      updates.actualArrivalTime = Date.now();
      updates.recipientName = recipientName;
      updates.deliveryNotes = deliveryNotes;
    } else if (status === "failed") {
      updates.failureReason = failureReason;
      updates.failureNotes = failureNotes;
    }

    const updatedStop = await storage.updateRouteStop(id, updates);

    // Update route completed count
    const allStops = await storage.listRouteStops(stop.routeId);
    const completedCount = allStops.filter(s => s.status === "delivered").length;

    await storage.updateDeliveryRoute(stop.routeId, {
      completedStops: completedCount,
    });

    // If all stops completed, mark route as completed
    if (completedCount === allStops.length) {
      await storage.updateDeliveryRoute(stop.routeId, {
        status: "completed",
        actualEndTime: Date.now(),
      });
    }

    res.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    console.error("Error updating stop status:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/routes/active/:workspaceId
 * Get active routes for a driver (in_progress status)
 */
routePlannerRoutes.get("/routes/active/:workspaceId", async (req, res) => {
  try {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { workspaceId } = req.params;
    if (workspaceId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const routes = await storage.listDeliveryRoutesByStatus(workspaceId, "in_progress");

    // Get stops for each route
    const routesWithStops = [];
    for (const route of routes) {
      const stops = await storage.listRouteStops(route.id);
      routesWithStops.push({ ...route, stops });
    }

    res.json({ routes: routesWithStops });
  } catch (error: any) {
    console.error("Error getting active routes:", error);
    res.status(500).json({ error: error.message });
  }
});
