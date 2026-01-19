# Driver App Audit Report

**Generated:** January 19, 2026  
**Purpose:** Investigate existing data model for orders/customers/delivery and compare to proposed Driver UI V1

---

## Executive Summary

The Wyshbone codebase already has **robust delivery route infrastructure** that closely matches the proposed Driver V1 requirements. The `delivery_routes` and `route_stops` tables provide 90%+ of the target DeliveryStop model, including sequence numbers, addresses, contact info, delivery instructions, status tracking, and proof-of-delivery fields (photo URL, signature, recipient name). **No new tables are required** for a minimum viable Driver app - the existing `route_stops` table can serve as DeliveryStop directly.

Key gaps: (1) No formal DRIVER role in the users table - currently uses `roleHint` free-text field, (2) No multi-photo support for POD (single `delivery_photo_url` only), (3) No dedicated `/driver/*` routes or mobile-optimized UI pages exist yet.

**Recommended approach:** Derive driver stops from existing `route_stops` table, add a `role` enum column to `users`, create `/driver/*` API endpoints filtering by `driver_id`, and build mobile-first React pages.

---

## Current Reality: What Orders/Customers Contain Today

### Orders (`crm_orders`)
- Full order lifecycle: `draft` → `confirmed` → `dispatched` → `delivered` → `cancelled`
- Links to customer via `customer_id` (FK to `crm_customers`)
- Has `delivery_date` (bigint timestamp) - when delivery is expected
- Has `delivery_run_id` (text) - links to `delivery_routes.id`
- Xero integration fields for invoice sync (`xero_invoice_id`, `xero_status`, etc.)
- VAT-aware pricing with line-item totals

### Order Lines (`crm_order_lines`)
- Linked to orders via `order_id`
- Contains product reference, quantity, pricing
- Can generate items summary for driver view

### Customers (`crm_customers`)
- **Address fields present:** `address_line1`, `address_line2`, `city`, `postcode`, `country`
- **Phone present:** `phone` column exists
- **Contact name:** `primary_contact_name` available
- **Email present:** `email` column exists
- Xero sync integration (`xero_contact_id`)

### Delivery Runs (Legacy) (`crm_delivery_runs`)
- Simpler precursor to delivery_routes
- Has `driver_name` (text, not user FK), `vehicle`, `scheduled_date`, `status`
- Statuses: `planned`, `in_progress`, `completed`, `cancelled`

### Delivery Routes (`delivery_routes`) - **PRIMARY ROUTE TABLE**
- **Already has driver assignment:** `driver_id`, `driver_name`, `driver_phone`, `driver_email`
- **Route status:** `draft`, `optimized`, `assigned`, `in_progress`, `completed`, `cancelled`
- **Date:** `delivery_date` (bigint timestamp)
- **Metrics:** `total_stops`, `completed_stops`, `total_distance_miles`, `estimated_duration_minutes`
- **Start/end locations:** `start_latitude`, `start_longitude`, `end_latitude`, `end_longitude`
- **Timing:** `scheduled_start_time`, `actual_start_time`, `actual_end_time`
- **Optimization:** `is_optimized`, `encoded_polyline` for map display

### Route Stops (`route_stops`) - **MATCHES DeliveryStop TARGET**
- **Sequence:** `sequence_number`, `original_sequence_number`
- **Customer/venue:** `customer_id`, `customer_name`
- **Address:** `address_line1`, `address_line2`, `city`, `postcode`, `country`, `latitude`, `longitude`
- **Contact:** `contact_name`, `contact_phone`, `contact_email`
- **Instructions:** `delivery_instructions`, `access_notes`
- **Status:** `pending`, `en_route`, `arrived`, `delivered`, `failed`, `skipped`
- **Timing:** `estimated_arrival_time`, `actual_arrival_time`, `delivered_at`
- **POD fields:** `recipient_name`, `delivery_notes`, `delivery_photo_url`, `signature_url`
- **Failure handling:** `failure_reason`, `failure_notes`, `rescheduled_to_route_id`
- **Order link:** `order_id`, `order_number`, `item_count`, `total_value`

---

## Existing Schema (Tables + Key Columns)

### Core Tables for Driver App

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Authentication, user profiles | `id`, `email`, `role_hint` (free text), `subscription_tier` |
| `delivery_routes` | Route/run management | `id`, `driver_id`, `driver_name`, `delivery_date`, `status`, `total_stops`, `completed_stops` |
| `route_stops` | Individual delivery stops | `id`, `route_id`, `order_id`, `customer_id`, `sequence_number`, `status`, `delivery_photo_url`, `signature_url`, `recipient_name`, `delivery_notes`, `failure_reason` |
| `crm_orders` | Order data | `id`, `customer_id`, `order_number`, `status`, `delivery_date`, `delivery_run_id` |
| `crm_order_lines` | Order line items | `id`, `order_id`, `product_id`, `quantity`, `description` |
| `crm_customers` | Customer/venue data | `id`, `name`, `phone`, `address_line1`, `city`, `postcode` |
| `delivery_bases` | Depot/start points | `id`, `name`, `address`, `latitude`, `longitude`, `is_default` |

### Database Connection
- **Primary:** Supabase Postgres (connection string in `DATABASE_URL`)
- Drizzle ORM used for schema management and queries
- Schema defined in `shared/schema.ts`

---

## Existing Endpoints/Services Relevant to Orders

### Route Planner API (`server/routes/route-planner.ts`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/delivery-bases` | GET | List all delivery bases |
| `/api/delivery-bases/:id` | GET/PUT/DELETE | Manage individual base |
| `/api/routes/:workspaceId` | GET | List all routes for workspace |
| `/api/routes/detail/:id` | GET | Get route with all stops |
| `/api/routes/create` | POST | Create route from order IDs |
| `/api/routes/:id/optimize` | PUT | Optimize route sequence |
| `/api/routes/:id/assign-driver` | PUT | Assign driver to route |
| `/api/routes/:id/start` | PUT | Start route (driver begins) |
| `/api/routes/stops/:id/status` | PUT | Update stop status |

### CRM Orders API (`server/routes.ts`)
- Standard CRUD for orders at `/api/crm/orders`
- Order lines at `/api/crm/order-lines`
- Customer endpoints at `/api/crm/customers`

### Route Optimization Service (`server/services/RouteOptimizationService.ts`)
- Google Maps integration for route optimization
- Geocoding for addresses
- Distance/duration calculations

---

## Role/Auth Findings

### Current State
- **No formal DRIVER role exists** in the `users` table
- `role_hint` is a free-text field used for personalization hints (e.g., "Founder", "Sales", "Fundraising")
- No enum or constraint on roles
- Authentication uses session-based auth with `x-session-id` header
- No role-based access control middleware exists

### How to Gate DRIVER Access
1. **Option A (Minimal):** Add `role` enum column to `users` table: `['admin', 'sales', 'driver', 'viewer']`
2. **Option B (Existing):** Use `role_hint` field and check for "driver" (case-insensitive)
3. Create middleware that checks user role and restricts `/driver/*` routes
4. Driver UI should only show routes where `delivery_routes.driver_id = current_user_id`

### Redirect Strategy
- Unauthenticated users → `/auth`
- Non-driver users accessing `/driver/*` → `/crm/dashboard` or 403
- Drivers logging in → `/driver/today`

---

## Gap Analysis vs Driver V1 Target

### Target Objects from Proposal

| Target Object | Field | Existing Mapping | Gap Status |
|---------------|-------|------------------|------------|
| **DeliveryStop** | route_id | `route_stops.route_id` | PRESENT |
| | sequence_number | `route_stops.sequence_number` | PRESENT |
| | venue/customer | `route_stops.customer_id`, `customer_name` | PRESENT |
| | address | `address_line1`, `city`, `postcode`, `latitude`, `longitude` | PRESENT |
| | phone | `route_stops.contact_phone` | PRESENT |
| | instructions | `route_stops.delivery_instructions`, `access_notes` | PRESENT |
| | items_summary | Needs JOIN to `crm_order_lines` | PARTIAL (can derive) |
| | status | `route_stops.status` | PRESENT |
| | arrived_at | `route_stops.actual_arrival_time` | PRESENT |
| | completed_at | `route_stops.delivered_at` | PRESENT |
| | driver_notes | `route_stops.delivery_notes` | PRESENT |
| **ProofOfDelivery** | stop_id | Can use `route_stops.id` | PRESENT (embedded) |
| | photo_urls (1-3) | `route_stops.delivery_photo_url` | PARTIAL (single photo) |
| | received_by_name | `route_stops.recipient_name` | PRESENT |
| | signature | `route_stops.signature_url` | PRESENT |
| | created_at | `route_stops.delivered_at` | PRESENT |
| **DeliveryRoute** | date | `delivery_routes.delivery_date` | PRESENT |
| | driver_user_id | `delivery_routes.driver_id` | PRESENT |
| | status | `delivery_routes.status` | PRESENT |
| | ordered stops | via `route_stops.sequence_number` | PRESENT |

### Target Screens

| Screen | Gap Status | Notes |
|--------|------------|-------|
| `/driver/today` | MISSING | No driver UI pages exist. Need new React page. |
| `/driver/stop/:id` | MISSING | Need new React page with stop detail + actions. |
| Outcome modal (Delivered/Partial/Failed) | MISSING | Need modal component with photo upload. |
| Navigate button | MISSING | Can use existing lat/lng to generate Google Maps link. |

### Summary by Category

**A) What existing tables/fields map directly to targets:**
- `delivery_routes` maps to DeliveryRoute (date, driver_id, status)
- `route_stops` maps to DeliveryStop (sequence, address, contact, instructions, status, timing, POD fields)
- Customer phone/address from `crm_customers`
- Order details from `crm_orders` + `crm_order_lines`

**B) What is missing completely:**
- `/driver/*` React pages and routes
- Formal DRIVER role in users table (only `role_hint` free-text)
- Multi-photo POD support (currently single `delivery_photo_url`)
- "Partial delivery" status (current statuses are binary: delivered/failed)
- Photo upload endpoint/service

**C) What is partially present but needs reshaping:**
- Items summary: exists in order_lines but needs JOIN/aggregation for stop view
- Photo POD: single URL field exists, needs array or separate POD table for multi-photo
- Role system: `role_hint` exists but isn't enforced; needs proper enum

**D) Unsafe assumptions:**
- SAFE: Customers have addresses (address_line1 exists, nullable but typically populated)
- SAFE: Customers have phone (phone column exists)
- CAUTION: Not all customers may have lat/lng geocoded (geocoding happens in route creation)
- CAUTION: Orders don't inherently know their delivery address - uses customer's address
- CAUTION: `delivery_photo_url` is a single text field, not an array

---

## Recommended "Minimum Viable Approach"

### Option 1: Derive DeliveryStops from Existing route_stops (RECOMMENDED)

**Rationale:** The existing `route_stops` table already contains 95% of the DeliveryStop requirements. No new tables needed.

**Steps:**
1. **Add role to users table:** Add `role` column with enum `['admin', 'sales', 'driver', 'viewer']` or validate `role_hint`
2. **Create driver API routes:** New file `server/routes/driver.ts` with:
   - `GET /api/driver/today` - Returns routes/stops for logged-in driver where `delivery_date = today`
   - `GET /api/driver/stop/:id` - Returns stop detail with order lines
   - `PUT /api/driver/stop/:id/arrive` - Mark arrived
   - `PUT /api/driver/stop/:id/complete` - Mark delivered with POD
   - `PUT /api/driver/stop/:id/fail` - Mark failed with reason
3. **Create driver React pages:**
   - `client/src/pages/driver/today.tsx` - Today's stops list
   - `client/src/pages/driver/stop.tsx` - Stop detail + actions
4. **For multi-photo POD:** Either:
   - Store JSON array in `delivery_photo_url` (quick hack)
   - Add `pod_photos` JSONB column to `route_stops`
   - Create separate `proof_of_delivery` table (cleaner but more work)

**Pros:** Fast implementation, no migrations, leverages existing optimization/geocoding  
**Cons:** POD photos limited to workaround until proper solution

### Option 2: Create Dedicated DeliveryStop Table

**Rationale:** Cleaner separation if delivery tracking needs to diverge from route planning.

**Not recommended for V1** because:
- Duplicates existing `route_stops` functionality
- Requires data migration/sync
- Adds complexity without immediate benefit

---

## Risks / Unknowns to Verify Next

1. **Photo upload infrastructure:** Need to verify if file upload service exists or needs Supabase Storage / S3
2. **Geocoding coverage:** Check how many existing customers have lat/lng populated
3. **Mobile responsiveness:** Existing CRM pages may need audit for mobile-first design patterns
4. **Offline support:** Driver app may need offline capability - PWA/service worker not currently present
5. **Push notifications:** No infrastructure for notifying drivers of new assignments
6. **Real-time updates:** WebSocket exists but unclear if connected to route updates
7. **Xero sync timing:** Orders from Xero may not have delivery_date set - need default handling

---

## File Reference Index

| Category | Key Files |
|----------|-----------|
| Schema definitions | `shared/schema.ts` (lines 1619-1819 for routes/stops) |
| Storage/DB methods | `server/storage.ts` |
| Route planner API | `server/routes/route-planner.ts` |
| Route optimization | `server/services/RouteOptimizationService.ts` |
| Main routes | `server/routes.ts` |
| CRM pages | `client/src/pages/crm/*.tsx` |
| Auth handling | `server/routes.ts` (session-based) |

---

## Conclusion

The Wyshbone codebase is **well-prepared** for a Driver app MVP. The core data model exists - `delivery_routes` and `route_stops` provide the foundation. Primary work is:

1. **UI layer:** Build 2-3 mobile-first React pages under `/driver/*`
2. **Role enforcement:** Add driver role check to users
3. **Photo handling:** Decide on multi-photo approach (JSONB vs separate table)
4. **API endpoints:** Create driver-specific endpoints that filter by `driver_id`

Estimated effort: **2-3 days for functional MVP** assuming photo upload uses simple JSONB approach.
