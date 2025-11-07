import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PricingTier {
  name: string;
  displayName: string;
  price: string;
  credits: number;
  monitors: number;
  deepResearch: number;
  priceId?: string;
  popular?: boolean;
}

interface CurrentUser {
  id: string;
  email: string;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  monitorCount: number;
  deepResearchCount: number;
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: "free",
    displayName: "Free",
    price: "£0",
    credits: 0,
    monitors: 2,
    deepResearch: 2,
  },
  {
    name: "basic",
    displayName: "Basic",
    price: "£35",
    credits: 350,
    monitors: 10,
    deepResearch: 25,
  },
  {
    name: "pro",
    displayName: "Pro",
    price: "£70",
    credits: 800,
    monitors: 50,
    deepResearch: 100,
    popular: true,
  },
  {
    name: "business",
    displayName: "Business",
    price: "£120",
    credits: 1400,
    monitors: 200,
    deepResearch: 500,
  },
  {
    name: "enterprise",
    displayName: "Enterprise",
    price: "£250",
    credits: 3000,
    monitors: 99999,
    deepResearch: 99999,
  },
];

export default function Pricing() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  // Check if user is authenticated
  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  const subscribeMutation = useMutation({
    mutationFn: async (tier: string) => {
      const res = await apiRequest("POST", "/api/subscription/create", { tier });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setSelectedTier(null);
    },
  });

  const handleSubscribe = (tier: PricingTier) => {
    // Check if user is a demo user
    const isDemoUser = currentUser?.email?.endsWith("@wyshbone.demo");
    
    // If no user or demo user, redirect to signup
    if (!currentUser || isDemoUser) {
      if (tier.name === "free") {
        // Redirect demo users to signup page for free tier
        setLocation("/auth");
        return;
      } else {
        // For paid tiers, show signup required message
        toast({
          title: "Sign up required",
          description: "Please create an account to subscribe",
        });
        setLocation("/auth");
        return;
      }
    }

    if (tier.name === "free") {
      toast({
        title: "Already on free tier",
        description: "You're currently using the free plan",
      });
      return;
    }

    setSelectedTier(tier.name);
    subscribeMutation.mutate(tier.name);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start with a demo account, upgrade to free tier, or unlock unlimited potential with our premium plans
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
          {PRICING_TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={`flex flex-col relative ${
                tier.popular ? "border-primary shadow-lg" : ""
              }`}
              data-testid={`card-pricing-${tier.name}`}
            >
              {tier.popular && (
                <Badge
                  className="absolute -top-3 left-1/2 -translate-x-1/2"
                  data-testid="badge-popular"
                >
                  Popular
                </Badge>
              )}
              
              <CardHeader>
                <CardTitle className="text-xl">{tier.displayName}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">{tier.price}</span>
                  {tier.price !== "£0" && <span className="text-sm">/month</span>}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    <span>{tier.monitors} monitors max</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    <span>{tier.deepResearch} deep research runs</span>
                  </div>
                  {tier.credits > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary" />
                      <span>{tier.credits} API credits</span>
                    </div>
                  )}
                  {tier.name === "free" && (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span>Email notifications</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span>Basic support</span>
                      </div>
                    </>
                  )}
                  {tier.name !== "free" && (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span>Priority support</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span>Advanced analytics</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={tier.popular ? "default" : "outline"}
                  onClick={() => handleSubscribe(tier)}
                  disabled={subscribeMutation.isPending && selectedTier === tier.name}
                  data-testid={`button-subscribe-${tier.name}`}
                >
                  {subscribeMutation.isPending && selectedTier === tier.name ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : tier.name === "free" ? (
                    "Sign Up Free"
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Demo Account Notice */}
        <div className="mt-12 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-lg">Try Before You Subscribe</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Start with a demo account to explore features. When you're ready for more, 
                sign up for a free account or upgrade to a premium plan for unlimited access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
