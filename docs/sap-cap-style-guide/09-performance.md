# 09 — Performance

Performance issues in CAP applications usually fall into a few categories: N+1 queries, unbounded result sets, expensive computations in `after` handlers, and unoptimized HANA queries. This section covers how to identify and prevent each.

---

## Query Optimization

### Select Only What You Need

Never select all columns when you only need a few. This is especially important for entities with `LargeBinary` fields (file content) or many associations.

```js
// GOOD — select only needed columns
const orders = await SELECT.from(Orders)
  .columns('ID', 'status', 'createdAt', 'customer.name as customerName')
  .where({ status: 'OPEN' });

// BAD — loads all columns including potentially large ones
const orders = await SELECT.from(Orders).where({ status: 'OPEN' });
```

In CDS service definitions, use `$select` hints in the annotation:

```cds
// Ensure clients can efficiently query with $select
annotate CatalogService.Orders with @cds.redirection.target: true;
```

### Avoid N+1 Queries

The N+1 problem occurs when you query a list and then query each item individually.

```js
// BAD — N+1 queries (1 query for orders + N queries for customers)
const orders = await SELECT.from(Orders);
for (const order of orders) {
  order.customer = await SELECT.one.from(Customers, order.customer_ID);
}

// GOOD — single query with JOIN via expand
const orders = await SELECT.from(Orders)
  .columns('ID', 'status', 'customer.name', 'customer.email');
  // CAP generates JOIN automatically for associations

// GOOD — use $expand in OData requests (CAP handles it efficiently)
GET /orders?$expand=customer($select=name,email)
```

### Paginate All List Queries

Never return unbounded result sets. Apply `limit` to all queries that could return many rows.

```js
// GOOD — paginated
const { top = 50, skip = 0 } = req.query?.options || {};
const orders = await SELECT.from(Orders)
  .limit(top, skip)
  .orderBy('createdAt desc');

// BAD — loads entire table
const orders = await SELECT.from(Orders);
```

In Fiori Elements, use:

```cds
annotate CatalogService.Orders with @UI.PresentationVariant: {
  MaxItems: 50,
  SortOrder: [{ Property: createdAt, Descending: true }]
};
```

### Use Indexed Columns in WHERE Clauses

Ensure WHERE conditions use indexed columns. In HANA, primary keys and explicitly indexed columns are fast; free-text searches on unindexed String columns are not.

```cds
// Add index hints in schema (HANA-specific)
entity Orders : cuid, managed {
  key ID     : UUID;
  status     : String(20);   // Common filter — ensure HANA has index
  customer   : Association to Customers;
}
```

For HANA, add a `db/src/` directory with HANA DDL for explicit indexes when needed:

```sql
-- db/src/ORDER_STATUS_IDX.hdbindex
INDEX "ORDER_STATUS_IDX" ON "COM_COMPANY_SALES_ORDERS" ("STATUS");
```

---

## After Handler Performance

`after` handlers run on the full result set. Heavy computation here multiplies with the number of rows.

```js
// BAD — O(n) DB call inside after handler (N+1 in disguise)
this.after('READ', 'Orders', async (results, req) => {
  for (const order of results) {
    const customer = await SELECT.one.from(Customers, order.customer_ID);
    order.customerTier = customer.tier;
  }
});

// GOOD — batch the additional data fetch
this.after('READ', 'Orders', async (results, req) => {
  if (!results.length) return;

  const customerIDs = [...new Set(results.map(o => o.customer_ID))];
  const customers = await SELECT.from(Customers)
    .where({ ID: { in: customerIDs } })
    .columns('ID', 'tier');

  const tierMap = Object.fromEntries(customers.map(c => [c.ID, c.tier]));
  results.forEach(order => {
    order.customerTier = tierMap[order.customer_ID];
  });
});

// BEST — compute at the CDS/query level instead
// Use a CDS view or virtual element computed in CQL
```

### Virtual Elements for Computed Fields

Use CDS virtual elements for simple computed values:

```cds
entity Orders : cuid, managed {
  quantity  : Integer;
  unitPrice : Decimal(15,2);

  // Virtual element — computed at read time
  virtual totalAmount : Decimal(15,2);
}
```

```js
// Compute in after handler — still runs per row but avoids extra queries
this.after('READ', 'Orders', (orders) => {
  orders.forEach(order => {
    order.totalAmount = order.quantity * order.unitPrice;
  });
});
```

---

## Caching

CAP does not provide built-in caching. Implement application-level caching sparingly and only for data that changes infrequently.

```js
// srv/lib/cache.js
'use strict';

const cache = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

async function withCache(key, loader) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.value;
  }
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

function invalidate(key) {
  cache.delete(key);
}

module.exports = { withCache, invalidate };
```

```js
// Usage — cache reference data (product categories, tax rates, etc.)
const { withCache } = require('./lib/cache');

async _getProductCategories() {
  return withCache('productCategories', async () => {
    return SELECT.from(ProductCategories).orderBy('name');
  });
}
```

**Cache rules:**
- Only cache reference/lookup data that changes on admin action, not business entities.
- Always provide a cache invalidation mechanism.
- Do not cache user-specific or tenant-specific data in a shared cache.
- Document the TTL rationale in a comment.

---

## External Service Call Optimization

```js
// BAD — sequential external calls when parallel is possible
const inventory = await InventoryService.run(SELECT.one.from('Stock').where({ ID }));
const pricing = await PricingService.run(SELECT.one.from('Prices').where({ ID }));

// GOOD — parallel calls when independent
const [inventory, pricing] = await Promise.all([
  InventoryService.run(SELECT.one.from('Stock').where({ ID })),
  PricingService.run(SELECT.one.from('Prices').where({ ID }))
]);
```

---

## Streaming Large Data

For large binary files, use streaming rather than loading the full content into memory:

```cds
entity Documents {
  key ID      : UUID;
  content     : LargeBinary @Core.MediaType: contentType @stream;
  contentType : String;
}
```

CAP automatically streams `LargeBinary` fields annotated with `@stream` — do not load them manually.

---

## Performance Monitoring

Use CAP's built-in logging to track slow operations:

```js
// Log slow operations above a threshold
const LOG = cds.log('performance');

async _processLargeExport(req) {
  const start = Date.now();

  const data = await SELECT.from(Orders).where({ year: req.data.year });

  const elapsed = Date.now() - start;
  if (elapsed > 2000) {
    LOG.warn(`Slow export query: ${elapsed}ms for year=${req.data.year}, rows=${data.length}`);
  }

  return data;
}
```

Configure CDS query logging in development:

```json
{
  "log": {
    "service": true,
    "query": true
  }
}
```

---

## HANA-Specific Optimizations

### Column Store Tables

CAP generates column store tables in HANA by default — do not change this. Column store is optimal for analytical queries on large datasets.

### Avoid Functions on Indexed Columns in WHERE

```sql
-- BAD — UPPER() prevents index usage
WHERE UPPER(STATUS) = 'OPEN'

-- GOOD — store data in canonical form (always uppercase)
WHERE STATUS = 'OPEN'
```

In CDS, enforce canonical form with validation:

```js
this.before('CREATE', 'Orders', (req) => {
  if (req.data.status) {
    req.data.status = req.data.status.toUpperCase();
  }
});
```

### Batch DML Operations

Avoid row-by-row inserts for bulk operations:

```js
// BAD — N individual INSERT statements
for (const item of items) {
  await INSERT.into(OrderItems).entries(item);
}

// GOOD — single batch INSERT
await INSERT.into(OrderItems).entries(items);
```

---

## Frontend Performance

### Lazy Loading

Configure UI5 to load resources on demand:

```js
// manifest.json
{
  "sap.ui5": {
    "dependencies": {
      "lazy": true    // Load libraries lazily
    }
  }
}
```

### OData $select and $expand

Always use `$select` to request only needed fields. Avoid `$expand` without `$select` on the expanded entity.

```js
// GOOD — targeted expand with select
oList.bindItems({
  path: '/Orders',
  parameters: {
    $select: 'ID,status,createdAt',
    $expand: 'customer($select=name)'
  }
});

// BAD — expands all fields of customer
oList.bindItems({
  path: '/Orders',
  parameters: { $expand: 'customer' }
});
```

### Growing Lists

Always enable growing on UI5 lists to avoid loading thousands of records:

```xml
<List growing="true" growingThreshold="50" growingScrollToLoad="true">
```

---

## Review Checklist

- [ ] All list queries have `LIMIT`/pagination (no unbounded SELECT)
- [ ] Only required columns selected (no `SELECT *` equivalents)
- [ ] No N+1 query patterns — associations resolved with JOINs or batch fetches
- [ ] Independent external service calls made in parallel with `Promise.all()`
- [ ] Application-level caching documented with TTL rationale
- [ ] Bulk DML uses batch INSERT/UPDATE, not row-by-row
- [ ] `LargeBinary` fields annotated with `@stream`
- [ ] UI5 lists have `growing="true"` with a reasonable `growingThreshold`
- [ ] OData requests use `$select` and targeted `$expand`
- [ ] Slow query logging added for operations that might be expensive
