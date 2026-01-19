# Driver App MVP - Acceptance Tests

**Generated:** January 19, 2026  
**Purpose:** Step-by-step acceptance tests for verifying the Driver UI MVP functionality

---

## Prerequisites

### 1. Set Up Test Driver User

Before testing, you need a user with driver role:

```sql
-- Set role_hint to "driver" for a test user
UPDATE users SET role_hint = 'driver' WHERE email = 'your-test-email@example.com';
```

### 2. Create Test Route with Stops

Use the Route Planner to:
1. Create a delivery route with today's date
2. Assign the test driver user to the route
3. Add several stops with orders

Or via API:
```bash
# Create a route assigned to driver
POST /api/routes/create
{
  "name": "Test Route",
  "deliveryDate": <today's timestamp>,
  "orderIds": ["order1", "order2"],
  "optimizeImmediately": false
}

# Assign driver
PUT /api/routes/{routeId}/assign-driver
{
  "driverId": "<driver_user_id>",
  "driverName": "Test Driver",
  "driverPhone": "+44123456789",
  "driverEmail": "driver@test.com"
}
```

---

## Acceptance Tests

### Test 1: Driver Role Check

**Objective:** Verify non-drivers cannot access driver pages

**Steps:**
1. Log in as a user WITHOUT "driver" in role_hint
2. Navigate to `/driver/today`
3. **Expected:** Redirected to home page OR shown "Not authorized as driver" error

**API Test:**
```bash
GET /api/driver/check-role
# Expected for non-driver: { "isDriver": false }
# Expected for driver: { "isDriver": true }
```

---

### Test 2: Today's Routes Display

**Objective:** Verify driver can see their assigned routes for today

**Steps:**
1. Log in as test driver user
2. Navigate to `/driver/today`
3. **Expected:** 
   - Header shows "Today's Deliveries" and driver name
   - Progress indicator shows "X / Y Stops completed"
   - Each assigned route is displayed with name and stop count
   - Stops are sorted by sequence number
   - Each stop shows: sequence number, customer name, address, status badge

---

### Test 3: Stop Detail View

**Objective:** Verify stop detail page shows all required information

**Steps:**
1. From `/driver/today`, tap a stop to open detail view
2. Navigate to `/driver/stop/{stopId}`
3. **Expected:**
   - Header shows stop sequence number and customer name
   - Address card shows full address with copy and navigate buttons
   - Contact card shows contact name and phone (if available)
   - Instructions card shows delivery instructions and access notes (if available)
   - Items section shows order line items or fallback item count
   - Action buttons at bottom (Skip, Failed, Delivered)

---

### Test 4: Mark Stop as Arrived

**Objective:** Verify "I've Arrived" button works correctly

**Steps:**
1. Open a pending stop detail page
2. Tap "I've Arrived" button
3. **Expected:**
   - Status changes from "pending" to "arrived"
   - `actual_arrival_time` is set in database
   - Page refreshes showing updated status

**API Test:**
```bash
PUT /api/driver/stop/{stopId}/arrive
# Expected: { "success": true, "stop": { "status": "arrived", ... } }
```

---

### Test 5: Complete Delivery

**Objective:** Verify delivery completion flow

**Steps:**
1. Open a stop detail page (pending or arrived)
2. Tap "Delivered" button
3. In confirmation dialog:
   - Enter recipient name (optional)
   - Enter delivery notes (optional)
4. Tap "Confirm Delivery"
5. **Expected:**
   - Redirected to `/driver/today`
   - Stop shows status "delivered" (green badge)
   - Route progress counter increments
   - In database: `status='delivered'`, `delivered_at` set, `recipient_name` and `delivery_notes` saved

**API Test:**
```bash
PUT /api/driver/stop/{stopId}/deliver
{
  "recipientName": "John Smith",
  "deliveryNotes": "Left at reception"
}
# Expected: { "success": true, "stop": { "status": "delivered", ... } }
```

---

### Test 6: Mark Stop as Failed

**Objective:** Verify failed delivery flow with required fields

**Steps:**
1. Open a stop detail page
2. Tap "Failed" button
3. In confirmation dialog:
   - Select failure reason from dropdown (required)
   - Enter failure notes (required)
4. Tap "Mark Failed"
5. **Expected:**
   - Redirected to `/driver/today`
   - Stop shows status "failed" (red badge)
   - In database: `status='failed'`, `failure_reason` and `failure_notes` saved

**API Test - Valid:**
```bash
PUT /api/driver/stop/{stopId}/fail
{
  "failureReason": "customer_unavailable",
  "failureNotes": "No answer after 10 minutes"
}
# Expected: { "success": true, "stop": { "status": "failed", ... } }
```

**API Test - Missing Fields:**
```bash
PUT /api/driver/stop/{stopId}/fail
{
  "failureReason": "customer_unavailable"
}
# Expected: { "error": "failureNotes is required" }
```

---

### Test 7: Skip Stop

**Objective:** Verify skip functionality with confirmation

**Steps:**
1. Open a stop detail page
2. Tap "Skip" button
3. In confirmation dialog, tap "Skip Stop"
4. **Expected:**
   - Redirected to `/driver/today`
   - Stop shows status "skipped" (yellow badge)
   - In database: `status='skipped'`

**API Test:**
```bash
PUT /api/driver/stop/{stopId}/skip
# Expected: { "success": true, "stop": { "status": "skipped" } }
```

---

### Test 8: Navigation Integration

**Objective:** Verify external maps navigation works

**Steps:**
1. From `/driver/today`, tap the navigation icon on a stop
2. **Expected:** Opens Google Maps with destination address
3. Alternative: From stop detail, tap Navigate button
4. **Expected:** Opens Google Maps with lat/long or address query

---

### Test 9: Call Contact

**Objective:** Verify phone call functionality

**Steps:**
1. Open stop detail for a stop with contact phone number
2. Tap "Call" button next to contact info
3. **Expected:** Device phone dialer opens with the contact number

---

### Test 10: Copy Address

**Objective:** Verify address copy functionality

**Steps:**
1. Open stop detail page
2. Tap copy icon next to address
3. **Expected:** Address copied to clipboard, toast notification shown

---

### Test 11: Ownership Enforcement

**Objective:** Verify drivers can only access their own assigned routes

**Steps:**
1. Log in as Driver A
2. Note a stop ID from Driver B's route
3. Navigate to `/driver/stop/{otherDriverStopId}`
4. **Expected:** Error "Not your assigned route" and redirect

**API Test:**
```bash
GET /api/driver/stop/{otherDriverStopId}
# Expected: 403 { "error": "Not your assigned route" }
```

---

### Test 12: Route Completion

**Objective:** Verify route auto-completes when all stops are done

**Steps:**
1. Open `/driver/today` with a route that has multiple stops
2. Mark each stop as delivered, failed, or skipped
3. After last stop is completed:
4. **Expected:** 
   - Route status changes to "completed" in database
   - Route `actual_end_time` is set

---

## API Endpoint Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/driver/check-role` | GET | Check if current user is a driver |
| `/api/driver/today` | GET | Get today's routes and stops for driver |
| `/api/driver/stop/:id` | GET | Get stop detail with items |
| `/api/driver/stop/:id/arrive` | PUT | Mark stop as arrived |
| `/api/driver/stop/:id/deliver` | PUT | Mark stop as delivered |
| `/api/driver/stop/:id/fail` | PUT | Mark stop as failed |
| `/api/driver/stop/:id/skip` | PUT | Mark stop as skipped |

---

## Known Limitations (MVP)

1. **Single photo only:** `delivery_photo_url` is a single text field, not an array. Multi-photo POD requires schema change.

2. **No photo upload service:** Photo upload to storage not implemented in MVP. Would require Supabase Storage integration.

3. **No signature capture:** Signature pad not implemented. Would require canvas component.

4. **Temporary role gating:** Uses `role_hint` text field instead of formal role enum. Production should migrate to proper RBAC.

5. **No route start confirmation:** Route automatically shows as driver's even without explicit "Start Route" action.

6. **No offline support:** All operations require network connectivity.

---

## Future Enhancements

1. Add photo upload to Supabase Storage for POD
2. Implement signature canvas component
3. Add proper RBAC with driver role enum
4. Implement route start/end confirmation
5. Add offline-first with sync capability
6. Add push notifications for new route assignments
