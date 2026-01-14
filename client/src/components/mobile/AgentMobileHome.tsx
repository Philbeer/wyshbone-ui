/**
 * AgentMobileHome - Mobile-first home screen for agent interaction
 * 
 * Shows:
 * - Agent status card
 * - Recent activity
 * - Prominent "Chat with Agent" button
 * - Simplified view optimized for mobile
 */

import { useState } from "react";
import { Link } from "wouter";
import { 
  MessageSquare, 
  Target, 
  Mail, 
  Calendar,
  ChevronRight,
  Zap,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { useAgentStatus } from "@/contexts/AgentStatusContext";
import { cn } from "@/lib/utils";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";

interface AgentMobileHomeProps {
  className?: string;
  onStartChat?: () => void;
}

export function AgentMobileHome({ className, onStartChat }: AgentMobileHomeProps) {
  const { status } = useAgentStatus();

  // Mock data - would come from API
  const todayStats = {
    leadsFound: 0,
    followUps: 0,
    meetingsSet: 0,
  };

  const recentActivity: Array<{
    id: string;
    action: string;
    detail: string;
    time: string;
  }> = [];

  return (
    <div className={cn("flex flex-col h-full overflow-y-auto", className)}>
      <div className="p-4 space-y-4">
        {/* Agent Status Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-primary/30">
                  <img 
                    src={wyshboneLogo} 
                    alt="Agent" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <span 
                  className={cn(
                    "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card",
                    status === "running" && "bg-green-500 animate-pulse",
                    status === "thinking" && "bg-amber-500 animate-pulse",
                    status === "idle" && "bg-gray-400",
                    status === "error" && "bg-red-500"
                  )}
                />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Your AI Sales Agent</h2>
                <AgentStatusBadge status={status} className="mt-1" />
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="text-center p-2 rounded-lg bg-background/50">
                <div className="flex items-center justify-center gap-1">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-lg font-bold">{todayStats.leadsFound}</span>
                </div>
                <div className="text-xs text-muted-foreground">Leads</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-background/50">
                <div className="flex items-center justify-center gap-1">
                  <Mail className="w-4 h-4 text-chart-2" />
                  <span className="text-lg font-bold">{todayStats.followUps}</span>
                </div>
                <div className="text-xs text-muted-foreground">Follow-ups</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-background/50">
                <div className="flex items-center justify-center gap-1">
                  <Calendar className="w-4 h-4 text-chart-3" />
                  <span className="text-lg font-bold">{todayStats.meetingsSet}</span>
                </div>
                <div className="text-xs text-muted-foreground">Meetings</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat Button - Large and Prominent */}
        <Button 
          size="lg" 
          className="w-full h-14 text-lg font-semibold gap-3"
          onClick={onStartChat}
          asChild
        >
          <Link href="/">
            <MessageSquare className="w-6 h-6" />
            Chat with your Agent
          </Link>
        </Button>

        {/* Recent Activity */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Recent Activity</h3>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activity">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
            
            {recentActivity.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your agent is ready to work.
                  <br />
                  Start a chat to give instructions!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map((activity) => (
                  <div 
                    key={activity.id}
                    className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{activity.action}</p>
                      <p className="text-xs text-muted-foreground truncate">{activity.detail}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {activity.time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Value Prop Reminder */}
        <Card className="bg-gradient-to-r from-chart-1/10 to-chart-2/10 border-chart-1/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-chart-1/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">Your 24/7 Sales Team</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Your AI agent works around the clock finding leads, 
                  sending outreach, and booking meetings while you focus on closing deals.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desktop CRM Notice */}
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            📱→💻 Full CRM features available on desktop
          </p>
        </div>
      </div>
    </div>
  );
}

export default AgentMobileHome;


