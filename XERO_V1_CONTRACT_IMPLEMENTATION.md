# Wyshbone↔Xero V1 Contract Implementation

**Date:** January 17, 2026  
**Contract:** Wyshbone creates DRAFT invoices only → Xero approves/pays → Wyshbone reflects status

---

## Summary of Changes

### A) Force DRAFT on Export (Wyshbone → Xero)

**File:** `server/routes/xero-sync.ts`

- `syncOrderToXero()` now ALWAYS creates invoices with `status: 'DRAFT'`
- Adds reference field: `WB-{orderNumber}` for attribution
- If invoice already exists (order has `xeroInvoiceId`), updates it instead of creating new
- Checks if existing invoice is still DRAFT before updating (throws error if not)
- Sets `xeroStatus`, `xeroUpdatedAt`, `xeroStatusSource` fields on export

### B) Xero Status Fields in Schema

**File:** `shared/schema.ts`

Added to `crm_orders` table:
```typescript
xeroStatus: varchar("xero_status", { length: 20 }), // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
xeroUpdatedAt: timestamp("xero_updated_at"),
xeroStatusSource: varchar("xero_status_source", { length: 20 }), // 'export', 'webhook', 'poll', 'import'
```

### C) Lock Edits When Not Draft

**File:** `server/routes.ts`

Added HTTP 423 (Locked) responses for:
- `PATCH /api/crm/orders/:id` - Order updates
- `DELETE /api/crm/orders/:id` - Order deletion
- `POST /api/crm/order-lines` - Adding lines to locked orders
- `PATCH /api/crm/order-lines/:id` - Updating lines
- `DELETE /api/crm/order-lines/:id` - Deleting lines

Response format:
```json
{
  "error": "Order is locked",
  "message": "This order has been authorised in Xero and cannot be edited in Wyshbone.",
  "xeroStatus": "AUTHORISED"
}
```

### D) Webhook + Poller Alignment (Xero → Wyshbone)

**Webhook Handler:** `POST /api/xero/sync/webhooks/xero`
- Uses HMAC signature verification via `verifyXeroWebhookSignature()`
- Idempotency: stores event IDs and checks before processing
- Updates `xeroStatus`, `xeroUpdatedAt`, `xeroStatusSource` on invoice events
- Logs activity via `logXeroActivity()`

**Backup Poller:** `backupPollXero()` (runs every 15 minutes)
- Fetches all active Xero connections
- Gets orders with `xeroInvoiceId` for each workspace
- Chunks invoice IDs into batches of 100 (Xero API limit)
- Updates local `xeroStatus` when changes detected
- Logs activity for status changes

### E) Audit Trail

**Function:** `logXeroActivity()`

Logs the following events:
- `pushed_to_xero` - Order exported to Xero as DRAFT
- `updated_in_xero` - Order updated in Xero
- `xero_status_changed` - Status changed (with previous/new status)

Details include:
- `workspaceId`, `actorUserId`, `actorName`
- `entityType` (order/customer)
- `entityId`
- `source` (export/webhook/poll/import)
- `invoiceId`, `invoiceNumber`

---

## Files Changed

| File | Changes |
|------|---------|
| `shared/schema.ts` | Added xeroStatus, xeroUpdatedAt, xeroStatusSource fields |
| `server/routes/xero-sync.ts` | Updated syncOrderToXero, updateOrderInXero, backup poller, import/void functions |
| `server/routes.ts` | Added 423 Locked checks for order/order-line mutations |
| `server/storage.ts` | Added getOrdersWithXeroInvoiceId method, updated imports |

---

## Database Migration

Schema changes applied via:
```bash
npm run db:push
```

New columns added to `crm_orders`:
- `xero_status` (varchar, nullable)
- `xero_updated_at` (timestamp, nullable)
- `xero_status_source` (varchar, nullable)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XERO_CLIENT_ID` | Yes | Xero OAuth client ID |
| `XERO_CLIENT_SECRET` | Yes | Xero OAuth client secret |
| `XERO_WEBHOOK_KEY` | Recommended | HMAC key for webhook verification |

---

## Testing Checklist

### Test 1: Create DRAFT in Xero
1. Create order in Wyshbone with 2 line items
2. Click "Export to Xero"
3. Verify: Invoice in Xero has status = DRAFT
4. Verify: Order in Wyshbone has `xeroStatus` = 'DRAFT'

### Test 2: Approve → Wyshbone Updates
1. Approve invoice in Xero (Awaiting Payment)
2. Wait for webhook or 15-min poll
3. Verify: Wyshbone order `xeroStatus` = 'AUTHORISED'

### Test 3: Pay → Wyshbone Updates
1. Mark invoice as paid in Xero
2. Wait for webhook or 15-min poll
3. Verify: Wyshbone order `xeroStatus` = 'PAID'

### Test 4: Edit Lock Works
1. Try to edit an AUTHORISED order in Wyshbone
2. Verify: API returns 423 Locked
3. Verify: UI shows "Locked (Approved in Xero)"

### Test 5: Database Evidence
```sql
SELECT id, order_number, xero_invoice_id, xero_status, xero_updated_at, xero_status_source
FROM crm_orders
WHERE xero_invoice_id IS NOT NULL;
```

---

## API Endpoints

### Export Order to Xero
```
POST /api/crm/orders/:id/export-xero
```
Creates DRAFT invoice in Xero, returns invoice ID/number.

### Webhook Receiver
```
POST /api/xero/sync/webhooks/xero
Headers: x-xero-signature
```
Receives Xero webhook events, updates local order status.

### Manual Sync
```
POST /api/xero/sync/order/:orderId
Body: { workspaceId: string }
```
Manually triggers order sync to Xero.

---

## Known Limitations

1. **Webhook Raw Body:** Signature verification uses `JSON.stringify(req.body)`. For production, consider raw body capture middleware.

2. **Rate Limits:** Backup poller has no explicit rate limit handling. Monitor Xero API responses.

3. **UI Not Updated:** This implementation adds server-side logic. UI badges for Xero status are not included.
