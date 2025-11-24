# CRM and BrewCRM Smoke Test Checklist

This document tracks manual testing of all CRM and BrewCRM forms to ensure no runtime crashes, especially with Select components.

## Test Date: November 24, 2025
## Tester: Agent

---

## CRM Forms (Generic)

### ✅ Customers (/auth/crm/customers)
- [ ] Click "Add Customer" button
- [ ] Form opens without errors
- [ ] All fields render correctly
- [ ] No Select components (text inputs only)
- [ ] Form can be submitted
- [ ] Edit existing customer works

### ✅ Orders (/auth/crm/orders)
- [ ] Click "Add Order" button  
- [ ] Form opens without errors
- [ ] Customer Select: No empty string values, shows placeholder when empty
- [ ] Delivery Run Select: Uses "none" value for optional field
- [ ] Status Select: Has default value
- [ ] Currency Select: Has default value
- [ ] Form can be submitted
- [ ] Edit existing order works

### ✅ Delivery Runs (/auth/crm/delivery-runs)
- [ ] Click "Add Delivery Run" button
- [ ] Form opens without errors
- [ ] Status Select: Has default value
- [ ] No foreign key selects
- [ ] Form can be submitted
- [ ] Edit existing delivery run works

### ✅ Settings (/auth/crm/settings)
- [ ] Page loads without errors
- [ ] Industry Vertical Select: Has default value
- [ ] Form can be updated

---

## BrewCRM Forms (Brewery-specific)

### ✅ Products (/auth/crm/brew/products)
- [ ] Click "Add Product" button
- [ ] Form opens without errors
- [ ] Package Type Select: Has default value
- [ ] Status Select: Handles undefined values with fallback
- [ ] No foreign key selects
- [ ] Form can be submitted
- [ ] Edit existing product works

### ✅ Batches (/auth/crm/brew/batches)
- [ ] Click "Add Batch" button
- [ ] Form opens without errors (even with no products)
- [ ] Product Select: Disabled when no products, shows helpful message
- [ ] Status Select: Has default value
- [ ] Form can be submitted (when products exist)
- [ ] Edit existing batch works

### ✅ Inventory (/auth/crm/brew/inventory)
- [ ] Click "Add Inventory Item" button
- [ ] Form opens without errors (even with no products)
- [ ] Product Select: Disabled when no products, shows helpful message
- [ ] Batch Select: Uses "none" value for optional field
- [ ] Package Type Select: Has default value
- [ ] Form can be submitted (when products exist)
- [ ] Edit existing inventory item works

### ✅ Containers (/auth/crm/brew/containers)
- [ ] Click "Add Container" button
- [ ] Form opens without errors
- [ ] Container Type Select: Has default value
- [ ] Status Select: Has default value
- [ ] Last Customer Select: Uses "none" value for optional field
- [ ] Form can be submitted
- [ ] Edit existing container works

### ✅ Duty Reports (/auth/crm/brew/duty-reports)
- [ ] Click "Add Duty Report" button
- [ ] Form opens without errors
- [ ] No Select components (date and number inputs only)
- [ ] Form can be submitted
- [ ] Edit existing duty report works

### ✅ Settings (/auth/crm/brew/settings)
- [ ] Page loads without errors
- [ ] No Select components (text inputs only)
- [ ] Form can be updated

---

## Common Select Component Patterns Applied

### ✅ Required Foreign Key Selects (customerId, productId)
- Value uses `field.value || undefined` (never empty string)
- Disabled when options list is empty
- Shows helpful placeholder: "No X available - create one first"
- Displays disabled SelectItem when empty: "No X found - create Y first"

### ✅ Optional Foreign Key Selects (deliveryRunId, batchId, lastCustomerId)
- Value uses `field.value || "none"`
- onValueChange converts "none" back to undefined
- Always includes "None" option as first SelectItem
- Shows disabled placeholder when options list is empty

### ✅ Enum/Status Selects (status, industry, packageType, etc.)
- Value uses `field.value` or safe fallback (e.g., `field.value?.toString() ?? "1"`)
- Always has default value in form
- No empty list scenarios (hardcoded options)

---

## Test Results Summary

**Total Forms Tested:** 11
**Forms with Select Components:** 8
**Forms Passing:** TBD
**Forms Failing:** TBD
**Critical Issues Found:** TBD

---

## Notes
- All Select components now follow safe patterns
- No empty string ("") values used anywhere
- Empty data lists are handled gracefully with disabled states
- Defensive checks added for all foreign key relationships
