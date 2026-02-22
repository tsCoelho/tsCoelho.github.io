# 05 — Security & Authorization

Authorization is not optional. Every service and entity must have explicit access control defined. Security-by-default is the only acceptable posture.

---

## Core Principle: Deny by Default

By default, CAP denies all access to services with `@requires` or `@restrict` annotations. Any entity or service without explicit authorization is **inaccessible** in production with XSUAA.

Add `@requires` to every service. If a service should be publicly accessible (rare), document why explicitly.

---

## Authorization Annotations in CDS

### Service-Level Access

```cds
// Restrict the entire service to authenticated users
@requires: 'authenticated-user'
service CatalogService { ... }

// Restrict to one or more roles
@requires: ['Viewer', 'Admin']
service AdminService { ... }

// Allow anonymous access (only for truly public data)
@requires: 'any'
service PublicService { ... }
```

### Entity-Level Restrictions

Use `@restrict` for fine-grained control per operation:

```cds
service CatalogService {

  @restrict: [
    { grant: 'READ',   to: 'Viewer'  },
    { grant: 'CREATE', to: 'Editor'  },
    { grant: 'UPDATE', to: 'Editor'  },
    { grant: 'DELETE', to: 'Admin'   }
  ]
  entity Products as projection on db.Products;

  // Action-level restriction
  @restrict: [{ grant: 'EXECUTE', to: 'Admin' }]
  action submitAllOrders() returns Boolean;
}
```

### Instance-Level Restrictions (Row-Level Security)

Use `where` conditions in `@restrict` to limit access to records a user owns:

```cds
service SalesService {

  @restrict: [
    { grant: 'READ',   to: 'SalesRep', where: 'assignedTo = $user' },
    { grant: '*',      to: 'SalesManager' }
  ]
  entity Opportunities as projection on db.Opportunities;
}
```

This is evaluated by CAP at query time — it automatically adds a `WHERE assignedTo = <current user>` clause.

---

## Role Definition

Roles are defined in `xs-security.json` and must match the roles used in CDS annotations exactly.

```json
{
  "xsappname": "my-cap-app",
  "tenant-mode": "dedicated",
  "scopes": [
    { "name": "$XSAPPNAME.Viewer",       "description": "Read-only access" },
    { "name": "$XSAPPNAME.Editor",       "description": "Read and write access" },
    { "name": "$XSAPPNAME.Admin",        "description": "Full administrative access" },
    { "name": "$XSAPPNAME.SalesRep",     "description": "Sales representative access" },
    { "name": "$XSAPPNAME.SalesManager", "description": "Sales manager full access" }
  ],
  "role-templates": [
    {
      "name": "Viewer",
      "description": "Read-only role",
      "scope-references": ["$XSAPPNAME.Viewer"]
    },
    {
      "name": "Editor",
      "description": "Editor role",
      "scope-references": ["$XSAPPNAME.Viewer", "$XSAPPNAME.Editor"]
    },
    {
      "name": "Admin",
      "description": "Administrator role",
      "scope-references": ["$XSAPPNAME.Viewer", "$XSAPPNAME.Editor", "$XSAPPNAME.Admin"]
    }
  ]
}
```

**Rules:**
- Roles should be **additive** — Editor includes Viewer's permissions.
- Use `$XSAPPNAME.` prefix for all scope names.
- Document each role's intended use in the `description` field.

---

## Local Development: Mock Authentication

Use CAP's built-in mock auth for local development. Configure in `.cdsrc.json`:

```json
{
  "requires": {
    "auth": {
      "kind": "mocked",
      "users": {
        "alice": {
          "roles": ["Admin", "Editor", "Viewer"],
          "tenant": "t1"
        },
        "bob": {
          "roles": ["Viewer"],
          "tenant": "t1"
        },
        "carol": {
          "roles": ["Editor", "Viewer"],
          "tenant": "t1"
        },
        "*": false
      }
    }
  }
}
```

**Rules:**
- Define at least one user per role type.
- Set `"*": false` to disable anonymous access locally (mirrors production).
- Never use `"*": true` in mock config — it hides authorization gaps.

---

## Programmatic Authorization Checks

Prefer CDS annotations. Use programmatic checks only for complex conditions that cannot be expressed in CDS.

```js
// ONLY when CDS annotations are insufficient
async _approveOrder(req) {
  const { orderID, amount } = req.data;

  // Example: High-value orders require Finance Manager role
  if (amount > 100000 && !req.user.is('FinanceManager')) {
    req.reject(403, 'HIGH_VALUE_ORDER_REQUIRES_FINANCE_MANAGER');
  }

  // Standard admin check
  if (!req.user.is('Admin')) {
    req.reject(403, 'ADMIN_ROLE_REQUIRED');
  }
}
```

```js
// req.user properties
req.user.id        // User's ID/email
req.user.locale    // User's locale (e.g., 'en', 'de')
req.user.tenant    // Tenant ID (for multi-tenant apps)
req.user.is('RoleName')    // Check single role
req.user.is('Role1','Role2') // Check if user has any of these roles
```

---

## Input Validation & Injection Prevention

### Parameterized Queries

Always use parameterized queries. Never concatenate user input into CQL/SQL strings.

```js
// GOOD — parameterized (safe from injection)
const order = await SELECT.one.from(Orders)
  .where({ ID: req.data.orderID });

// GOOD — tagged template literal (also safe)
const orders = await SELECT.from(Orders)
  .where`status = ${req.data.status} and customer_ID = ${req.user.id}`;

// BAD — string concatenation (SQL injection risk!)
const orders = await db.run(
  `SELECT * FROM Orders WHERE status = '${req.data.status}'`
);
```

### Input Sanitization

Sanitize all user inputs before using them in system operations:

```js
// srv/lib/validators.js
const { escape } = require('@sap/cds').utils;  // Use CDS utilities when available

function sanitizeText(input, maxLength = 255) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength);
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('INVALID_EMAIL_FORMAT', 'email');
  }
}
```

### File Upload Security

If handling file uploads (via CAP's media type features):

```cds
entity Documents {
  key ID       : UUID;
  content      : LargeBinary @Core.MediaType: contentType;
  contentType  : String      @Core.IsMediaType;
  fileName     : String(255);
}
```

```js
// Validate file type and size in before handler
this.before('CREATE', 'Documents', (req) => {
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
  const MAX_SIZE_MB = 10;

  if (!ALLOWED_TYPES.includes(req.data.contentType)) {
    req.reject(400, 'UNSUPPORTED_FILE_TYPE');
  }
  if (req.data.content.length > MAX_SIZE_MB * 1024 * 1024) {
    req.reject(400, 'FILE_TOO_LARGE');
  }
});
```

---

## Sensitive Data Handling

### Never Expose Sensitive Fields

Use `@restrict` and `excluding` in projections:

```cds
service CatalogService {
  // Exclude sensitive fields from the public service
  entity Customers as projection on db.Customers
    excluding { internalNotes, creditScore, bankAccount };
}
```

### Masking in Logs

```js
// GOOD — log only the ID, not the full payload
LOG.info(`Processing order ${req.data.ID}`);

// BAD — may log PII or sensitive business data
LOG.info('Processing order', req.data); // Logs everything including sensitive fields
```

### Secrets Management

```js
// GOOD — read from environment variables
const apiKey = process.env.EXTERNAL_API_KEY;

// BAD — hardcoded secret
const apiKey = 'sk-abc123...'; // NEVER commit secrets
```

Use SAP Credential Store or BTP Secret Management for production secrets. Never store them in `.env` files committed to version control.

---

## CSRF and Cross-Origin

CAP handles CSRF protection automatically for OData services. For custom Express middleware:

```js
// server.js
cds.on('bootstrap', (app) => {
  // CORS — be explicit, never use '*' in production
  const cors = require('cors');
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://myapp.example.com'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
  }));
});
```

---

## Multi-Tenancy

For multi-tenant applications:

```js
// Always scope queries to the current tenant
// CAP does this automatically with XSUAA — verify this is enabled
const order = await SELECT.one.from(Orders)
  .where({ ID: orderID });
  // CAP adds: AND tenant = <current tenant> automatically

// Verify tenant isolation in tests
it('should not expose data across tenants', async () => {
  const { GET } = await cds.test('...').as('alice', { tenant: 'T1' });
  const res = await GET('/orders/tenant-T2-order-id');
  expect(res.status).toBe(404); // Must not find T2 data as T1 user
});
```

---

## Security Review Checklist

- [ ] Every service has `@requires` annotation
- [ ] Every entity has `@restrict` with explicit grants per operation
- [ ] `xs-security.json` roles match CDS annotation role names exactly
- [ ] Mock auth config has `"*": false` (deny unauthenticated by default)
- [ ] No raw SQL strings with user input concatenation
- [ ] No sensitive fields (passwords, internal costs, PII) exposed in service projections
- [ ] No hardcoded secrets or API keys in source code
- [ ] File upload handlers validate file type and size
- [ ] Log messages do not contain PII or secrets
- [ ] CORS configured explicitly (no wildcard `*` in production)
- [ ] Programmatic `req.user.is()` checks have corresponding i18n error messages
- [ ] Row-level security implemented where users should only see their own data
