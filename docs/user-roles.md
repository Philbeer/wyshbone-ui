# User Roles System

**Created:** January 19, 2026  
**Purpose:** Document the user role system for access control across the Wyshbone platform

---

## Overview

The Wyshbone platform uses a role-based access control (RBAC) system to manage user permissions. Each user has a single role that determines which features and areas of the application they can access.

## Available Roles

| Role | Description | Access Areas |
|------|-------------|--------------|
| `admin` | Full platform access | All features, user management, driver UI, CRM |
| `sales` | Standard business user | CRM, chat, leads, nudges, events (default role) |
| `driver` | Delivery driver | Driver UI only (/driver/*) |

## Role Details

### Admin (`admin`)
- **Full access** to all platform features
- Can manage other users' roles via `/admin/users`
- Can access driver UI for testing/impersonation
- Can access CRM, chat, leads, and all business features
- Can use the Quick Role Switch in dev mode for testing

### Sales (`sales`)
- Default role for new users
- Access to CRM, customers, orders, products
- Access to chat, leads, nudges, events
- Access to deep research and scheduled monitors
- **Cannot** access driver UI
- **Cannot** access user management

### Driver (`driver`)
- Limited to driver UI only (`/driver/today`, `/driver/stop/:id`)
- Can view assigned routes for today
- Can mark stops as arrived, delivered, failed, or skipped
- **Cannot** access CRM, chat, or admin features
- Will be redirected to `/driver/today` when accessing main app

## Database Schema

The role is stored in the `users` table:

```sql
role TEXT NOT NULL DEFAULT 'sales'
```

Valid values: `'admin'`, `'sales'`, `'driver'`

## API Endpoints

### Admin Endpoints (requires `admin` role)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET | List all users with their roles |
| `/api/admin/users/:id/role` | PUT | Update a user's role |
| `/api/admin/users/me/role` | PUT | Quick switch own role (dev mode only) |
| `/api/admin/dev-mode` | GET | Check if dev mode is enabled |

### Driver Endpoints (requires `driver` or `admin` role)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/driver/check-role` | GET | Check if user can access driver UI |
| `/api/driver/today` | GET | Get today's assigned routes |
| `/api/driver/stop/:id` | GET | Get stop details |
| `/api/driver/stop/:id/arrive` | PUT | Mark stop as arrived |
| `/api/driver/stop/:id/deliver` | PUT | Complete delivery |
| `/api/driver/stop/:id/fail` | PUT | Mark stop as failed |
| `/api/driver/stop/:id/skip` | PUT | Skip a stop |

## UI Pages

### Admin User Management
- **Path:** `/admin/users`
- **Access:** Admin only
- **Features:**
  - View all users with their current roles
  - Change any user's role via dropdown
  - Quick Role Switch for testing (dev mode only)

### Driver UI
- **Paths:** `/driver/today`, `/driver/stop/:id`
- **Access:** Driver or Admin
- **Features:**
  - View today's delivery routes
  - Navigate to stops
  - Complete deliveries with POD

## Implementation Details

### Server-Side Enforcement

All role checks happen server-side to prevent bypassing:

```typescript
// Driver route guard
async function isDriverOrAdmin(userId: string): Promise<boolean> {
  const user = await storage.getUserById(userId);
  if (!user) return false;
  return user.role === "driver" || user.role === "admin";
}

// Admin route guard
async function requireAdmin(req, res, next) {
  const user = await storage.getUserById(auth.userId);
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
```

### Client-Side Routing

The client checks roles for conditional UI elements but the server enforces access:

```typescript
// Quick role switch only visible in dev mode
{isDevMode && user?.role === "admin" && (
  <QuickRoleSwitch />
)}
```

## Migration from role_hint

The previous system used `role_hint` (a free-form text field) for personalization. The new `role` field is a formal enum-like column for access control.

**Backfill rule:** Users with `role_hint` containing "driver" were migrated to `role='driver'`.

**Legacy:** The `role_hint` field remains for personalization purposes (e.g., "Founder", "Sales Manager") but is no longer used for access control.

## Quick Role Switch (Dev Mode)

For testing purposes, admins can temporarily switch their own role:

1. Navigate to `/admin/users`
2. Use the "Quick Role Switch" panel (only visible in dev mode)
3. Click a role button to switch
4. Page will reload with the new role in effect

**Security:** This feature is disabled in production (`process.env.NODE_ENV !== 'development'`).

## Future Considerations

1. **Additional roles:** Consider adding `viewer` for read-only access
2. **Fine-grained permissions:** For complex scenarios, a permission matrix may be needed
3. **Role hierarchies:** Currently roles are flat; hierarchy could be added
4. **Audit logging:** Track who changed roles and when
