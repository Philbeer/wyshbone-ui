import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { authedFetch, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Users, Shield, ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isDemo: number;
  createdAt: number;
}

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  sales: "bg-blue-100 text-blue-800",
  driver: "bg-green-100 text-green-800",
};

export default function UserManagementPage() {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [isDevMode, setIsDevMode] = useState(false);
  const [quickSwitching, setQuickSwitching] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/users");
      if (!response.ok) {
        if (response.status === 403) {
          setError("Admin access required");
          return;
        }
        throw new Error("Failed to load users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const fetchDevMode = async () => {
    try {
      const response = await authedFetch("/api/admin/dev-mode");
      if (response.ok) {
        const data = await response.json();
        setIsDevMode(data.isDevMode);
      }
    } catch (err) {
      console.error("Failed to check dev mode:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDevMode();
  }, []);

  const handleRoleChange = (userId: string, newRole: string) => {
    setPendingChanges(prev => ({ ...prev, [userId]: newRole }));
  };

  const saveRoleChange = async (userId: string) => {
    const newRole = pendingChanges[userId];
    if (!newRole) return;

    setSaving(prev => ({ ...prev, [userId]: true }));
    try {
      await apiRequest("PUT", `/api/admin/users/${userId}/role`, { role: newRole });
      toast({ title: "Role updated successfully" });
      setPendingChanges(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleQuickSwitch = async (newRole: string) => {
    setQuickSwitching(true);
    try {
      await apiRequest("PUT", "/api/admin/users/me/role", { role: newRole });
      toast({ 
        title: `Role switched to ${newRole}`, 
        description: "Refresh the page to see changes" 
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast({ title: "Failed to switch role", description: err.message, variant: "destructive" });
    } finally {
      setQuickSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={() => navigate("/settings")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Settings
        </Button>
      </div>
    );
  }

  const currentUserRole = user?.role || "sales";

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              User Management
            </h1>
            <p className="text-gray-500">Manage user roles and permissions</p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchUsers}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {isDevMode && (
        <Card className="mb-6 border-yellow-300 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-600" />
              Quick Role Switch (Dev Mode Only)
            </CardTitle>
            <CardDescription>
              Switch your own role for testing. This is only visible in development mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-sm">
                Current role: <Badge className={roleColors[currentUserRole]}>{currentUserRole}</Badge>
              </span>
              <div className="flex gap-2">
                {["admin", "sales", "driver"].map(role => (
                  <Button
                    key={role}
                    variant={currentUserRole === role ? "default" : "outline"}
                    size="sm"
                    disabled={quickSwitching || currentUserRole === role}
                    onClick={() => handleQuickSwitch(role)}
                  >
                    {quickSwitching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {users.length} user{users.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>New Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.email}
                    {u.isDemo === 1 && (
                      <Badge variant="outline" className="ml-2 text-xs">Demo</Badge>
                    )}
                  </TableCell>
                  <TableCell>{u.name || "-"}</TableCell>
                  <TableCell>
                    <Badge className={roleColors[u.role] || "bg-gray-100 text-gray-800"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={pendingChanges[u.id] || u.role}
                      onValueChange={(value) => handleRoleChange(u.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {pendingChanges[u.id] && pendingChanges[u.id] !== u.role && (
                      <Button
                        size="sm"
                        onClick={() => saveRoleChange(u.id)}
                        disabled={saving[u.id]}
                      >
                        {saving[u.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : null}
                        Save
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Role Descriptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Badge className={roleColors.admin}>Admin</Badge>
            <p className="text-sm text-gray-600">
              Full access to all features including user management, CRM, and driver UI
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge className={roleColors.sales}>Sales</Badge>
            <p className="text-sm text-gray-600">
              Access to CRM, chat, leads, and business features. Cannot access driver UI or user management
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge className={roleColors.driver}>Driver</Badge>
            <p className="text-sm text-gray-600">
              Limited to driver UI only. Will be redirected to /driver/today on login
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
