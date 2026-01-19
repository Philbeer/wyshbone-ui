import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Users, Mail, UserPlus, Crown, Truck, Briefcase, Copy, Loader2, Trash2, Building2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { CreateOrgDialog } from "@/components/CreateOrgDialog";

interface OrgMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: "admin" | "sales" | "driver";
  createdAt: number;
}

interface OrgInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  isExpired: boolean;
}

interface OrgInfo {
  hasOrg: boolean;
  org: { id: string; name: string } | null;
  membership: { role: string } | null;
  pendingInvites: OrgInvite[];
}

const roleIcons = {
  admin: Crown,
  sales: Briefcase,
  driver: Truck,
};

const roleColors = {
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  sales: "bg-blue-100 text-blue-800 border-blue-200",
  driver: "bg-green-100 text-green-800 border-green-200",
};

export default function TeamPage() {
  const { user, sessionId } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "sales" | "driver">("sales");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);

  const { data: orgInfo, isLoading: orgLoading } = useQuery<OrgInfo>({
    queryKey: ["/api/org/me"],
    queryFn: async () => {
      const res = await fetch("/api/org/me", {
        headers: { "x-session-id": sessionId || "" },
      });
      if (!res.ok) throw new Error("Failed to fetch org info");
      return res.json();
    },
    enabled: !!sessionId,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: OrgMember[]; orgName: string }>({
    queryKey: ["/api/org/members"],
    queryFn: async () => {
      const res = await fetch("/api/org/members", {
        headers: { "x-session-id": sessionId || "" },
      });
      if (!res.ok) {
        if (res.status === 403) return { members: [], orgName: "" };
        throw new Error("Failed to fetch members");
      }
      return res.json();
    },
    enabled: !!sessionId && !!orgInfo?.hasOrg,
  });

  const { data: invitesData } = useQuery<{ invites: OrgInvite[] }>({
    queryKey: ["/api/org/invites"],
    queryFn: async () => {
      const res = await fetch("/api/org/invites", {
        headers: { "x-session-id": sessionId || "" },
      });
      if (!res.ok) {
        if (res.status === 403) return { invites: [] };
        throw new Error("Failed to fetch invites");
      }
      return res.json();
    },
    enabled: !!sessionId && !!orgInfo?.hasOrg && orgInfo.membership?.role === "admin",
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId || "",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create invite");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invite sent",
        description: `Invite link created for ${inviteEmail}`,
      });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/org/invites"] });
      
      if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink);
        setCopiedLink(data.inviteLink);
        toast({
          title: "Link copied",
          description: "Invite link copied to clipboard",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/org/members/${userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId || "",
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update role");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/org/members"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await fetch(`/api/org/invites/${inviteId}/revoke`, {
        method: "POST",
        headers: { "x-session-id": sessionId || "" },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to revoke invite");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/org/invites"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!orgInfo?.hasOrg) {
    const pendingInvites = orgInfo?.pendingInvites || [];
    
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Create Your Organisation
            </CardTitle>
            <CardDescription>
              Create an organisation to start inviting team members and collaborating.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              An organisation is where you manage your team, assign roles, and collaborate. 
              You'll be the admin of your new organisation.
            </p>
            <Button onClick={() => setShowCreateOrgDialog(true)}>
              <Building2 className="h-4 w-4 mr-2" />
              Create Organisation
            </Button>
            
            {pendingInvites.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-medium mb-2">Pending Invitations</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  You have invitations to join existing organisations.
                </p>
                {pendingInvites.map((invite: OrgInvite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg mb-2">
                    <div>
                      <p className="font-medium">Invitation as {invite.role}</p>
                      <p className="text-sm text-muted-foreground">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button 
                      size="sm"
                      onClick={async () => {
                        const res = await fetch("/api/org/invites/accept", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-session-id": sessionId || "",
                          },
                          body: JSON.stringify({ token: invite.token }),
                        });
                        if (res.ok) {
                          queryClient.invalidateQueries({ queryKey: ["/api/org/me"] });
                          toast({ title: "Invitation accepted!" });
                        } else {
                          const error = await res.json();
                          toast({ title: "Error", description: error.error, variant: "destructive" });
                        }
                      }}
                    >
                      Accept
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <CreateOrgDialog 
          open={showCreateOrgDialog} 
          onOpenChange={setShowCreateOrgDialog} 
        />
      </div>
    );
  }

  const isAdmin = orgInfo.membership?.role === "admin";
  const members = membersData?.members || [];
  const invites = invitesData?.invites || [];
  const pendingInvites = invites.filter(i => i.status === "pending" && !i.isExpired);

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">
            Manage your team members and their roles
          </p>
        </div>
        <Badge className={roleColors[orgInfo.membership?.role as keyof typeof roleColors] || "bg-gray-100"}>
          You are {orgInfo.membership?.role} in {orgInfo.org?.name}
        </Badge>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Team Member
            </CardTitle>
            <CardDescription>
              Send an invite link to add new members to your organisation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inviteEmail) {
                  createInviteMutation.mutate({ email: inviteEmail, role: inviteRole });
                }
              }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <div className="flex-1">
                <Label htmlFor="email" className="sr-only">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="w-full sm:w-36">
                <Label htmlFor="role" className="sr-only">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={createInviteMutation.isPending}>
                {createInviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Send Invite
              </Button>
            </form>
            
            {copiedLink && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs truncate flex-1">{copiedLink}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(copiedLink);
                      toast({ title: "Copied!" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Share this link with the invitee
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No team members yet
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const Icon = roleIcons[member.role] || Briefcase;
                const isCurrentUser = member.userId === user?.id;
                
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.name || member.email}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-2">(you)</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && !isCurrentUser ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRoleMutation.mutate({ userId: member.userId, role })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="driver">Driver</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={roleColors[member.role]}>
                          {member.role}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invites ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-dashed"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited as {invite.role} • Expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeInviteMutation.mutate(invite.id)}
                    disabled={revokeInviteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
