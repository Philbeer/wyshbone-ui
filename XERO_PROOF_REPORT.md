# Xero Integration - Verified Proof Report

**Date:** January 17, 2026  
**Purpose:** Verify each "Works Today" claim with hard database evidence

---

## CRITICAL FINDING: Almost Nothing Actually Works in Production

The database queries reveal that **the previous audit claims were based on code inspection, not actual data.** Here's what the database actually shows:

---

## Proof Table

| Feature | Claim | DB Evidence | Verdict |
|---------|-------|-------------|---------|
| **OAuth & Token Refresh** | "Works with auto-refresh" | `xero_connections`: **0 rows**, `integrations`: **0 rows** | ❌ **NOT PROVEN** - No active connections exist |
| **Customer Import** | "Works with AI matching" | `crm_customers`: **0 rows total**, **0 with xero_contact_id** | ❌ **NOT PROVEN** - No customers imported |
| **Order Import** | "Works with line items" | `crm_orders`: **1 row** (TEST data), `crm_order_lines`: **0 rows** | ❌ **NOT PROVEN** - Only test data exists, no line items |
| **Product Import** | "Works" | `crm_products`: **0 rows** with xero_item_id or xero_item_code | ❌ **NOT PROVEN** - No products imported |
| **Order Export** | "Creates invoices" | `xero_import_jobs`: **0 rows** (no job history) | ⚠️ **UNTESTED** - No evidence of any exports |
| **Scheduled Sync** | "Cron runs every 5/15 min" | Code exists but no data to sync | ⚠️ **CODE EXISTS** - Unverified in production |

---

## 1. OAuth & Token Refresh

### Evidence

**Query:**
```sql
SELECT * FROM xero_connections;
```
**Result:** 0 rows

**Query:**
```sql
SELECT * FROM integrations WHERE provider = 'xero';
```
**Result:** 0 rows

### Code Path
- File: `server/routes/xero-oauth.ts`
- Functions: `getValidAccessToken()` (line 377), OAuth callback (line 231)

### Verdict
❌ **NOT PROVEN** - The code exists and looks correct, but there are **zero active Xero connections** in the database. No token refresh can be verified because no tokens exist.

---

## 2. Customer Import

### Evidence

**Query:**
```sql
SELECT COUNT(*) FROM crm_customers;
SELECT COUNT(*) FROM crm_customers WHERE xero_contact_id IS NOT NULL;
```
**Result:** 
- Total customers: **0**
- With xero_contact_id: **0**

### Code Path
- Import endpoint: `POST /api/xero/import/customers`
- File: `server/routes/xero-oauth.ts` line 640
- Function: `importCustomersFromXero()` line 676

### Verdict
❌ **NOT PROVEN** - Zero customers exist in the database. The "11 imported" claim from earlier sessions cannot be verified - data does not persist or was from a different environment.

---

## 3. Order/Invoice Import WITH Line Items

### Evidence

**Query:**
```sql
SELECT COUNT(*) FROM crm_orders;
SELECT COUNT(*) FROM crm_orders WHERE xero_invoice_id IS NOT NULL;
SELECT COUNT(*) FROM crm_order_lines;
```
**Result:**
- Total orders: **1**
- With xero_invoice_id: **1**
- Total order lines: **0**

**The single order record:**
```
id: test_ord_001
workspace_id: 07c81c20086a07f8fd8d4d991b6688d6
order_number: TEST-0001
xero_invoice_id: test-xero-id-001
status: confirmed
sync_status: synced
customer_id: cust_test_001
```

### Analysis
This is clearly **test/seed data**, not a real Xero import:
- ID starts with `test_`
- xero_invoice_id is `test-xero-id-001` (not a real Xero UUID)
- customer_id is `cust_test_001` but no customer with that ID exists

### Code Path for Line Items
- File: `server/routes/xero-sync.ts` lines 351-382
- Function: `processImportedOrders()` creates line items

### Verdict
❌ **NOT PROVEN** - Only test data exists. **Zero actual Xero imports have occurred.** Line item persistence has **never been tested** (0 rows in crm_order_lines).

---

## 4. Product Import

### Evidence

**Query:**
```sql
SELECT COUNT(*) FROM crm_products WHERE xero_item_id IS NOT NULL;
SELECT COUNT(*) FROM crm_products WHERE xero_item_code IS NOT NULL;
```
**Result:** 0 for both

### Code Path
- Endpoint: `POST /api/xero/import/products`
- File: `server/routes/xero-oauth.ts` line 1002
- Function: `importProductsFromXero()` line 1040

### Verdict
❌ **NOT PROVEN** - Zero products with Xero IDs exist.

---

## 5. Order Export

### Evidence

**Query:**
```sql
SELECT * FROM xero_import_jobs;
```
**Result:** 0 rows - no import/export job history exists

### Code Path
- Export function: `syncOrderToXero()` in `server/routes/xero-sync.ts` line 636
- Creates invoice with status: `WYSHBONE_TO_XERO_STATUS[order.status] || 'DRAFT'`
- Status mapping at line 33:
  ```javascript
  const WYSHBONE_TO_XERO_STATUS = {
    'draft': 'DRAFT',
    'pending': 'SUBMITTED',
    'confirmed': 'AUTHORISED',
    // ...
  };
  ```

### API Endpoint
- `POST /api/xero/sync/order/:orderId`
- `POST /api/crm/orders/:orderId/export-xero`

### Verdict
⚠️ **UNTESTED** - Code exists but has never been executed in production. No log evidence of any exports.

---

## 6. Scheduled Sync (Cron)

### Evidence

**File:** `server/cron/xero-sync.ts`

```javascript
syncQueueInterval = '*/5 * * * *'   // Every 5 minutes
backupPollInterval = '*/15 * * * *' // Every 15 minutes
```

**Functions:**
- `processSyncQueue()` - processes items in `xero_sync_queue` table
- `backupPollXero()` - currently just logs (incomplete implementation)

### Query
```sql
SELECT * FROM xero_sync_queue;
```
**Result:** Would need to run but likely empty based on other tables

### Verdict
⚠️ **CODE EXISTS** - Cron is defined but:
- No evidence it has ever processed anything
- `backupPollXero()` is a stub that only logs
- No activity logs table exists to verify runs

---

## 7. Why "Orders Found: 0" in API

### Root Cause Analysis

The API returns 0 orders because of **workspace ID mismatch**:

**Query:**
```sql
SELECT DISTINCT workspace_id FROM crm_orders;
```
**Result:** `07c81c20086a07f8fd8d4d991b6688d6`

**Query:**
```sql
SELECT id FROM users;
```
**Result:** Empty - no users in database

### The Problem

1. **No authenticated user session** - The `getAuthenticatedUserId()` function (line 53 of xero-oauth.ts) extracts `userId` from the session
2. **Session userId ≠ test data workspaceId** - The test order uses workspace `07c81c20086a07f8fd8d4d991b6688d6` but no user has this ID
3. **All queries filter by workspaceId** - So queries return empty results

### Code Evidence
```typescript
// server/routes/xero-oauth.ts line 53
async function getAuthenticatedUserId(req: Request, storage: IStorage) {
  // Returns userId from session
}

// All endpoints use:
const auth = await getAuthenticatedUserId(req, storage);
// Then query with auth.userId as workspaceId
```

### Fix Recommendation (DO NOT IMPLEMENT)
1. Ensure user is created and logged in before importing
2. Use consistent workspace ID (user.id) for all operations
3. Add debug logging to show which workspaceId is being queried

---

## Summary: Verified State of Integration

| Component | Status | Evidence |
|-----------|--------|----------|
| OAuth Tokens | 🔴 None stored | 0 rows in xero_connections and integrations |
| Customers | 🔴 None imported | 0 rows in crm_customers |
| Orders | 🟡 Test data only | 1 test row, no real imports |
| Order Lines | 🔴 None exist | 0 rows |
| Products | 🔴 None imported | 0 rows with xero data |
| Import Jobs | 🔴 None tracked | 0 rows in xero_import_jobs |
| Export History | 🔴 None | No evidence |
| Cron Jobs | 🟡 Code exists | Unverified execution |

---

## Confirmed Gaps (Post-Verification)

1. **No active Xero OAuth connection exists** - Must re-authenticate
2. **Zero real data has been imported** - All previous "11 imported" was ephemeral or different environment
3. **Line items have never been persisted** - 0 rows despite code existing
4. **No user exists in users table** - Session/workspace mismatch is inevitable
5. **Webhook registration still missing** - Confirmed
6. **Backup polling is a stub** - Only logs, doesn't fetch data

---

## Next Steps Required

Before the integration can work:

1. **Create a user account** (or verify one exists via Replit Auth)
2. **Connect Xero OAuth** using that user's session
3. **Run a real import** and verify data persists
4. **Test export** with a real order
5. **Fix any errors** that emerge from real usage

The code appears structurally complete, but **it has never been successfully executed end-to-end in this environment.**
