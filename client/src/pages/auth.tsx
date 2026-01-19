import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, Eye, EyeOff } from "lucide-react";

const TEST_FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Blake"];
const TEST_LAST_NAMES = ["Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Wilson", "Evans", "Thomas", "Johnson"];
const TEST_COMPANIES = ["Acme Corp", "TechStart Ltd", "Blue Ocean Co", "Green Valley Inc", "Swift Solutions", "Peak Digital", "Nova Labs", "Bright Ideas Ltd", "Core Systems", "Apex Ventures"];

function generateTestData() {
  const firstName = TEST_FIRST_NAMES[Math.floor(Math.random() * TEST_FIRST_NAMES.length)];
  const lastName = TEST_LAST_NAMES[Math.floor(Math.random() * TEST_LAST_NAMES.length)];
  const randomNum = Math.floor(Math.random() * 9999);
  const password = `Test${randomNum}Pass!`;
  
  return {
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@testmail.dev`,
    password,
    confirmPassword: password,
    organisationName: TEST_COMPANIES[Math.floor(Math.random() * TEST_COMPANIES.length)],
  };
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  // Check for invite token in URL
  const urlParams = new URLSearchParams(searchString);
  const inviteToken = urlParams.get("token");

  const [signupData, setSignupData] = useState(generateTestData);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string; organisationName?: string; inviteToken?: string }) => {
      // Include demo session ID if available (for data transfer)
      const demoSessionId = localStorage.getItem("wyshbone_sid");
      const payload = { ...data, demoSessionId: demoSessionId || undefined };
      
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
    
    // Require organisation name if not accepting an invite
    if (!inviteToken && !signupData.organisationName.trim()) {
      toast({
        title: "Organisation name required",
        description: "Please enter your company or workspace name",
        variant: "destructive",
      });
      return;
    }
    
    // Validate organisation name length
    const orgName = signupData.organisationName.trim();
    if (!inviteToken && (orgName.length < 2 || orgName.length > 80)) {
      toast({
        title: "Invalid organisation name",
        description: "Organisation name must be between 2 and 80 characters",
        variant: "destructive",
      });
      return;
    }
    
    // Don't send confirmPassword to backend
    const { confirmPassword, ...dataToSend } = signupData;
    signupMutation.mutate({
      ...dataToSend,
      organisationName: inviteToken ? undefined : orgName,
      inviteToken: inviteToken || undefined,
    });
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
              <form onSubmit={handleLogin} className="space-y-4" name="wyshbone-login">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                    autoComplete="username email"
                    data-testid="input-login-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                      autoComplete="current-password"
                      data-testid="input-login-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
              <form onSubmit={handleSignup} className="space-y-4" autoComplete="off">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name (optional)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your name"
                    value={signupData.name}
                    onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                    autoComplete="off"
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
                    autoComplete="off"
                    data-testid="input-signup-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password (min 8 characters)</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      data-testid="input-signup-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      data-testid="input-signup-confirm-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                
                {!inviteToken && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-org-name" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Organisation Name
                    </Label>
                    <Input
                      id="signup-org-name"
                      type="text"
                      placeholder="Your company or workspace name"
                      value={signupData.organisationName}
                      onChange={(e) => setSignupData({ ...signupData, organisationName: e.target.value })}
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="organization"
                      data-testid="input-signup-org-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      This is your company or workspace name. You'll be the admin.
                    </p>
                  </div>
                )}
                
                {inviteToken && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="font-medium">Joining via invite</p>
                    <p className="text-muted-foreground">You'll be added to an existing organisation after signup.</p>
                  </div>
                )}
                
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
