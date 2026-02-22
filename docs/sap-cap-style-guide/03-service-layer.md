# 03 — Service Layer

The service layer is where business logic lives. CAP's event-driven model is powerful but requires discipline to keep handlers clean and testable.

---

## Handler File Structure

Every service handler must follow this structure:

```js
// srv/catalog-service.js

'use strict';

const cds = require('@sap/cds');
const { validateProduct } = require('./lib/validators');
const { calculateDiscount } = require('./lib/calculators');

// One module.exports per file — export the handler class or function
module.exports = class CatalogService extends cds.ApplicationService {

  async init() {

    // ── Read Handlers ────────────────────────────────────────────
    this.before('READ', 'Products', this._beforeReadProducts);
    this.after('READ', 'Products', this._afterReadProducts);

    // ── Write Handlers ───────────────────────────────────────────
    this.before('CREATE', 'Orders', this._validateOrder);
    this.on('CREATE', 'Orders', this._createOrder);
    this.after('CREATE', 'Orders', this._afterCreateOrder);

    // ── Actions / Functions ──────────────────────────────────────
    this.on('submitOrder', this._submitOrder);
    this.on('cancelOrder', this._cancelOrder);

    // Always call super.init() last to wire default handlers
    await super.init();
  }

  // ── Handler Implementations ──────────────────────────────────────

  async _beforeReadProducts(req) {
    // Pre-processing before data is read
  }

  async _afterReadProducts(results, req) {
    // Post-processing after data is read — enrich data here
    results.forEach(product => {
      product.discount = calculateDiscount(product.price, req.user);
    });
  }

  async _validateOrder(req) {
    const { items } = req.data;
    if (!items || items.length === 0) {
      req.error(400, 'ORDER_REQUIRES_ITEMS', ['items']);
    }
  }

  async _createOrder(req) {
    const { Orders } = cds.entities('com.company.sales');
    return INSERT.into(Orders).entries(req.data);
  }

  async _afterCreateOrder(result, req) {
    // Side effects: send email, trigger workflow, etc.
  }

  async _submitOrder(req) {
    const { orderID } = req.data;
    const { Orders } = cds.entities('com.company.sales');

    const order = await SELECT.one.from(Orders).where({ ID: orderID });
    if (!order) req.error(404, 'ORDER_NOT_FOUND');
    if (order.status !== 'OPEN') req.error(409, 'ORDER_ALREADY_SUBMITTED');

    await UPDATE(Orders).set({ status: 'CONFIRMED' }).where({ ID: orderID });
    return { success: true, orderID };
  }

  async _cancelOrder(req) {
    const { orderID, reason } = req.data;
    const { Orders } = cds.entities('com.company.sales');

    await UPDATE(Orders)
      .set({ status: 'CANCELLED', cancellationReason: reason })
      .where({ ID: orderID });
  }
};
```

---

## Handler Registration Order

Register handlers in this order within `init()`:

1. `before` — Validation, pre-processing
2. `on` — Core business logic (replaces default)
3. `after` — Enrichment, side effects, notifications

**If you do not register an `on` handler, CAP's generic handler runs.** This is usually what you want for simple CRUD. Only register `on` when you need to replace the default behavior entirely.

---

## Event Types

| Event | Trigger | Common Use |
|-------|---------|-----------|
| `READ` | GET request | Filter, enrich results |
| `CREATE` | POST request | Validate, set defaults |
| `UPDATE` | PATCH/PUT | Validate transitions |
| `DELETE` | DELETE | Check dependencies, soft-delete |
| `NEW` | Draft: new | Initialize draft |
| `EDIT` | Draft: edit | Lock for editing |
| `SAVE` | Draft: activate | Final validation |
| `CANCEL` | Draft: cancel | Cleanup |
| Custom action | Named action | Business operations |

---

## Actions and Functions

Bound actions/functions operate on a specific entity instance. Unbound act on the service.

```cds
// srv/catalog-service.cds
service CatalogService {
  entity Orders as projection on db.Orders;

  // Bound action — operates on a specific Order
  action submitOrder(orderID: UUID) returns { success: Boolean; };

  // Unbound function — service-level query
  function getOrderStats(year: Integer) returns { total: Integer; revenue: Decimal; };
}
```

```js
// Handler registration
this.on('submitOrder', 'Orders', this._submitOrder);  // bound to Orders
this.on('getOrderStats', this._getOrderStats);         // unbound
```

**Rules:**
- Use `action` for operations that modify state (POST in OData).
- Use `function` for read-only operations (GET in OData).
- Always validate input parameters at the start of action handlers.
- Return meaningful results from actions, not just `undefined`.

---

## Querying Data

Use CDS Query Language (CQL). Avoid raw SQL strings.

```js
// GOOD — CQL with fluent API
const order = await SELECT.one.from(Orders)
  .columns('ID', 'status', 'customer.name as customerName')
  .where({ ID: orderID })
  .and('status !=', 'CANCELLED');

// GOOD — CQL with template literals (for dynamic queries)
const orders = await cds.run(
  SELECT.from(Orders).where`status = ${'OPEN'} and createdAt > ${since}`
);

// GOOD — INSERT with entries
await INSERT.into(Orders).entries({
  status: 'OPEN',
  customer_ID: customerID,
  items: lineItems
});

// GOOD — UPDATE
await UPDATE(Orders)
  .set({ status: 'SHIPPED', shippedAt: new Date() })
  .where({ ID: orderID });

// BAD — raw SQL string (bypasses CDS security, type safety, portability)
await db.run(`UPDATE Orders SET status = 'SHIPPED' WHERE ID = '${id}'`);
```

### Accessing the Database

Use `cds.run()` or the query API on the `db` service. Do not import low-level DB drivers.

```js
// GOOD — using cds.run (works with any DB)
const db = await cds.connect.to('db');
const results = await db.run(SELECT.from(Orders));

// GOOD — using cds.entities to resolve entity references
const { Orders } = cds.entities('com.company.sales');
const order = await SELECT.one.from(Orders, orderID);

// BAD — direct HANA client
const hana = require('@sap/hana-client'); // Never do this in service handlers
```

---

## `before`, `on`, `after` — When to Use Each

```js
// ── BEFORE: Validate and guard ────────────────────────────────────────
this.before('CREATE', 'Orders', async (req) => {
  // Validate input data
  // Set defaults on req.data (mutations ARE allowed here)
  // Check preconditions (entity must be in state X)
  // Call req.error() to reject — never throw
});

// ── ON: Replace default behavior ─────────────────────────────────────
this.on('CREATE', 'Orders', async (req) => {
  // Custom INSERT logic (skips CAP generic handler)
  // Must return the created entity or run INSERT manually
  // Use sparingly — prefer before/after for most cases
});

// ── AFTER: Enrich and react ──────────────────────────────────────────
this.after('READ', 'Orders', async (results, req) => {
  // Mutate result objects to add computed fields
  // Trigger side effects (emails, external calls)
  // DO NOT throw from here — errors in after are logged but ignored by client
});
```

---

## Calling External Services

Use `cds.connect.to()` to interact with external systems. Never instantiate HTTP clients directly.

```js
// srv/catalog-service.js
const ExternalInventory = await cds.connect.to('InventoryService');

async _checkStock(req) {
  const { productID, quantity } = req.data;

  // CAP handles authentication, retry, and mocking automatically
  const stock = await ExternalInventory.run(
    SELECT.one.from('StockLevels').where({ productID })
  );

  if (stock.available < quantity) {
    req.error(409, 'INSUFFICIENT_STOCK', [productID]);
  }
}
```

Define the external service in `.cdsrc.json`:

```json
{
  "requires": {
    "InventoryService": {
      "kind": "odata-v4",
      "credentials": {
        "url": "https://inventory.example.com/odata/v4"
      }
    }
  }
}
```

---

## Service Communication (Internal)

Use `cds.connect.to()` for internal service-to-service calls — this respects authorization and transaction context.

```js
// GOOD — internal service call
const AdminService = await cds.connect.to('AdminService');
await AdminService.run(UPDATE('Users').set({ lastActive: new Date() }).where({ ID: userID }));

// BAD — direct DB access bypassing service layer
const { Users } = cds.entities('com.company.admin');
await UPDATE(Users).set({ lastActive: new Date() }).where({ ID: userID });
// ^ This bypasses AdminService's authorization and validation
```

---

## Transactions

CAP manages transactions automatically for standard CRUD. For complex multi-step operations, use explicit transactions:

```js
async _transferStock(req) {
  const { fromWarehouse, toWarehouse, productID, quantity } = req.data;
  const db = await cds.connect.to('db');

  // CAP uses the request's transaction automatically
  // For explicit control:
  const tx = db.tx(req); // Ties to current request transaction

  await tx.run(UPDATE('StockLevels')
    .set`available = available - ${quantity}`
    .where({ warehouseID: fromWarehouse, productID }));

  await tx.run(UPDATE('StockLevels')
    .set`available = available + ${quantity}`
    .where({ warehouseID: toWarehouse, productID }));

  // Commit happens automatically when the request succeeds
  // Rollback happens automatically on req.error() or uncaught exception
}
```

---

## Handler Anti-Patterns

```js
// BAD: Business logic in init()
async init() {
  this.before('CREATE', 'Orders', async (req) => {
    // 50 lines of validation logic inline
    // Hard to test, hard to read
    if (!req.data.items || req.data.items.length === 0) { ... }
    if (req.data.totalAmount < 0) { ... }
    // ...
  });
}
// GOOD: Extract to named method
async init() {
  this.before('CREATE', 'Orders', this._validateOrder);
}
async _validateOrder(req) { ... }

// BAD: Fetching more data than needed
const allOrders = await SELECT.from(Orders); // Loads everything
const order = allOrders.find(o => o.ID === id);
// GOOD: Query with WHERE
const order = await SELECT.one.from(Orders, id);

// BAD: Modifying results in 'before' READ (use 'after' instead)
this.before('READ', 'Orders', async (req) => {
  // Can't modify results here — they don't exist yet
});

// BAD: Throwing generic errors
throw new Error('Something went wrong'); // Client gets 500, no useful info
// GOOD: Use req.error with code
req.error(400, 'VALIDATION_FAILED', ['fieldName']);
```

---

## Review Checklist

- [ ] One handler class per service file
- [ ] `super.init()` called at end of `init()`
- [ ] Handlers are named methods, not inline arrow functions
- [ ] `before` used for validation, `after` for enrichment
- [ ] `on` used only when replacing default CAP generic handler
- [ ] No raw SQL strings — use CQL
- [ ] External services accessed via `cds.connect.to()`
- [ ] `req.error()` used for all error signaling, not `throw`
- [ ] Actions return meaningful response objects
- [ ] No more than ~10 handler registrations per `init()` — split into sub-services if needed
