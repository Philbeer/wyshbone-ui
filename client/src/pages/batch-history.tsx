import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface BatchJob {
  id: string;
  query: string;
  location: string;
  country: string;
  targetRole: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  totalFound: number;
  totalSent: number;
  totalSkipped: number;
  createdAt: string;
  completedAt?: string;
}

export default function BatchHistoryPage() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading } = useQuery<{ jobs: BatchJob[] }>({
    queryKey: ["/api/batch"],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            In Progress
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Email Finder Runs</h1>
            <p className="text-muted-foreground">
              View and manage your batch contact discovery campaigns
            </p>
          </div>

          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const jobs = data?.jobs || [];

  if (jobs.length === 0) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Email Finder Runs</h1>
            <p className="text-muted-foreground">
              View and manage your batch contact discovery campaigns
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No batch runs yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Start an email finder campaign from the chat to see your batch contact discovery runs here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Email Finder Runs</h1>
          <p className="text-muted-foreground">
            View and manage your batch contact discovery campaigns
          </p>
        </div>

        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id} className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg mb-2">
                      {job.query} - {job.location}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>Target: {job.targetRole}</span>
                      <span>•</span>
                      <span>{job.country}</span>
                      <span>•</span>
                      <span>{format(new Date(job.createdAt), "PPp")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(job.status)}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {job.status === "completed" && (
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">Found: </span>
                      <span className="font-medium">{job.totalFound}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent: </span>
                      <span className="font-medium">{job.totalSent}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Skipped: </span>
                      <span className="font-medium">{job.totalSkipped}</span>
                    </div>
                  </div>
                )}
                
                <Button
                  onClick={() => setLocation(`/batch/${job.id}`)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-testid={`button-view-batch-${job.id}`}
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
