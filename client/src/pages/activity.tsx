/**
 * Activity Page - Shows agent's recent activity
 * Used primarily in mobile view
 */

import { Link } from "wouter";
import { 
  Target, 
  Mail, 
  Calendar, 
  ChevronRight,
  Clock,
  CheckCircle,
  TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ActivityPage() {
  // Mock data - would come from API
  const todayStats = {
    leadsFound: 3,
    emailsSent: 5,
    meetingsBooked: 1,
  };

  const recentActivity = [
    {
      id: "1",
      type: "lead_found",
      title: "Found new lead",
      detail: "Red Lion Pub in Manchester",
      time: "10 minutes ago",
      icon: Target,
    },
    {
      id: "2",
      type: "email_sent",
      title: "Follow-up sent",
      detail: "Email to Crown & Anchor",
      time: "1 hour ago",
      icon: Mail,
    },
    {
      id: "3",
      type: "meeting_booked",
      title: "Meeting scheduled",
      detail: "Duke's Head - Tomorrow 2pm",
      time: "2 hours ago",
      icon: Calendar,
    },
    {
      id: "4",
      type: "task_completed",
      title: "Task completed",
      detail: "Updated customer database",
      time: "3 hours ago",
      icon: CheckCircle,
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agent Activity</h1>
          <p className="text-sm text-muted-foreground">
            What your AI agent has been doing
          </p>
        </div>

        {/* Today's Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-gradient-to-br from-primary/10 to-transparent">
            <CardContent className="p-3 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-primary" />
              <div className="text-2xl font-bold">{todayStats.leadsFound}</div>
              <div className="text-xs text-muted-foreground">Leads</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-chart-2/10 to-transparent">
            <CardContent className="p-3 text-center">
              <Mail className="w-5 h-5 mx-auto mb-1 text-chart-2" />
              <div className="text-2xl font-bold">{todayStats.emailsSent}</div>
              <div className="text-xs text-muted-foreground">Emails</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-chart-3/10 to-transparent">
            <CardContent className="p-3 text-center">
              <Calendar className="w-5 h-5 mx-auto mb-1 text-chart-3" />
              <div className="text-2xl font-bold">{todayStats.meetingsBooked}</div>
              <div className="text-xs text-muted-foreground">Meetings</div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Today's Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => {
                const Icon = activity.icon;
                return (
                  <div 
                    key={activity.id}
                    className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{activity.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {activity.detail}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {activity.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <Card className="bg-gradient-to-r from-chart-1/10 to-chart-2/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-chart-1/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-chart-1" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  Great progress this week!
                </h4>
                <p className="text-sm text-muted-foreground">
                  Your agent found 15 leads and booked 3 meetings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* View Full History */}
        <Button variant="outline" className="w-full" asChild>
          <Link href="/leads">
            View All Leads
            <ChevronRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>
    </ScrollArea>
  );
}


