/**
 * Settings Page - Agent configuration and user preferences
 */

import { Link } from "wouter";
import { 
  User, 
  Bell, 
  Shield, 
  CreditCard,
  ChevronRight,
  Bot,
  Globe,
  Moon,
  LogOut
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/contexts/UserContext";

export default function SettingsPage() {
  const { user } = useUser();

  const settingsSections = [
    {
      title: "Agent Settings",
      icon: Bot,
      description: "Configure how your AI agent works",
      items: [
        { label: "Auto-find leads", description: "Agent automatically searches for new leads", enabled: true },
        { label: "Auto-send follow-ups", description: "Agent sends follow-up emails automatically", enabled: false },
        { label: "Daily summaries", description: "Receive daily activity reports", enabled: true },
      ],
    },
    {
      title: "Notifications",
      icon: Bell,
      description: "Choose what you get notified about",
      items: [
        { label: "New leads found", description: "When agent finds new leads", enabled: true },
        { label: "Meeting reminders", description: "Before scheduled meetings", enabled: true },
        { label: "Weekly reports", description: "Weekly performance summary", enabled: true },
      ],
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your agent and preferences
          </p>
        </div>

        {/* User Profile Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{user?.email || "User"}</h3>
                <p className="text-sm text-muted-foreground">Pro Plan</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/account">
                  Edit <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Settings Sections */}
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.items.map((item, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <Switch defaultChecked={item.enabled} />
                    </div>
                    {index < section.items.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* Quick Links */}
        <Card>
          <CardContent className="p-0">
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Country Settings</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <Separator />
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Dark Mode</span>
              </div>
              <Switch />
            </button>
            <Separator />
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Subscription</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <Separator />
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Privacy & Security</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Button variant="outline" className="w-full text-destructive hover:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>

        {/* Desktop CRM Notice (Mobile only) */}
        <div className="text-center py-4 md:hidden">
          <p className="text-xs text-muted-foreground">
            📱→💻 Full CRM features available on desktop
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}


