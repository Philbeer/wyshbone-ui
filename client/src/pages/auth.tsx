import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [signupData, setSignupData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      // Include demo session ID if available (for data transfer)
      const demoSessionId = localStorage.getItem("wyshbone_sid");
      const payload = demoSessionId ? { ...data, demoSessionId } : data;
      
      const res = await apiRequest("POST", "/api/auth/signup", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      // Store new session ID and user
      if (data.sessionId) {
        localStorage.setItem("wyshbone_sid", data.sessionId);
      }
      if (data.user) {
        localStorage.setItem("wyshbone_user", JSON.stringify(data.user));
      }
      
      const message = data.dataTransferred 
        ? "Your demo data has been transferred to your account!" 
        : "Welcome to Wyshbone Chat Agent!";
      
      toast({
        title: "Account created",
        description: message,
      });
      
      // Reload to refresh user context
      window.location.href = "/";
    },
    onError: (error) => {
      toast({
        title: "Signup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: typeof loginData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (data) => {
      // Store session ID and user
      if (data.sessionId) {
        localStorage.setItem("wyshbone_sid", data.sessionId);
      }
      if (data.user) {
        localStorage.setItem("wyshbone_user", JSON.stringify(data.user));
      }
      
      toast({
        title: "Logged in",
        description: "Welcome back!",
      });
      
      // Reload to refresh user context
      window.location.href = "/";
    },
    onError: (error) => {
      toast({
        title: "Login failed",
        description: error.message || "Please check your credentials",
        variant: "destructive",
      });
    },
  });

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate passwords match
    if (signupData.password !== signupData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }
    
    // Don't send confirmPassword to backend
    const { confirmPassword, ...dataToSend } = signupData;
    signupMutation.mutate(dataToSend);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Wyshbone Chat Agent</CardTitle>
          <CardDescription>Create a free account to get 2 scheduled monitors and 2 deep research reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                    data-testid="input-login-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    required
                    data-testid="input-login-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name (optional)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your name"
                    value={signupData.name}
                    onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                    data-testid="input-signup-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    required
                    data-testid="input-signup-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    required
                    minLength={6}
                    data-testid="input-signup-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    value={signupData.confirmPassword}
                    onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                    required
                    minLength={6}
                    data-testid="input-signup-confirm-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={signupMutation.isPending}
                  data-testid="button-signup-submit"
                >
                  {signupMutation.isPending ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            data-testid="link-continue-demo"
          >
            Continue as demo user
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
