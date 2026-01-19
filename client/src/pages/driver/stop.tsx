import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { authedFetch, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowLeft,
  MapPin,
  Phone,
  User,
  FileText,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Copy,
  Navigation,
  Camera,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RouteStop {
  id: string;
  routeId: string;
  sequenceNumber: number;
  customerName: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  deliveryInstructions?: string;
  accessNotes?: string;
  status: string;
  itemCount?: number;
  totalValue?: number;
  latitude?: number;
  longitude?: number;
  estimatedArrivalTime?: number;
  actualArrivalTime?: number;
  deliveredAt?: number;
}

interface OrderLine {
  id: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
}

interface StopData {
  stop: RouteStop;
  route: { id: string; name: string; status: string };
  items: OrderLine[];
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  arrived: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-yellow-100 text-yellow-800",
};

const failureReasons = [
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "address_incorrect", label: "Address incorrect" },
  { value: "access_denied", label: "Access denied" },
  { value: "refused_delivery", label: "Refused delivery" },
  { value: "other", label: "Other" },
];

export default function DriverStopPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [data, setData] = useState<StopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showDeliverDialog, setShowDeliverDialog] = useState(false);
  const [showFailDialog, setShowFailDialog] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(false);

  const [recipientName, setRecipientName] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [failureNotes, setFailureNotes] = useState("");

  const fetchStop = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/driver/stop/${params.id}`);
      if (!response.ok) {
        if (response.status === 403) {
          navigate("/driver/today");
          return;
        }
        throw new Error("Failed to load stop");
      }
      const stopData = await response.json();
      setData(stopData);
    } catch (err: any) {
      setError(err.message || "Failed to load stop");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchStop();
    }
  }, [params.id]);

  const copyAddress = () => {
    if (!data?.stop) return;
    const address = [
      data.stop.addressLine1,
      data.stop.addressLine2,
      data.stop.city,
      data.stop.postcode,
    ]
      .filter(Boolean)
      .join(", ");
    navigator.clipboard.writeText(address);
    toast({ title: "Address copied" });
  };

  const openNavigation = () => {
    if (!data?.stop) return;
    const stop = data.stop;
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

  const callContact = () => {
    if (data?.stop?.contactPhone) {
      window.open(`tel:${data.stop.contactPhone}`, "_self");
    }
  };

  const handleArrive = async () => {
    setSubmitting(true);
    try {
      await apiRequest("PUT", `/api/driver/stop/${params.id}/arrive`, {});
      toast({ title: "Arrived at stop" });
      fetchStop();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeliver = async () => {
    setSubmitting(true);
    try {
      await apiRequest("PUT", `/api/driver/stop/${params.id}/deliver`, {
        recipientName: recipientName || undefined,
        deliveryNotes: deliveryNotes || undefined,
      });
      toast({ title: "Delivery completed" });
      setShowDeliverDialog(false);
      navigate("/driver/today");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFail = async () => {
    if (!failureReason || !failureNotes) {
      toast({ title: "Please provide reason and notes", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("PUT", `/api/driver/stop/${params.id}/fail`, {
        failureReason,
        failureNotes,
      });
      toast({ title: "Stop marked as failed" });
      setShowFailDialog(false);
      navigate("/driver/today");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      await apiRequest("PUT", `/api/driver/stop/${params.id}/skip`, {});
      toast({ title: "Stop skipped" });
      setShowSkipDialog(false);
      navigate("/driver/today");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <p className="text-red-600 mb-4">{error || "Stop not found"}</p>
        <Button onClick={() => navigate("/driver/today")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Today
        </Button>
      </div>
    );
  }

  const { stop, items } = data;
  const isCompleted = ["delivered", "failed", "skipped"].includes(stop.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/driver/today")}
            className="text-white hover:bg-blue-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Stop #{stop.sequenceNumber}</h1>
            <p className="text-blue-100 text-sm truncate">{stop.customerName}</p>
          </div>
          <Badge className={statusColors[stop.status] || "bg-gray-100"}>{stop.status}</Badge>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{stop.addressLine1}</p>
                {stop.addressLine2 && <p className="text-gray-600">{stop.addressLine2}</p>}
                <p className="text-gray-600">
                  {[stop.city, stop.postcode].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={copyAddress}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={openNavigation}>
                  <Navigation className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {(stop.contactName || stop.contactPhone) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <div>
                  {stop.contactName && <p className="font-medium">{stop.contactName}</p>}
                  {stop.contactPhone && <p className="text-gray-600">{stop.contactPhone}</p>}
                </div>
                {stop.contactPhone && (
                  <Button variant="outline" onClick={callContact}>
                    <Phone className="w-4 h-4 mr-2" />
                    Call
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(stop.deliveryInstructions || stop.accessNotes) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stop.deliveryInstructions && (
                <div>
                  <p className="text-sm text-gray-500">Delivery Instructions</p>
                  <p>{stop.deliveryInstructions}</p>
                </div>
              )}
              {stop.accessNotes && (
                <div>
                  <p className="text-sm text-gray-500">Access Notes</p>
                  <p>{stop.accessNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items && items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span>{item.productName}</span>
                    <span className="font-medium">x{item.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500">
                {stop.itemCount !== undefined && stop.itemCount > 0 ? (
                  <p>{stop.itemCount} items</p>
                ) : (
                  <p>No item details available</p>
                )}
                {stop.totalValue !== undefined && stop.totalValue > 0 && (
                  <p className="text-sm">Total: £{(stop.totalValue / 100).toFixed(2)}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 space-y-3">
          {stop.status === "pending" && (
            <Button
              className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700"
              onClick={handleArrive}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Clock className="w-5 h-5 mr-2" />}
              I've Arrived
            </Button>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-12 text-yellow-600 border-yellow-300"
              onClick={() => setShowSkipDialog(true)}
              disabled={submitting}
            >
              <SkipForward className="w-4 h-4 mr-1" />
              Skip
            </Button>
            <Button
              variant="outline"
              className="h-12 text-red-600 border-red-300"
              onClick={() => setShowFailDialog(true)}
              disabled={submitting}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Failed
            </Button>
            <Button
              className="h-12 bg-green-600 hover:bg-green-700"
              onClick={() => setShowDeliverDialog(true)}
              disabled={submitting}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Delivered
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showDeliverDialog} onOpenChange={setShowDeliverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delivery</DialogTitle>
            <DialogDescription>Mark this delivery as complete</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Recipient Name (optional)</Label>
              <Input
                placeholder="Who received the delivery?"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>
            <div>
              <Label>Delivery Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about the delivery..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliverDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDeliver} disabled={submitting} className="bg-green-600 hover:bg-green-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFailDialog} onOpenChange={setShowFailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Failed</DialogTitle>
            <DialogDescription>Please provide reason and notes</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Failure Reason *</Label>
              <Select value={failureReason} onValueChange={setFailureReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {failureReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes *</Label>
              <Textarea
                placeholder="Describe what happened..."
                value={failureNotes}
                onChange={(e) => setFailureNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleFail} disabled={submitting} variant="destructive">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Mark Failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Stop</DialogTitle>
            <DialogDescription>Are you sure you want to skip this stop?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSkip} disabled={submitting} className="bg-yellow-500 hover:bg-yellow-600">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Skip Stop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
