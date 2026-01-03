// Route Optimization Service
// Handles route optimization using Google Maps Directions API

import axios from "axios";
import { SelectCrmCustomer, SelectCrmOrder } from "@shared/schema";

export interface Waypoint {
  id: string; // Stop ID or order ID
  latitude: number;
  longitude: number;
  address: string;
  customerName: string;
}

export interface OptimizationResult {
  optimizedOrder: number[]; // Array of indices in optimized order
  totalDistanceMiles: number;
  totalDurationMinutes: number;
  distances: number[]; // Distance between each consecutive waypoint in miles
  durations: number[]; // Duration between each consecutive waypoint in minutes
  encodedPolyline?: string;
  waypointDistances: number[];
  waypointDurations: number[];
  apiProvider: string;
  apiCallCount: number;
  rawResponse: any;
}

export interface RouteStop {
  orderId?: string;
  customerId: string;
  customerName: string;
  address: {
    line1: string;
    line2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  latitude?: number;
  longitude?: number;
  orderNumber?: string;
  itemCount?: number;
  totalValue?: number;
}

class RouteOptimizationService {
  private apiKey: string;
  private geocodeCache: Map<string, { lat: number; lng: number }> = new Map();

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    if (!this.apiKey) {
      console.warn("GOOGLE_MAPS_API_KEY not set - route optimization will fail");
    }
  }

  /**
   * Geocode an address to lat/lng coordinates
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.apiKey) {
      console.error("Google Maps API key not configured");
      return null;
    }

    // Check cache first
    const normalized = this.normalizeAddress(address);
    if (this.geocodeCache.has(normalized)) {
      return this.geocodeCache.get(normalized)!;
    }

    try {
      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {
          params: {
            address,
            key: this.apiKey,
          },
        }
      );

      if (response.data.status === "OK" && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        const result = { lat: location.lat, lng: location.lng };

        // Cache the result
        this.geocodeCache.set(normalized, result);

        return result;
      } else {
        console.warn(`Geocoding failed for address: ${address}, status: ${response.data.status}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error geocoding address ${address}:`, error.message);
      return null;
    }
  }

  /**
   * Normalize address for caching
   */
  private normalizeAddress(address: string): string {
    return address.toLowerCase().trim().replace(/\s+/g, " ");
  }

  /**
   * Optimize route using Google Maps Directions API with waypoint optimization
   */
  async optimizeRoute(waypoints: Waypoint[]): Promise<OptimizationResult> {
    if (!this.apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    if (waypoints.length < 2) {
      throw new Error("Need at least 2 waypoints to optimize a route");
    }

    if (waypoints.length > 25) {
      throw new Error("Google Maps supports max 25 waypoints per request");
    }

    try {
      // First waypoint is origin, last is destination
      const origin = `${waypoints[0].latitude},${waypoints[0].longitude}`;
      const destination = `${waypoints[waypoints.length - 1].latitude},${waypoints[waypoints.length - 1].longitude}`;

      // Middle waypoints for optimization
      const waypointsParam = waypoints
        .slice(1, -1)
        .map(w => `${w.latitude},${w.longitude}`)
        .join("|");

      const params: any = {
        origin,
        destination,
        key: this.apiKey,
        units: "imperial", // Get distances in miles
        mode: "driving",
      };

      // Add waypoints if there are any middle stops
      if (waypoints.length > 2) {
        params.waypoints = `optimize:true|${waypointsParam}`;
      }

      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/directions/json",
        { params }
      );

      if (response.data.status !== "OK") {
        throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || ""}`);
      }

      const route = response.data.routes[0];

      // Get optimized waypoint order (indices relative to the waypoints parameter)
      const waypointOrder = route.waypoint_order || [];

      // Build full optimized order: first waypoint + optimized middle + last waypoint
      const optimizedOrder = [
        0, // First waypoint (origin)
        ...waypointOrder.map((idx: number) => idx + 1), // Middle waypoints (adjusted for 0-indexing)
        waypoints.length - 1, // Last waypoint (destination)
      ];

      // Extract distances and durations from legs
      const distances: number[] = [];
      const durations: number[] = [];
      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;

      route.legs.forEach((leg: any) => {
        const distanceMiles = leg.distance.value / 1609.34; // Convert meters to miles
        const durationMinutes = Math.round(leg.duration.value / 60); // Convert seconds to minutes

        distances.push(distanceMiles);
        durations.push(durationMinutes);

        totalDistanceMeters += leg.distance.value;
        totalDurationSeconds += leg.duration.value;
      });

      const totalDistanceMiles = totalDistanceMeters / 1609.34;
      const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

      return {
        optimizedOrder,
        totalDistanceMiles,
        totalDurationMinutes,
        distances,
        durations,
        encodedPolyline: route.overview_polyline?.points,
        waypointDistances: distances,
        waypointDurations: durations,
        apiProvider: "google_maps",
        apiCallCount: 1,
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error("Route optimization error:", error.message);
      throw error;
    }
  }

  /**
   * Calculate unoptimized route metrics for comparison
   */
  async calculateUnoptimizedRoute(waypoints: Waypoint[]): Promise<{
    totalDistanceMiles: number;
    totalDurationMinutes: number;
    distances: number[];
    durations: number[];
  }> {
    if (waypoints.length < 2) {
      return {
        totalDistanceMiles: 0,
        totalDurationMinutes: 0,
        distances: [],
        durations: [],
      };
    }

    // Use haversine distance as approximation (faster, no API calls)
    const distances: number[] = [];
    const durations: number[] = [];
    let totalDistance = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const distance = this.calculateHaversineDistance(
        waypoints[i].latitude,
        waypoints[i].longitude,
        waypoints[i + 1].latitude,
        waypoints[i + 1].longitude
      );
      distances.push(distance);
      totalDistance += distance;

      // Rough estimate: 30 mph average speed
      const duration = Math.round((distance / 30) * 60);
      durations.push(duration);
    }

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      totalDistanceMiles: totalDistance,
      totalDurationMinutes: totalDuration,
      distances,
      durations,
    };
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Build waypoints from orders and customers
   */
  async buildWaypoints(
    stops: RouteStop[]
  ): Promise<Waypoint[]> {
    const waypoints: Waypoint[] = [];

    for (const stop of stops) {
      let lat = stop.latitude;
      let lng = stop.longitude;

      // If no coordinates, geocode the address
      if (!lat || !lng) {
        const fullAddress = [
          stop.address.line1,
          stop.address.line2,
          stop.address.city,
          stop.address.postcode,
          stop.address.country,
        ]
          .filter(Boolean)
          .join(", ");

        const coords = await this.geocodeAddress(fullAddress);
        if (!coords) {
          console.warn(`Failed to geocode address for customer ${stop.customerName}`);
          continue; // Skip this stop
        }
        lat = coords.lat;
        lng = coords.lng;
      }

      waypoints.push({
        id: stop.orderId || stop.customerId,
        latitude: lat,
        longitude: lng,
        address: [stop.address.line1, stop.address.city, stop.address.postcode]
          .filter(Boolean)
          .join(", "),
        customerName: stop.customerName,
      });
    }

    return waypoints;
  }
}

export const routeOptimizationService = new RouteOptimizationService();
