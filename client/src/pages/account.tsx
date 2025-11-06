import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, CreditCard, TrendingUp, Package, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TIER_CONFIG: Record<string, { displayName: string; color: string; monitors: number; deepResearch: number }> = {
  free: { displayName: "Free", color: "secondary", monitors: 2, deepResearch: 2 },
  basic: { displayName: "Basic", color: "default", monitors: 10, deepResearch: 25 },
  pro: { displayName: "Pro", color: "default", monitors: 50, deepResearch: 100 },
  business: { displayName: "Business", color: "default", monitors: 200, deepResearch: 500 },
  enterprise: { displayName: "Enterprise", color: "default", monitors: 99999, deepResearch: 99999 },
};

export default function Account() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Get current user info
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  // Get subscription status
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["/api/subscription/status"],
    enabled: !!currentUser,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/cancel", {});
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription cancelled",
        description: "Your subscription has been cancelled",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (!currentUser && !userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Please sign in to view your account</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => setLocation("/auth")} className="w-full" data-testid="button-signin">
              Go to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (userLoading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const user = currentUser as any;
  const subscription = subscriptionData as any;
  
  const tier = (user?.subscriptionTier || "free") as keyof typeof TIER_CONFIG;
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.free;
  
  const monitorCount = user?.monitorCount || 0;
  const deepResearchCount = user?.deepResearchCount || 0;
  
  const monitorLimit = tierConfig.monitors;
  const deepResearchLimit = tierConfig.deepResearch;
  
  const monitorProgress = (monitorCount / monitorLimit) * 100;
  const deepResearchProgress = (deepResearchCount / deepResearchLimit) * 100;

  const isNearMonitorLimit = monitorProgress >= 80;
  const isNearDeepResearchLimit = deepResearchProgress >= 80;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your subscription and view usage
          </p>
        </div>

        {/* Current Plan Card */}
        <Card className="mb-6" data-testid="card-current-plan">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Current Plan
                </CardTitle>
                <CardDescription className="mt-1">
                  {user?.email}
                </CardDescription>
              </div>
              <Badge variant={tierConfig.color as any} data-testid="badge-tier">
                {tierConfig.displayName}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tier !== "free" && subscription?.subscription && (
              <div className="text-sm text-muted-foreground">
                <p>Status: <span className="font-medium text-foreground">{subscription.subscription.status}</span></p>
                {subscription.subscription.current_period_end && (
                  <p className="mt-1">
                    Renews: <span className="font-medium text-foreground">
                      {new Date(subscription.subscription.current_period_end * 1000).toLocaleDateString()}
                    </span>
                  </p>
                )}
              </div>
            )}
            {tier === "free" && (
              <p className="text-sm text-muted-foreground">
                Upgrade to unlock more monitors and deep research runs
              </p>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {tier === "free" ? (
              <Button onClick={() => setLocation("/pricing")} className="w-full" data-testid="button-upgrade">
                <TrendingUp className="w-4 h-4 mr-2" />
                Upgrade Plan
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setLocation("/pricing")} 
                  className="flex-1"
                  data-testid="button-change-plan"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Change Plan
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="flex-1"
                  data-testid="button-cancel"
                >
                  {cancelMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    "Cancel Subscription"
                  )}
                </Button>
              </>
            )}
          </CardFooter>
        </Card>

        {/* Usage Statistics */}
        <Card data-testid="card-usage">
          <CardHeader>
            <CardTitle>Usage This Month</CardTitle>
            <CardDescription>
              Your current usage against plan limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Monitors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Monitors</span>
                <span className="text-sm text-muted-foreground">
                  {monitorCount} / {monitorLimit}
                </span>
              </div>
              <Progress 
                value={monitorProgress} 
                className={isNearMonitorLimit ? "bg-red-100 dark:bg-red-900" : ""}
                data-testid="progress-monitors"
              />
              {isNearMonitorLimit && (
                <p className="text-xs text-destructive">
                  You're close to your monitor limit
                </p>
              )}
            </div>

            {/* Deep Research */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Deep Research Runs</span>
                <span className="text-sm text-muted-foreground">
                  {deepResearchCount} / {deepResearchLimit}
                </span>
              </div>
              <Progress 
                value={deepResearchProgress}
                className={isNearDeepResearchLimit ? "bg-red-100 dark:bg-red-900" : ""}
                data-testid="progress-deep-research"
              />
              {isNearDeepResearchLimit && (
                <p className="text-xs text-destructive">
                  You're close to your deep research limit
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alert for near-limit users */}
        {(isNearMonitorLimit || isNearDeepResearchLimit) && tier === "free" && (
          <Alert className="mt-6" data-testid="alert-upgrade">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Approaching Plan Limit</AlertTitle>
            <AlertDescription>
              You're using most of your free tier allocation. Upgrade to continue using premium features without interruption.
              <button 
                className="ml-1 underline hover:no-underline font-medium" 
                onClick={() => setLocation("/pricing")}
                data-testid="button-upgrade-link"
              >
                View plans
              </button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
