import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { authedFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Navigation, Phone, RefreshCw, ChevronRight } from "lucide-react";

interface RouteStop {
  id: string;
  sequenceNumber: number;
  customerName: string;
  addressLine1: string;
  city?: string;
  postcode?: string;
  contactPhone?: string;
  status: string;
  deliveryInstructions?: string;
  latitude?: number;
  longitude?: number;
}

interface DeliveryRoute {
  id: string;
  name: string;
  deliveryDate: number;
  status: string;
  totalStops: number;
  completedStops: number;
  stops: RouteStop[];
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  arrived: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-yellow-100 text-yellow-800",
};

export default function DriverTodayPage() {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch("/api/driver/today");
      if (!response.ok) {
        if (response.status === 403) {
          navigate("/");
          return;
        }
        throw new Error("Failed to load routes");
      }
      const data = await response.json();
      setRoutes(data.routes || []);
    } catch (err: any) {
      setError(err.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const openNavigation = (stop: RouteStop) => {
    const address = encodeURIComponent(
      `${stop.addressLine1}, ${stop.city || ""} ${stop.postcode || ""}`.trim()
    );
    if (stop.latitude && stop.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`,
        "_blank"
      );
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, "_blank");
    }
  };

  const getNextPendingStop = (stops: RouteStop[]): RouteStop | null => {
    return stops.find((s) => s.status === "pending" || s.status === "arrived") || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={fetchRoutes}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const totalStops = routes.reduce((sum, r) => sum + r.totalStops, 0);
  const completedStops = routes.reduce((sum, r) => sum + r.completedStops, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Today's Deliveries</h1>
            <p className="text-blue-100 text-sm">{user?.name || "Driver"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchRoutes} className="text-white hover:bg-blue-700">
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="p-4">
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {completedStops} / {totalStops}
              </p>
              <p className="text-gray-500 text-sm">Stops completed</p>
            </div>
            <div className="w-16 h-16 relative">
              <svg viewBox="0 0 36 36" className="w-16 h-16">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeDasharray={`${totalStops > 0 ? (completedStops / totalStops) * 100 : 0}, 100`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {routes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No routes assigned for today</p>
            </CardContent>
          </Card>
        ) : (
          routes.map((route) => {
            const nextStop = getNextPendingStop(route.stops);
            return (
              <div key={route.id} className="mb-6">
                <Card className="mb-2">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{route.name}</CardTitle>
                      <Badge variant="outline">
                        {route.completedStops}/{route.totalStops}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <div className="space-y-2">
                  {route.stops.map((stop) => {
                    const isNext = nextStop?.id === stop.id;
                    return (
                      <Card
                        key={stop.id}
                        className={`${isNext ? "ring-2 ring-blue-500 bg-blue-50" : ""} ${
                          stop.status === "delivered" ? "opacity-60" : ""
                        }`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
                              {stop.sequenceNumber}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{stop.customerName}</span>
                                <Badge className={statusColors[stop.status] || "bg-gray-100"}>
                                  {stop.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-500 truncate">
                                {stop.addressLine1}
                                {stop.city && `, ${stop.city}`}
                                {stop.postcode && ` ${stop.postcode}`}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10"
                                onClick={() => openNavigation(stop)}
                              >
                                <Navigation className="w-5 h-5 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10"
                                onClick={() => navigate(`/driver/stop/${stop.id}`)}
                              >
                                <ChevronRight className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
