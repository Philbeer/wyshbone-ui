# Xero ↔ Wyshbone Integration Audit Report

**Date:** January 17, 2026  
**Scope:** End-to-end audit of Xero integration  
**Status:** Audit Only (no changes made)

---

## Executive Summary

The Xero integration is **partially implemented** with full OAuth flow, import functionality, and a foundation for two-way sync. However, there are **critical gaps** preventing the desired workflow of "Wyshbone creates Drafts → Xero approves/pays → Wyshbone reflects status."

| Feature | Status | Notes |
|---------|--------|-------|
| OAuth & Authentication | ✅ Working | Tokens stored, auto-refresh implemented |
| Customer Import (Xero→Wyshbone) | ✅ Working | AI entity matching available |
| Order/Invoice Import (Xero→Wyshbone) | ✅ Working | With line items |
| Product Import (Xero→Wyshbone) | ✅ Working | Items synced |
| Order Export (Wyshbone→Xero) | ⚠️ Partial | Creates invoices but status mapping has issues |
| Status Sync (Xero→Wyshbone) | ⚠️ Incomplete | Webhook handlers exist but not fully wired |
| Webhooks | ⚠️ Implemented but unregistered | Code exists, but Xero webhook subscription unclear |
| Scheduled Sync | ✅ Cron exists | 5-min queue processing, 15-min backup poll |

---

## 1. Authentication & Tenants

### 1.1 Token Storage

**Location:** Two parallel systems:

1. **`xero_connections` table** (Primary - Recommended)
   - File: `shared/schema.ts` lines 1851-1870
   - Schema:
     ```
     id: serial (PK)
     workspace_id: text (unique) - maps to user.id
     tenant_id: varchar(100)
     tenant_name: varchar(200)
     access_token: text
     refresh_token: text
     token_expires_at: timestamp
     last_import_at: timestamp
     is_connected: boolean
     ```

2. **`integrations` table** (Legacy fallback)
   - Used when `xero_connections` record not found
   - Stores tokens in `accessToken`, `refreshToken`, `expiresAt` columns
   - Metadata contains `tenantId`, `tenantName`

### 1.2 Tenant Selection

- **Per-workspace/user:** The `workspaceId` equals the user's `id`
- Only the **first tenant** returned from `/connections` is used
- No UI for multi-tenant selection if a Xero org has multiple organizations

### 1.3 Token Refresh

**Implementation:** `server/routes/xero-oauth.ts` (lines 377-417, 549-635)

- Automatic refresh when `Date.now() >= expiresAt`
- Refreshes via `POST https://identity.xero.com/connect/token` with `grant_type=refresh_token`
- Updates stored tokens after successful refresh
- **Both** `xero_connections` and `integrations` tables have refresh logic (code duplication)

### 1.4 Key Files

| File | Purpose |
|------|---------|
| `server/routes/xero-oauth.ts` | OAuth flow, connect/disconnect, token refresh |
| `server/routes/xero-sync.ts` | Two-way sync, webhooks, CRUD operations |
| `server/lib/xero-import.ts` | Import logic with AI entity matching |
| `server/cron/xero-sync.ts` | Scheduled sync jobs |
| `client/src/features/xero/useXero.ts` | React hooks for Xero operations |

---

## 2. Imports (Xero → Wyshbone)

### 2.1 Customers/Contacts

**Endpoints Used:**
- `GET /api/xero/import/customers` → Simple import
- `GET /api/xero/import/customers-ai` → AI-powered entity matching

**Xero API Called:**
- `GET https://api.xero.com/api.xro/2.0/Contacts`

**Fields Mapped:**

| Xero Field | Wyshbone Field (crm_customers) |
|------------|-------------------------------|
| ContactID | xero_contact_id |
| Name | name |
| EmailAddress | email |
| Phones[].PhoneNumber | phone |
| Addresses[STREET].AddressLine1 | address_line1 |
| Addresses[STREET].City | city |
| Addresses[STREET].PostalCode | postcode |
| Addresses[STREET].Country | country |

**Idempotency:**
- Uses `xero_contact_id` to check for existing records via `getCustomerByXeroContactId()`
- Skips if already imported, or updates existing record

### 2.2 Orders/Invoices

**Endpoint:** `POST /api/integrations/xero/import/orders`

**Xero API Called:**
- `GET https://api.xero.com/api.xro/2.0/Invoices`
- Uses `Type=ACCREC` (accounts receivable invoices)
- Date filter: `Date >= [yearsBack ago]` (default 2 years)
- Pagination: Fetches up to 100 at a time, loops through pages

**Fields Mapped:**

| Xero Field | Wyshbone Field (crm_orders) |
|------------|----------------------------|
| InvoiceID | xero_invoice_id |
| InvoiceNumber | xero_invoice_number / order_number |
| Date | order_date |
| DueDate | delivery_date |
| Status | status (mapped via XERO_TO_WYSHBONE_STATUS) |
| SubTotal | subtotal_ex_vat (×100 for pence) |
| TotalTax | vat_total (×100) |
| Total | total_inc_vat (×100) |
| Contact.ContactID | customer_id (via lookup) |

**Status Mapping (Xero → Wyshbone):**
```javascript
const XERO_TO_WYSHBONE_STATUS = {
  'DRAFT': 'draft',
  'SUBMITTED': 'pending',
  'AUTHORISED': 'confirmed',
  'PAID': 'delivered',
  'VOIDED': 'cancelled',
};
```

**Line Items:** ✅ **Confirmed - Fetched and persisted**

Located in `server/routes/xero-sync.ts` lines 351-382:
- Each invoice's `lineItems` array is iterated
- Creates records in `crm_order_lines` table
- Maps: `description`, `quantity`, `unitAmount` (×100), `lineItemID`
- Attempts to match `itemCode` to existing products

### 2.3 Products/Items

**Endpoint:** `POST /api/integrations/xero/import/products`

**Xero API Called:**
- `GET https://api.xero.com/api.xro/2.0/Items`

**Fields Mapped:**

| Xero Field | Wyshbone Field (crm_products) |
|------------|------------------------------|
| ItemID | xero_item_id |
| Code | xero_item_code / sku |
| Name | name |
| SalesDetails.UnitPrice | default_unit_price_ex_vat (×100) |
| IsSold | is_active |

**Idempotency:** Uses `xero_item_id` to detect duplicates

### 2.4 Multi-Workspace Safety

- All import functions receive `workspaceId` parameter
- All storage queries include `workspaceId` in WHERE clauses
- Customer/order lookup includes workspace filter: `getCustomerByXeroContactId(contactId, workspaceId)`

---

## 3. Exports (Wyshbone → Xero)

### 3.1 Current Capability: ✅ YES - Can Create Invoices

**Implementation:** `server/routes/xero-sync.ts` lines 636-718

**Trigger Points:**
1. Manual export via UI button (`POST /api/crm/orders/:orderId/export-xero`)
2. Sync queue processing
3. `POST /api/xero/sync/order/:orderId`

**What Gets Created:**

```javascript
const xeroInvoice = {
  type: 'ACCREC',
  contact: { contactID: customer.xeroContactId },
  date: order.orderDate,
  dueDate: order.deliveryDate,
  status: WYSHBONE_TO_XERO_STATUS[order.status] || 'DRAFT',
  lineItems: orderLines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unitAmount: line.unitPriceExVat / 100,
  })),
};
```

**Status Mapping (Wyshbone → Xero):**
```javascript
const WYSHBONE_TO_XERO_STATUS = {
  'draft': 'DRAFT',
  'pending': 'SUBMITTED',
  'confirmed': 'AUTHORISED',
  'delivered': 'PAID',
  'dispatched': 'AUTHORISED',
  'cancelled': 'VOIDED',
};
```

### 3.2 Known Issues with Export

1. **Status Mapping Problem:** If a Wyshbone order is in `draft` status, it correctly creates as `DRAFT` in Xero. However, mapping `confirmed` → `AUTHORISED` may fail because Xero requires specific workflows for authorization.

2. **Customer Must Exist in Xero First:** The code calls `syncCustomerToXero()` if `xeroContactId` is missing, which can fail silently.

3. **Line Items Missing Tax Codes:** Xero line items don't include `accountCode` or `taxType`, which may cause Xero validation errors.

4. **No Account Mapping:** No Xero account codes are being set for revenue recognition.

---

## 4. Webhooks

### 4.1 Implementation Status: ⚠️ **Code Exists, Webhook Registration Unclear**

**Endpoint:** `POST /api/xero/webhooks/xero`

**File:** `server/routes/xero-sync.ts` lines 171-233

### 4.2 Events Handled

| Event Category | Event Types | Handler |
|----------------|-------------|---------|
| INVOICE | CREATE, UPDATE, DELETE | `handleInvoiceWebhook()` |
| CONTACT | CREATE, UPDATE | `handleContactWebhook()` |
| ITEM | CREATE, UPDATE | `handleItemWebhook()` |

### 4.3 Signature Verification

```javascript
function verifyXeroWebhookSignature(payload: string, signature: string): boolean {
  if (!XERO_WEBHOOK_KEY) {
    // Accepts all in dev mode if key not set
    return process.env.NODE_ENV === 'development';
  }
  const hash = createHmac('sha256', XERO_WEBHOOK_KEY)
    .update(payload)
    .digest('base64');
  return hash === signature;
}
```

- Uses `x-xero-signature` header
- Requires `XERO_WEBHOOK_KEY` environment variable

### 4.4 Webhook Processing Flow

1. Verify signature
2. Lookup workspace by `tenantId` via `getXeroConnectionByTenantId()`
3. Check idempotency via `getWebhookEvent(eventId)`
4. Store event in `xero_webhook_events` table
5. Process asynchronously (fetch updated entity, update local record)
6. Mark as processed via `markWebhookProcessed()`

### 4.5 What Gets Stored

**Table:** `xero_webhook_events`
- `event_id` (unique)
- `event_type` (CREATE/UPDATE/DELETE)
- `event_category` (INVOICE/CONTACT/ITEM)
- `resource_id`
- `tenant_id`
- `event_date`
- `processed` (boolean)
- `processed_at`
- `error_message`

### 4.6 Missing: Webhook Registration

**No evidence of Xero webhook subscription being registered.** Xero requires:
1. Register webhook URL in Xero Developer Portal
2. Set up webhook key for signature verification
3. Respond to Intent to Receive validation

---

## 5. Poller / Scheduled Sync

### 5.1 Implementation: ✅ Exists

**File:** `server/cron/xero-sync.ts`

**Schedules:**
- **Sync Queue Processing:** Every 5 minutes (`*/5 * * * *`)
- **Backup Poll:** Every 15 minutes (`*/15 * * * *`)

### 5.2 What Gets Synced

**Sync Queue Processor:**
- Processes items in `xero_sync_queue` table
- Handles: `order` (create/update/void), `customer` (create/update)
- Retries up to `max_retries` times

**Backup Poll:**
- Currently just logs - **not fully implemented**
- Intended to catch missed webhooks by re-importing recent invoices

---

## 6. UI Behavior

### 6.1 Xero Status Display

**Component:** `client/src/components/XeroStatusBadge.tsx`

- Shows connection status in header
- Links to `/auth/crm/settings` for management
- Displays tenant name when connected

### 6.2 Orders Page (`client/src/pages/crm/orders.tsx`)

**Export Button:**
- "Export to Xero" button exists (line 336-357)
- Uses `exportToXeroMutation` calling `POST /api/crm/orders/:orderId/export-xero`
- Shows success toast with invoice number

**Status Display:**
- Order status shown as badges
- Wyshbone statuses: draft, pending, confirmed, dispatched, delivered, cancelled
- **No Xero-specific status badge** (doesn't show DRAFT/AUTHORISED/PAID from Xero)

### 6.3 Edit Restrictions for Approved Invoices

**Current Behavior:** ⚠️ **No restrictions implemented**

- Users can edit any order regardless of Xero status
- No check for `status === 'confirmed'` or Xero `AUTHORISED` status
- Editing an approved order could cause sync conflicts

---

## 7. Known Gaps and Bugs

### 7.1 Critical Gaps

| Gap | Impact | Evidence |
|-----|--------|----------|
| **Webhook subscription not registered** | No real-time status updates from Xero | No registration code found |
| **Backup poll not implemented** | Missed webhook events not recovered | `backupPollXero()` only logs |
| **No edit lock for approved invoices** | User can modify synced orders, causing divergence | No status check in edit handler |
| **Line items missing tax codes** | Xero may reject invoices without proper tax setup | See export code |
| **No Xero account code mapping** | Revenue not properly categorized in Xero | Missing in invoice creation |

### 7.2 Type Errors (LSP Diagnostics)

- 38+ TypeScript errors across Xero files
- Primarily type mismatches and missing properties
- Should be resolved before production use

### 7.3 Sync Status Display

- `crm_orders` has `sync_status` column but UI doesn't prominently display it
- No visual indicator for "syncing...", "synced", or "failed"

---

## 8. File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `shared/schema.ts` | 1851-1951 | Xero table schemas (connections, jobs, webhooks, queue) |
| `server/routes/xero-oauth.ts` | 1713 | OAuth flow, imports, token management |
| `server/routes/xero-sync.ts` | 1271 | Two-way sync, webhooks, exports |
| `server/lib/xero-import.ts` | 1925 | AI-powered import with entity matching |
| `server/cron/xero-sync.ts` | 92 | Scheduled sync jobs |
| `client/src/features/xero/useXero.ts` | 345 | React hooks for Xero operations |
| `client/src/components/XeroStatusBadge.tsx` | 137 | Connection status indicator |
| `client/src/pages/crm/orders.tsx` | 1937 | Orders UI with export button |

---

## 9. Recommendations for "Drafts Only" Workflow

To support the workflow: **Wyshbone creates Drafts → Xero approves/pays → Wyshbone reflects status**

### 9.1 Minimal Changes Required

1. **Force DRAFT status on export**
   - Modify `syncOrderToXero()` to always set `status: 'DRAFT'`
   - Ignore Wyshbone status when creating invoice
   - ~5 lines change

2. **Register Xero webhooks**
   - Add `XERO_WEBHOOK_KEY` to environment
   - Register webhook URL in Xero Developer Portal
   - Verify Intent to Receive validation works
   - ~1 hour setup

3. **Implement real backup polling**
   - Complete `backupPollXero()` to fetch invoices modified since last poll
   - Update local order status from Xero response
   - ~50 lines code

4. **Add status badges to Orders UI**
   - Show Xero status (Draft/Submitted/Authorised/Paid) alongside Wyshbone status
   - Add visual sync indicator (✓ synced, ⟳ syncing, ✗ failed)
   - ~30 lines UI code

5. **Lock editing for approved orders**
   - Disable edit form when `order.status === 'confirmed'` or `xeroStatus === 'AUTHORISED'`
   - Show "Cannot edit - approved in Xero" message
   - ~20 lines code

### 9.2 Estimated Effort

| Task | Estimate |
|------|----------|
| Force DRAFT on export | 30 min |
| Register webhooks | 1 hour |
| Implement backup polling | 2 hours |
| UI status badges | 1.5 hours |
| Lock approved order edits | 1 hour |
| Testing | 2 hours |
| **Total** | **~8 hours** |

---

## 10. Conclusion

The Xero integration has solid foundations but requires targeted fixes to support the desired workflow. The most critical gaps are:

1. Webhook registration for real-time status updates
2. Completing backup polling as a fallback
3. UI improvements to show Xero status
4. Edit restrictions for approved invoices

All import functionality works correctly. Export creates invoices but needs hardcoding to DRAFT status. The codebase is well-structured and the changes are localized to specific files.
