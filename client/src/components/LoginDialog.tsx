import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

export function LoginDialog() {
  const { user, setUser } = useUser();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  
  // Check if user is a demo user
  const isDemoUser = user.email.endsWith("@wyshbone.demo");

  const handleLogin = () => {
    if (!email.trim()) return;

    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const displayName = name.trim() || email.split("@")[0];

    setUser({
      id: userId,
      email: email.trim(),
      name: displayName
    });

    setEmail("");
    setName("");
    setOpen(false);
  };

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem("wyshbone_sid");
    localStorage.removeItem("wyshbone_user");
    localStorage.removeItem("currentConversationId");
    
    // Reload to trigger fresh demo session creation
    window.location.reload();
  };

  // Handle button click - redirect demo users to signup
  const handleUserMenuClick = () => {
    if (isDemoUser) {
      setLocation("/auth");
    } else {
      setOpen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button 
        variant="ghost" 
        size="sm"
        className="gap-1.5 sidebar:gap-2"
        data-testid="button-user-menu"
        onClick={handleUserMenuClick}
      >
        <UserCircle className="h-4 w-4 shrink-0" />
        <span className="text-xs truncate max-w-[80px] sidebar:max-w-none">{user.name}</span>
      </Button>
      <DialogContent className="sm:max-w-md" data-testid="dialog-login">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>
            {isDemoUser ? "Create a new test profile or switch back to demo user" : "Manage your account"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="current-user">Current User</Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <UserCircle className="h-5 w-5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                <div className="text-xs text-muted-foreground/70 font-mono mt-1">
                  ID: {user.id}
                </div>
              </div>
            </div>
          </div>

          {isDemoUser && (
            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="test@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">Name (Optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Test User"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-name"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {isDemoUser ? (
            <>
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="flex-1"
                data-testid="button-logout"
              >
                Start Fresh Session
              </Button>
              <Button 
                onClick={handleLogin}
                disabled={!email.trim()}
                className="flex-1"
                data-testid="button-create-profile"
              >
                Create Profile
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="w-full"
              data-testid="button-sign-out"
            >
              Sign Out
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
