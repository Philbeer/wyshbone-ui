import { Router } from "express";
import { storage } from "../storage";
import { 
  createOrgRequestSchema, 
  createInviteRequestSchema, 
  acceptInviteRequestSchema,
  updateMemberRoleRequestSchema,
  orgMemberRoleSchema 
} from "@shared/schema";
import crypto from "crypto";

export const orgRoutes = Router();

async function getAuthenticatedUser(req: any): Promise<{ userId: string; userEmail: string } | null> {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    try {
      const session = await storage.getSession(sessionId);
      if (session) {
        return { userId: session.userId, userEmail: session.userEmail };
      }
    } catch (error) {
      console.error("Session lookup error:", error);
    }
  }

  // Query param auth fallback - development only for testing
  if (process.env.NODE_ENV !== "production") {
    const userId = req.query.user_id || req.query.userId;
    const userEmail = req.query.user_email;
    if (userId && userEmail) {
      console.warn("[DEV ONLY] Query param auth used - not available in production");
      return { userId: userId as string, userEmail: userEmail as string };
    }
  }

  return null;
}

async function requireAuth(req: any, res: any, next: any) {
  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await storage.getUserById(auth.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  (req as any).currentUser = user;
  next();
}

async function requireOrgAdmin(req: any, res: any, next: any) {
  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await storage.getUserById(auth.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  if (!user.currentOrgId) {
    return res.status(403).json({ error: "No organisation selected" });
  }

  const membership = await storage.getOrgMember(user.currentOrgId, user.id);
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this organisation" });
  }

  if (membership.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  (req as any).currentUser = user;
  (req as any).currentOrg = await storage.getOrganisation(user.currentOrgId);
  (req as any).currentMembership = membership;
  next();
}

orgRoutes.get("/me", requireAuth, async (req, res) => {
  try {
    const user = (req as any).currentUser;
    
    if (!user.currentOrgId) {
      return res.json({ 
        hasOrg: false, 
        org: null, 
        membership: null,
        pendingInvites: await storage.getPendingInvitesForEmail(user.email)
      });
    }

    const org = await storage.getOrganisation(user.currentOrgId);
    const membership = await storage.getOrgMember(user.currentOrgId, user.id);
    const pendingInvites = await storage.getPendingInvitesForEmail(user.email);

    res.json({
      hasOrg: !!org,
      org,
      membership,
      pendingInvites
    });
  } catch (error: any) {
    console.error("Error getting org info:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.post("/create", requireAuth, async (req, res) => {
  try {
    const user = (req as any).currentUser;
    
    const parseResult = createOrgRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request", 
        details: parseResult.error.errors 
      });
    }

    const { name } = parseResult.data;
    const now = Date.now();
    const orgId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    const org = await storage.createOrganisation({
      id: orgId,
      name,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await storage.createOrgMember({
      id: memberId,
      orgId: org.id,
      userId: user.id,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });

    await storage.updateUserCurrentOrg(user.id, org.id);

    res.json({
      success: true,
      org,
      membership: {
        id: memberId,
        orgId: org.id,
        userId: user.id,
        role: "admin",
      }
    });
  } catch (error: any) {
    console.error("Error creating organisation:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.get("/members", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const members = await storage.listOrgMembers(org.id);
    
    const membersWithUsers = await Promise.all(
      members.map(async (m) => {
        const user = await storage.getUserById(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          email: user?.email || "Unknown",
          name: user?.name || null,
          role: m.role,
          createdAt: m.createdAt,
        };
      })
    );

    res.json({ members: membersWithUsers, orgName: org.name });
  } catch (error: any) {
    console.error("Error listing org members:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.put("/members/:userId/role", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const currentUser = (req as any).currentUser;
    const { userId } = req.params;

    const parseResult = updateMemberRoleRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid role", 
        validRoles: ["admin", "sales", "driver"] 
      });
    }

    const { role } = parseResult.data;

    if (userId === currentUser.id && role !== "admin") {
      return res.status(400).json({ 
        error: "Cannot demote yourself from admin" 
      });
    }

    const member = await storage.getOrgMember(org.id, userId);
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    const updated = await storage.updateOrgMemberRole(org.id, userId, role);

    res.json({ success: true, member: updated });
  } catch (error: any) {
    console.error("Error updating member role:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.delete("/members/:userId", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const currentUser = (req as any).currentUser;
    const { userId } = req.params;

    if (userId === currentUser.id) {
      return res.status(400).json({ error: "Cannot remove yourself from the organisation" });
    }

    const member = await storage.getOrgMember(org.id, userId);
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    await storage.removeOrgMember(org.id, userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.get("/invites", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const invites = await storage.listOrgInvites(org.id);

    const now = Date.now();
    const invitesWithStatus = invites.map(inv => ({
      ...inv,
      isExpired: inv.expiresAt < now && inv.status === "pending",
    }));

    res.json({ invites: invitesWithStatus });
  } catch (error: any) {
    console.error("Error listing invites:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.post("/invites", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const currentUser = (req as any).currentUser;

    const parseResult = createInviteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request", 
        details: parseResult.error.errors 
      });
    }

    const { email, role } = parseResult.data;

    const existingMembers = await storage.listOrgMembers(org.id);
    const alreadyMember = existingMembers.some(m => {
      const user = storage.getUserById(m.userId);
      return false;
    });

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      const existing = await storage.getOrgMember(org.id, existingUser.id);
      if (existing) {
        return res.status(400).json({ error: "User is already a member of this organisation" });
      }
    }

    const existingInvites = await storage.listOrgInvites(org.id);
    const pendingInvite = existingInvites.find(
      inv => inv.email.toLowerCase() === email.toLowerCase() && inv.status === "pending"
    );
    if (pendingInvite) {
      return res.status(400).json({ error: "An invite is already pending for this email" });
    }

    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000);
    const token = crypto.randomBytes(32).toString("hex");

    const invite = await storage.createOrgInvite({
      id: crypto.randomUUID(),
      orgId: org.id,
      email,
      role,
      token,
      status: "pending",
      invitedByUserId: currentUser.id,
      createdAt: now,
      expiresAt,
      acceptedAt: null,
    });

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : "http://localhost:5000";
    const inviteLink = `${baseUrl}/invite?token=${token}`;

    res.json({ 
      success: true, 
      invite,
      inviteLink,
    });
  } catch (error: any) {
    console.error("Error creating invite:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.post("/invites/accept", requireAuth, async (req, res) => {
  try {
    const user = (req as any).currentUser;

    const parseResult = acceptInviteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request - token required" 
      });
    }

    const { token } = parseResult.data;
    const invite = await storage.getOrgInviteByToken(token);

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: `Invite has already been ${invite.status}` });
    }

    if (invite.expiresAt < Date.now()) {
      await storage.updateOrgInvite(invite.id, { status: "expired" });
      return res.status(400).json({ error: "Invite has expired" });
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ 
        error: "This invite was sent to a different email address" 
      });
    }

    const existingMember = await storage.getOrgMember(invite.orgId, user.id);
    if (existingMember) {
      return res.status(400).json({ error: "You are already a member of this organisation" });
    }

    const now = Date.now();
    await storage.createOrgMember({
      id: crypto.randomUUID(),
      orgId: invite.orgId,
      userId: user.id,
      role: invite.role,
      createdAt: now,
      updatedAt: now,
    });

    await storage.updateOrgInvite(invite.id, { 
      status: "accepted",
      acceptedAt: now,
    });

    await storage.updateUserCurrentOrg(user.id, invite.orgId);

    const org = await storage.getOrganisation(invite.orgId);

    res.json({ 
      success: true, 
      org,
      role: invite.role,
      message: `You have joined ${org?.name} as a ${invite.role}`
    });
  } catch (error: any) {
    console.error("Error accepting invite:", error);
    res.status(500).json({ error: error.message });
  }
});

orgRoutes.post("/invites/:id/revoke", requireOrgAdmin, async (req, res) => {
  try {
    const org = (req as any).currentOrg;
    const { id } = req.params;

    const invites = await storage.listOrgInvites(org.id);
    const invite = invites.find(inv => inv.id === id);

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: `Cannot revoke - invite is ${invite.status}` });
    }

    await storage.updateOrgInvite(id, { status: "revoked" });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error revoking invite:", error);
    res.status(500).json({ error: error.message });
  }
});
