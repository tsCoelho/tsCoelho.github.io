# 06 — Testing

Tests are mandatory. Untested code is not production-ready code. CAP's test utilities make it practical to write fast, reliable integration tests alongside unit tests.

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| `@cap-js/cds-test` | CAP integration test utilities |
| `Jest` | Test runner and assertion library |
| `supertest` | HTTP-level assertions (via cds.test) |

Install:

```bash
npm install --save-dev jest @cap-js/cds-test
```

---

## Test Directory Structure

Mirror the service structure:

```
test/
├── unit/
│   ├── validators.test.js       # Tests for srv/lib/validators.js
│   ├── calculators.test.js      # Tests for srv/lib/calculators.js
│   └── helpers.test.js
└── integration/
    ├── catalog-service.test.js  # Tests for CatalogService
    ├── admin-service.test.js    # Tests for AdminService
    └── setup.js                 # Shared test setup
```

---

## Unit Tests

Unit tests target pure JavaScript functions in `srv/lib/`. They should be fast, isolated, and not require a running CAP server.

```js
// test/unit/validators.test.js
'use strict';

const { validateQuantity, validateEmail, ValidationError } = require('../../srv/lib/validators');

describe('validateQuantity', () => {
  it('should pass for positive integers', () => {
    expect(() => validateQuantity(5)).not.toThrow();
    expect(() => validateQuantity(1)).not.toThrow();
  });

  it('should fail for zero', () => {
    expect(() => validateQuantity(0)).toThrow(ValidationError);
    expect(() => validateQuantity(0)).toThrow('QUANTITY_MUST_BE_POSITIVE');
  });

  it('should fail for negative numbers', () => {
    expect(() => validateQuantity(-1)).toThrow(ValidationError);
  });

  it('should fail for non-numeric values', () => {
    expect(() => validateQuantity('abc')).toThrow(ValidationError);
    expect(() => validateQuantity(null)).toThrow(ValidationError);
  });

  it('should include the field path in the error', () => {
    try {
      validateQuantity(-1, 'items/0/quantity');
    } catch (err) {
      expect(err.field).toBe('items/0/quantity');
    }
  });
});
```

### Unit Test Rules

- One test file per utility module.
- Use `describe()` to group by function name.
- Test happy path, edge cases, and error cases separately.
- No network calls, no database, no file system.
- Each test must be independent — no shared mutable state between tests.

---

## Integration Tests

Integration tests use `cds.test()` to spin up a full CAP server in-memory. They test the entire request pipeline including authorization, validation, and database operations.

```js
// test/integration/catalog-service.test.js
'use strict';

const cds = require('@sap/cds');
const { GET, POST, PATCH, DELETE, expect } = cds.test(__dirname + '/../..'); // Project root

describe('CatalogService', () => {

  // ── Seed Data ──────────────────────────────────────────────────────
  beforeAll(async () => {
    // Use CSV files or explicit inserts for seed data
    const { Products } = cds.entities('com.company.sales');
    await INSERT.into(Products).entries([
      { ID: 'product-1', code: 'P001', name: 'Widget A', price: 19.99 },
      { ID: 'product-2', code: 'P002', name: 'Widget B', price: 49.99 }
    ]);
  });

  // ── Products: READ ─────────────────────────────────────────────────
  describe('GET /catalog/Products', () => {

    it('should return products for authenticated user', async () => {
      const res = await GET('/catalog/Products').auth('alice', 'pass');
      // With mock auth, use: .set('Authorization', 'Basic alice:')

      expect(res.status).toBe(200);
      expect(res.data.value).toHaveLength(2);
      expect(res.data.value[0]).toMatchObject({
        code: 'P001',
        name: 'Widget A'
      });
    });

    it('should reject unauthenticated requests', async () => {
      const res = await GET('/catalog/Products');
      expect(res.status).toBe(401);
    });

    it('should not expose internalCostPrice', async () => {
      const res = await GET('/catalog/Products').auth('alice', 'pass');
      expect(res.data.value[0]).not.toHaveProperty('internalCostPrice');
    });
  });

  // ── Orders: CREATE ─────────────────────────────────────────────────
  describe('POST /catalog/Orders', () => {

    it('should create a valid order', async () => {
      const res = await POST('/catalog/Orders', {
        customer_ID: 'customer-1',
        items: [
          { product_ID: 'product-1', quantity: 2, unitPrice: 19.99 }
        ]
      }).auth('editor', 'pass');

      expect(res.status).toBe(201);
      expect(res.data.status).toBe('OPEN');
      expect(res.data.ID).toBeDefined();
    });

    it('should reject order with empty items', async () => {
      const res = await POST('/catalog/Orders', {
        customer_ID: 'customer-1',
        items: []
      }).auth('editor', 'pass');

      expect(res.status).toBe(400);
      expect(res.data.error.code).toBe('ITEMS_REQUIRED');
    });

    it('should reject order without customer', async () => {
      const res = await POST('/catalog/Orders', {
        items: [{ product_ID: 'product-1', quantity: 1, unitPrice: 19.99 }]
      }).auth('editor', 'pass');

      expect(res.status).toBe(400);
    });

    it('should deny Viewer role from creating orders', async () => {
      const res = await POST('/catalog/Orders', {
        customer_ID: 'customer-1',
        items: [{ product_ID: 'product-1', quantity: 1, unitPrice: 19.99 }]
      }).auth('bob', 'pass'); // bob has Viewer role only

      expect(res.status).toBe(403);
    });
  });

  // ── submitOrder: Action ────────────────────────────────────────────
  describe('POST /catalog/submitOrder', () => {

    let createdOrderID;

    beforeEach(async () => {
      const res = await POST('/catalog/Orders', {
        customer_ID: 'customer-1',
        items: [{ product_ID: 'product-1', quantity: 1, unitPrice: 19.99 }]
      }).auth('editor', 'pass');
      createdOrderID = res.data.ID;
    });

    it('should submit an open order successfully', async () => {
      const res = await POST('/catalog/submitOrder', {
        orderID: createdOrderID
      }).auth('editor', 'pass');

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('should not submit a non-existent order', async () => {
      const res = await POST('/catalog/submitOrder', {
        orderID: 'non-existent-id'
      }).auth('editor', 'pass');

      expect(res.status).toBe(404);
    });

    it('should not submit an already confirmed order', async () => {
      // Submit once
      await POST('/catalog/submitOrder', { orderID: createdOrderID }).auth('editor', 'pass');
      // Submit again
      const res = await POST('/catalog/submitOrder', { orderID: createdOrderID }).auth('editor', 'pass');

      expect(res.status).toBe(409);
    });
  });
});
```

---

## Testing Authorization

Authorization must be tested explicitly. Do not assume it works.

```js
describe('Authorization', () => {
  const ENDPOINTS = [
    { method: 'GET',    path: '/catalog/Products' },
    { method: 'POST',   path: '/catalog/Orders'   },
    { method: 'DELETE', path: '/admin/Products/product-1' }
  ];

  const USERS = {
    viewer: { user: 'bob',   roles: ['Viewer'] },   // read-only
    editor: { user: 'carol', roles: ['Editor'] },   // read + write
    admin:  { user: 'alice', roles: ['Admin']  }    // all
  };

  it('should deny Viewer from POST /catalog/Orders', async () => {
    const res = await POST('/catalog/Orders', { ... }).auth('bob', 'pass');
    expect(res.status).toBe(403);
  });

  it('should deny Viewer from DELETE /admin/Products', async () => {
    const res = await DELETE('/admin/Products/product-1').auth('bob', 'pass');
    expect(res.status).toBe(403);
  });

  it('should allow Admin to DELETE /admin/Products', async () => {
    const res = await DELETE('/admin/Products/product-1').auth('alice', 'pass');
    expect([200, 204]).toContain(res.status);
  });
});
```

---

## Test Data Management

### Use CSV Files for Stable Reference Data

```csv
# db/data/com.company.sales-Products.csv
ID,code,name,price,internalCostPrice
product-1,P001,Widget A,19.99,8.50
product-2,P002,Widget B,49.99,22.00
```

CAP loads these automatically in test and development modes.

### Use `beforeAll` / `beforeEach` for Dynamic Data

```js
describe('Order tests', () => {
  let orderID;

  beforeEach(async () => {
    // Create fresh data before each test (avoid inter-test dependencies)
    const { Orders } = cds.entities('com.company.sales');
    const result = await INSERT.into(Orders).entries({
      customer_ID: 'customer-1',
      status: 'OPEN'
    });
    orderID = result.ID;
  });

  afterEach(async () => {
    // Clean up to avoid test pollution
    const { Orders } = cds.entities('com.company.sales');
    await DELETE.from(Orders).where({ ID: orderID });
  });
});
```

---

## Jest Configuration

```json
// package.json
{
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/test/**/*.test.js"],
    "runInBand": true,
    "forceExit": true,
    "testTimeout": 30000,
    "globalSetup": "./test/setup.js"
  }
}
```

> **Important**: Always run with `--runInBand` (or `"runInBand": true`). CAP's in-memory SQLite does not support parallel test execution safely.

---

## What Must Be Tested

| Category | Coverage Requirement |
|----------|---------------------|
| Service actions and functions | All paths (happy + error) |
| Authorization (per role, per endpoint) | All defined roles |
| Input validation | Valid, missing, invalid type, boundary values |
| State machine transitions | Valid and invalid transitions |
| External service calls | Mocked — success and failure |
| Data isolation (multi-tenant) | At least one cross-tenant test |

---

## Mocking External Services

```js
// Mock an external service in tests
const cds = require('@sap/cds');

beforeAll(() => {
  cds.env.requires.InventoryService = {
    kind: 'rest',
    credentials: { url: 'http://localhost:3001' }
  };
});

// Or use cds.test mock
const InventoryService = await cds.connect.to('InventoryService');
jest.spyOn(InventoryService, 'run').mockResolvedValue({ available: 100 });
```

---

## Coverage Standards

Aim for:

- **Unit tests**: 90%+ line coverage on `srv/lib/` utilities.
- **Integration tests**: 100% of CDS-defined actions/functions, all HTTP verbs per entity.
- **Authorization**: All role/endpoint combinations tested.

Run coverage:

```bash
npx jest --coverage --collectCoverageFrom='srv/**/*.js'
```

---

## Review Checklist

- [ ] Unit tests for all utility functions in `srv/lib/`
- [ ] Integration tests for all service endpoints and actions
- [ ] Authorization tested for each role (not just the happy path)
- [ ] Invalid inputs tested (missing fields, wrong types, boundary values)
- [ ] State machine transitions tested (valid and invalid)
- [ ] `--runInBand` configured in Jest (no parallel test execution)
- [ ] CSV seed data files present for reference entities
- [ ] `beforeEach`/`afterEach` used to isolate test data
- [ ] No tests that depend on execution order of other tests
- [ ] All tests pass with `npm test` from a clean checkout
