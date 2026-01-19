import { Router } from "express";
import { storage } from "../storage";
import { userRoleSchema } from "@shared/schema";
import type { UserRole } from "@shared/schema";

export const adminRoutes = Router();

async function getAuthenticatedUserId(req: any): Promise<{ userId: string; userEmail: string } | null> {
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

  const userId = req.query.user_id || req.query.userId;
  const userEmail = req.query.user_email;
  if (userId && userEmail) {
    console.log(`[admin] Using user_id from URL params: ${userId}`);
    return { userId: userId as string, userEmail: userEmail as string };
  }

  return null;
}

async function requireAdmin(req: any, res: any, next: any) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await storage.getUserById(auth.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  (req as any).currentUser = user;
  next();
}

adminRoutes.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await storage.listAllUsers();
    
    const safeUsers = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role || "sales",
      isDemo: u.isDemo,
      createdAt: u.createdAt,
    }));
    
    res.json({ users: safeUsers });
  } catch (error: any) {
    console.error("Error listing users:", error);
    res.status(500).json({ error: error.message });
  }
});

adminRoutes.put("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    const parseResult = userRoleSchema.safeParse(role);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid role", 
        validRoles: ["admin", "sales", "driver"] 
      });
    }
    
    const user = await storage.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    await storage.updateUserRole(id, parseResult.data);
    
    const updatedUser = await storage.getUserById(id);
    
    res.json({ 
      success: true, 
      user: {
        id: updatedUser?.id,
        email: updatedUser?.email,
        name: updatedUser?.name,
        role: updatedUser?.role,
      }
    });
  } catch (error: any) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: error.message });
  }
});

adminRoutes.put("/users/me/role", async (req, res) => {
  try {
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev) {
      return res.status(403).json({ error: "Quick role switch only available in development mode" });
    }
    
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const user = await storage.getUserById(auth.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can use quick switch" });
    }
    
    const { role } = req.body;
    const parseResult = userRoleSchema.safeParse(role);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid role", 
        validRoles: ["admin", "sales", "driver"] 
      });
    }
    
    await storage.updateUserRole(auth.userId, parseResult.data);
    
    const updatedUser = await storage.getUserById(auth.userId);
    
    res.json({ 
      success: true, 
      user: {
        id: updatedUser?.id,
        email: updatedUser?.email,
        name: updatedUser?.name,
        role: updatedUser?.role,
      },
      message: `Role switched to ${parseResult.data}. Refresh the page to see changes.`
    });
  } catch (error: any) {
    console.error("Error quick switching role:", error);
    res.status(500).json({ error: error.message });
  }
});

adminRoutes.get("/dev-mode", async (_req, res) => {
  const isDev = process.env.NODE_ENV === "development";
  res.json({ isDevMode: isDev });
});
