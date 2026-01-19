# Organisations & Roles System

This document describes the multi-tenant organisation system with membership-based roles.

## Overview

Wyshbone uses an organisation-based multi-tenant architecture. Each user belongs to one or more organisations, and their role within each organisation determines their access permissions.

## Data Model

### Tables

#### `organisations`
- `id` (text, primary key) - UUID
- `name` (text) - Organisation name
- `created_by_user_id` (text) - User who created the org
- `created_at` (bigint) - Unix timestamp
- `updated_at` (bigint) - Unix timestamp

#### `org_members`
- `id` (text, primary key) - UUID
- `org_id` (text) - Foreign key to organisations
- `user_id` (text) - Foreign key to users
- `role` (text) - One of: 'admin', 'sales', 'driver'
- `created_at` (bigint) - Unix timestamp
- `updated_at` (bigint) - Unix timestamp

Note: Unique constraint on (org_id, user_id) to prevent duplicate memberships.

#### `org_invites`
- `id` (text, primary key) - UUID
- `org_id` (text) - Foreign key to organisations
- `email` (text) - Invited user's email
- `role` (text) - Role to assign upon acceptance
- `token` (text, unique) - Secure random token for invite link
- `status` (text) - 'pending', 'accepted', 'revoked', 'expired'
- `invited_by_user_id` (text) - Admin who created the invite
- `created_at` (bigint) - Unix timestamp
- `expires_at` (bigint) - When invite expires
- `accepted_at` (bigint, nullable) - When invite was accepted

#### `users.current_org_id`
New field added to users table to track the user's currently active organisation.

## Roles

### Admin
- Full access to all features
- Can invite new users
- Can change member roles
- Can remove members
- Can access user management

### Sales
- Access to CRM features
- Can view leads and customers
- Can use AI chat and research
- Cannot manage other users

### Driver
- Access to delivery UI only
- Can view assigned routes at `/driver/today`
- Can update stop status
- Limited to driver-specific features

## User Flows

### Signup Flow (New in v2)

Organisation creation is now integrated into the signup flow:

1. User navigates to `/auth` (signup page)
2. Fills in name, email, password, and **Organisation Name** (required)
3. On successful signup:
   - User account created
   - Organisation created with provided name
   - org_member created with role='admin'
   - `users.current_org_id` set to new org
   - Session includes orgId, orgName, membershipRole

The organisation name field is **required** during signup unless the user is accepting an invite.

### Signup via Invite Link

1. User receives invite link with token (e.g., `/auth?token=abc123`)
2. User navigates to the link
3. Signup form shows "Joining via invite" instead of org name field
4. On successful signup:
   - User account created
   - org_member created with invite's role
   - `users.current_org_id` set to invite's org
   - Invite marked as 'accepted' LAST (only after all steps succeed)

### Atomicity & Error Handling

The signup flow uses compensating cleanup to ensure atomicity:

**Order of operations (invite path):**
1. Create user account
2. Create org_member
3. Update user's current_org_id
4. Mark invite as accepted (final step)

**Order of operations (create-org path):**
1. Create user account
2. Create organisation
3. Create org_member
4. Update user's current_org_id

**On failure at any step:**
- org_member is removed (if created)
- Organisation is deleted (if created in create-org path)
- User is deleted
- Invite stays in 'pending' status (can be retried)

This ensures no orphaned records are left in the database if signup fails partway through.

### Invite Flow (for Admins)

1. Admin goes to **Settings → Team**
2. Enters email and selects role
3. System creates org_invite with secure token
4. Invite link is displayed (copied to clipboard)
5. Admin shares link with invitee
6. Invitee clicks link → redirected to signup
7. Invitee signs up with matching email
8. System accepts invite automatically

### Existing User Accepting an Invite

For users who already have an account and receive an invite:
- Navigate to the "Pending Invitations" section on the Team page
- Click "Accept" to join the organisation
- User's `current_org_id` updated to new org

### Fallback: First-Time User (Legacy)

If an existing user somehow has no organisation (legacy accounts):
1. User sees "Create Organisation" prompt at **Settings → Team**
2. Creates organisation manually
3. This path should rarely trigger for new signups

## API Endpoints

### `/api/org/me` (GET)
Returns current user's org info and pending invites.

### `/api/org/create` (POST)
Creates a new organisation. User becomes admin.
```json
{ "name": "My Company Ltd" }
```

### `/api/org/members` (GET) - Admin only
Lists all members in current org with user details.

### `/api/org/members/:userId/role` (PUT) - Admin only
Updates a member's role.
```json
{ "role": "sales" }
```

### `/api/org/members/:userId` (DELETE) - Admin only
Removes a member from the organisation.

### `/api/org/invites` (GET) - Admin only
Lists all invites for current org.

### `/api/org/invites` (POST) - Admin only
Creates a new invite.
```json
{ "email": "user@example.com", "role": "sales" }
```

### `/api/org/invites/accept` (POST)
Accepts an invite by token.
```json
{ "token": "abc123..." }
```

### `/api/org/invites/:id/revoke` (POST) - Admin only
Revokes a pending invite.

## UI Path

### How Admins Manage Roles

1. Open sidebar
2. Click **Settings** (cog icon)
3. Click **Team**
4. From the Team page:
   - View all members and their roles
   - Change member roles via dropdown
   - Invite new members via email
   - Copy invite links
   - Revoke pending invites

### Navigation

- **Settings → Team** - Main team management page
- All users can access Team page to see their org info
- Admin features (invite, role change) only visible to admins

## Security

- All org endpoints verify user's membership in the org
- Admin endpoints require `membership.role === 'admin'`
- Users can only see/manage members in their own org
- Invite tokens are cryptographically secure (32 bytes)
- Invites expire after 7 days
- Email matching is case-insensitive

## Driver/Sales Access Control

The driver and sales routes now use org membership roles as the primary source for access control:

1. **Driver routes** (`/api/driver/*`) check `org_members.role` first
2. If user has `currentOrgId`, membership role is used
3. Falls back to legacy `users.role` for backwards compatibility

This means:
- Changing a user's role in Settings → Team immediately affects their access
- Driver UI access requires membership role of 'driver' or 'admin'
- Sales features require membership role of 'sales' or 'admin'

## Migration Notes

### Legacy `users.role` Field

The global `users.role` field is now deprecated in favor of `org_members.role`. During the transition:

1. Existing users without orgs will see "Create Organisation" prompt
2. New org members get their role from the org_members table
3. Driver/sales routes check org membership first, then fall back to legacy role
4. Legacy admin checks (`user.role === 'admin'`) still work but should migrate to org membership checks

### Recommended Migration Path

1. Prompt existing users to create orgs
2. Update access control to check org membership (driver routes already done)
3. Eventually remove dependency on `users.role`
