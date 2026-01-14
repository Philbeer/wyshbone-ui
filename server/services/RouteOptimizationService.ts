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
  private isDev: boolean;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    this.isDev = process.env.NODE_ENV === "development" || !this.apiKey;
    if (!this.apiKey) {
      console.warn("GOOGLE_MAPS_API_KEY not set - using mock geocoding for development");
    }
  }

  /**
   * Generate mock UK coordinates based on postcode or address
   * Used when GOOGLE_MAPS_API_KEY is not available
   */
  private getMockCoordinates(address: string): { lat: number; lng: number } {
    // Extract postcode from address (UK format)
    const postcodeMatch = address.match(/([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i);
    const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase().replace(/\s+/g, '') : '';
    
    // Rough UK postcode area centers (approximate)
    const postcodeAreas: Record<string, { lat: number; lng: number }> = {
      'BN': { lat: 50.8225, lng: -0.1372 },   // Brighton
      'BH': { lat: 50.7192, lng: -1.8808 },   // Bournemouth
      'PO': { lat: 50.7989, lng: -1.0912 },   // Portsmouth
      'SO': { lat: 50.9097, lng: -1.4044 },   // Southampton
      'GU': { lat: 51.2362, lng: -0.7677 },   // Guildford
      'RH': { lat: 51.1171, lng: -0.1864 },   // Redhill/Crawley
      'TN': { lat: 51.1310, lng: 0.2636 },    // Tunbridge Wells
      'ME': { lat: 51.2721, lng: 0.5299 },    // Medway
      'CT': { lat: 51.2802, lng: 1.0789 },    // Canterbury
      'DA': { lat: 51.4412, lng: 0.2121 },    // Dartford
      'BR': { lat: 51.4057, lng: 0.0142 },    // Bromley
      'SE': { lat: 51.4615, lng: -0.0117 },   // South East London
      'SW': { lat: 51.4613, lng: -0.1689 },   // South West London
      'W': { lat: 51.5133, lng: -0.1566 },    // West London
      'E': { lat: 51.5387, lng: -0.0333 },    // East London
      'N': { lat: 51.5619, lng: -0.1044 },    // North London
      'NW': { lat: 51.5440, lng: -0.1733 },   // North West London
      'EC': { lat: 51.5188, lng: -0.0825 },   // East Central London
      'WC': { lat: 51.5170, lng: -0.1212 },   // West Central London
      'M': { lat: 53.4808, lng: -2.2426 },    // Manchester
      'B': { lat: 52.4862, lng: -1.8904 },    // Birmingham
      'L': { lat: 53.4084, lng: -2.9916 },    // Liverpool
      'LS': { lat: 53.8008, lng: -1.5491 },   // Leeds
      'S': { lat: 53.3811, lng: -1.4701 },    // Sheffield
      'BS': { lat: 51.4545, lng: -2.5879 },   // Bristol
      'EX': { lat: 50.7184, lng: -3.5339 },   // Exeter
      'PL': { lat: 50.3755, lng: -4.1427 },   // Plymouth
      'TR': { lat: 50.2660, lng: -5.0527 },   // Truro
      'NE': { lat: 54.9783, lng: -1.6178 },   // Newcastle
      'EH': { lat: 55.9533, lng: -3.1883 },   // Edinburgh
      'G': { lat: 55.8642, lng: -4.2518 },    // Glasgow
      'AB': { lat: 57.1497, lng: -2.0943 },   // Aberdeen
      'CF': { lat: 51.4816, lng: -3.1791 },   // Cardiff
    };

    // Find matching postcode area
    const areaPrefix = postcode.slice(0, 2).replace(/\d/g, '');
    if (postcodeAreas[areaPrefix]) {
      // Add small random offset to differentiate addresses
      const hash = address.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
      const latOffset = ((hash % 1000) / 100000);
      const lngOffset = (((hash >> 8) % 1000) / 100000);
      return {
        lat: postcodeAreas[areaPrefix].lat + latOffset,
        lng: postcodeAreas[areaPrefix].lng + lngOffset,
      };
    }

    // Default to central England with random offset
    const hash = address.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    return {
      lat: 52.5 + ((hash % 1000) / 10000),
      lng: -1.5 + (((hash >> 8) % 1000) / 10000),
    };
  }

  /**
   * Geocode an address to lat/lng coordinates
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    // Check cache first
    const normalized = this.normalizeAddress(address);
    if (this.geocodeCache.has(normalized)) {
      return this.geocodeCache.get(normalized)!;
    }

    // Use mock geocoding in development when no API key
    if (!this.apiKey) {
      console.log(`[DEV] Using mock geocoding for: ${address}`);
      const mockCoords = this.getMockCoordinates(address);
      this.geocodeCache.set(normalized, mockCoords);
      return mockCoords;
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
        // Fall back to mock in development
        if (this.isDev) {
          const mockCoords = this.getMockCoordinates(address);
          this.geocodeCache.set(normalized, mockCoords);
          return mockCoords;
        }
        return null;
      }
    } catch (error: any) {
      console.error(`Error geocoding address ${address}:`, error.message);
      // Fall back to mock in development
      if (this.isDev) {
        const mockCoords = this.getMockCoordinates(address);
        this.geocodeCache.set(normalized, mockCoords);
        return mockCoords;
      }
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
   * Optimize route using nearest-neighbor algorithm (fallback when no API key)
   */
  private optimizeRouteLocal(waypoints: Waypoint[]): OptimizationResult {
    console.log("[DEV] Using local nearest-neighbor route optimization");
    
    // Simple nearest-neighbor algorithm
    const visited = new Set<number>();
    const optimizedOrder: number[] = [];
    const distances: number[] = [];
    const durations: number[] = [];
    
    // Start from first waypoint
    let current = 0;
    visited.add(0);
    optimizedOrder.push(0);
    
    while (optimizedOrder.length < waypoints.length) {
      let nearest = -1;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < waypoints.length; i++) {
        if (visited.has(i)) continue;
        
        const distance = this.calculateHaversineDistance(
          waypoints[current].latitude,
          waypoints[current].longitude,
          waypoints[i].latitude,
          waypoints[i].longitude
        );
        
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = i;
        }
      }
      
      if (nearest !== -1) {
        visited.add(nearest);
        optimizedOrder.push(nearest);
        distances.push(nearestDistance);
        durations.push(Math.round(nearestDistance * 2)); // Rough estimate: 2 min per mile
        current = nearest;
      }
    }
    
    const totalDistanceMiles = distances.reduce((a, b) => a + b, 0);
    const totalDurationMinutes = durations.reduce((a, b) => a + b, 0);
    
    return {
      optimizedOrder,
      totalDistanceMiles,
      totalDurationMinutes,
      distances,
      durations,
      waypointDistances: distances,
      waypointDurations: durations,
      apiProvider: "local_nearest_neighbor",
      apiCallCount: 0,
      rawResponse: null,
    };
  }

  /**
   * Optimize route using Google Maps Directions API with waypoint optimization
   */
  async optimizeRoute(waypoints: Waypoint[]): Promise<OptimizationResult> {
    if (waypoints.length < 2) {
      throw new Error("Need at least 2 waypoints to optimize a route");
    }

    if (waypoints.length > 25) {
      throw new Error("Google Maps supports max 25 waypoints per request");
    }

    // Use local optimization if no API key
    if (!this.apiKey) {
      return this.optimizeRouteLocal(waypoints);
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
        console.warn(`Google Maps API error: ${response.data.status}, falling back to local optimization`);
        return this.optimizeRouteLocal(waypoints);
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
