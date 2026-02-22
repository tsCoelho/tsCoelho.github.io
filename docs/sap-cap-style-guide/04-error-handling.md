# 04 — Error Handling

Consistent, informative error handling is critical for debuggability and a good developer/user experience. CAP provides a structured error model — use it.

---

## The Golden Rule

**Always use `req.error()` inside handlers. Never `throw new Error()`.**

`req.error()` integrates with CAP's error handling pipeline, sets the correct HTTP status code, and can be called multiple times to accumulate validation errors. A bare `throw` will result in a generic 500 response.

```js
// GOOD
async _validateOrder(req) {
  if (!req.data.customer_ID) req.error(400, 'CUSTOMER_REQUIRED', ['customer_ID']);
  if (!req.data.items?.length) req.error(400, 'ITEMS_REQUIRED', ['items']);
  // req.error accumulates — both errors are returned if both conditions fail
}

// BAD
async _validateOrder(req) {
  if (!req.data.customer_ID) throw new Error('Customer required');
  // ^ Client gets 500 Internal Server Error with no field context
}
```

---

## `req.error()` Signature

```js
req.error(httpStatusCode, messageKey, [...targets])
req.error(httpStatusCode, 'Message with {0} placeholder', ['value'])
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `httpStatusCode` | `number` | Standard HTTP status code |
| `messageKey` | `string` | i18n message key or literal message |
| `targets` | `string[]` | Field paths that caused the error (for UI highlighting) |

```js
// With i18n key (preferred)
req.error(400, 'INVALID_QUANTITY', ['items/0/quantity']);

// With literal message (acceptable for internal/debug errors)
req.error(500, `Unexpected state: ${order.status}`);

// Short form — stops execution immediately (equivalent to early return)
req.reject(404, 'ORDER_NOT_FOUND');
```

### `req.error` vs `req.reject`

- `req.error()` — Adds error to the error list. **Does not stop execution.** Useful for accumulating multiple validation errors.
- `req.reject()` — Adds error AND stops handler execution immediately. Use when further processing is meaningless.

```js
// Accumulate multiple errors
async _validate(req) {
  if (!req.data.name)     req.error(400, 'NAME_REQUIRED', ['name']);
  if (!req.data.email)    req.error(400, 'EMAIL_REQUIRED', ['email']);
  if (!req.data.quantity) req.error(400, 'QTY_REQUIRED', ['quantity']);
  // All three errors are returned to client if all fail
}

// Stop immediately when precondition fails
async _submitOrder(req) {
  const order = await SELECT.one.from(Orders, req.data.orderID);
  if (!order) req.reject(404, 'ORDER_NOT_FOUND'); // No point continuing

  // This line only runs if order exists
  if (order.status !== 'OPEN') req.error(409, 'ORDER_NOT_SUBMITTABLE');
}
```

---

## HTTP Status Codes

Use the correct status code for each situation:

| Code | Meaning | When to Use |
|------|---------|-------------|
| `400` | Bad Request | Invalid input, missing required fields, business rule validation |
| `401` | Unauthorized | Not authenticated (CAP handles this automatically) |
| `403` | Forbidden | Authenticated but not authorized for this action |
| `404` | Not Found | Entity does not exist |
| `409` | Conflict | State conflict (e.g., entity already activated, concurrent update) |
| `422` | Unprocessable | Semantically invalid (valid format, invalid business meaning) |
| `500` | Internal Error | Unexpected system errors only — never for business validation |

```js
// 400 — Validation
req.error(400, 'QUANTITY_MUST_BE_POSITIVE', ['quantity']);

// 403 — Authorization check (prefer CDS annotations, but programmatic when needed)
if (!req.user.is('admin')) req.reject(403, 'ADMIN_ROLE_REQUIRED');

// 404 — Not found
if (!order) req.reject(404, 'ORDER_NOT_FOUND');

// 409 — Conflict / state machine violation
if (order.status === 'SHIPPED') req.reject(409, 'ORDER_ALREADY_SHIPPED');
```

---

## Error Message Internationalization

Define all user-facing error messages in i18n files. Never hardcode English strings in handler code.

```
srv/
└── _i18n/
    ├── messages.properties        # Default (English)
    ├── messages_de.properties     # German
    └── messages_pt.properties     # Portuguese
```

```properties
# srv/_i18n/messages.properties
ORDER_NOT_FOUND=Order {0} was not found.
QUANTITY_MUST_BE_POSITIVE=Quantity must be a positive number.
ORDER_ALREADY_SHIPPED=Order {0} has already been shipped and cannot be modified.
INSUFFICIENT_STOCK=Product {0} has insufficient stock. Available: {1}, Requested: {2}.
CUSTOMER_REQUIRED=A customer must be assigned to the order.
ADMIN_ROLE_REQUIRED=This action requires the Administrator role.
```

```js
// Reference by key — CAP resolves the locale automatically
req.error(404, 'ORDER_NOT_FOUND', [orderID]);
// Produces: "Order ORD-001 was not found."

req.error(409, 'INSUFFICIENT_STOCK', [productCode, available, requested]);
// Produces: "Product P001 has insufficient stock. Available: 5, Requested: 10."
```

---

## Error Handling in Utility Functions

Utilities in `srv/lib/` should not use `req.error()` — they don't have access to `req`. Instead, they throw typed errors that are caught in the handler.

```js
// srv/lib/validators.js
'use strict';

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

function validateQuantity(quantity, fieldPath = 'quantity') {
  if (typeof quantity !== 'number' || quantity <= 0) {
    throw new ValidationError('QUANTITY_MUST_BE_POSITIVE', fieldPath);
  }
}

module.exports = { validateQuantity, ValidationError };
```

```js
// srv/catalog-service.js
const { validateQuantity, ValidationError } = require('./lib/validators');

async _createOrder(req) {
  try {
    req.data.items.forEach((item, i) => {
      validateQuantity(item.quantity, `items/${i}/quantity`);
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      req.error(err.statusCode, err.message, [err.field]);
      return; // Stop execution after error
    }
    // Re-throw unexpected errors
    throw err;
  }
}
```

---

## Logging

Use CAP's built-in logger. Never use `console.log` in production code.

```js
const LOG = cds.log('catalog-service');

// LOG.info  → INFO  level (informational events)
// LOG.warn  → WARN  level (unexpected but recoverable situations)
// LOG.error → ERROR level (failures that need attention)
// LOG.debug → DEBUG level (verbose, disabled in production)

async _submitOrder(req) {
  const { orderID } = req.data;
  LOG.info(`Submitting order ${orderID} for user ${req.user.id}`);

  try {
    await this._processOrderSubmission(orderID);
    LOG.info(`Order ${orderID} submitted successfully`);
  } catch (err) {
    LOG.error(`Failed to submit order ${orderID}`, err);
    req.error(500, 'ORDER_SUBMISSION_FAILED');
  }
}
```

### Log Levels by Scenario

| Scenario | Level |
|----------|-------|
| Request start/end for important actions | `info` |
| Business validation failure | `warn` |
| External service call failure | `error` |
| Intermediate computation steps | `debug` |
| Normal CRUD operations | No logging (CAP does it) |

---

## Global Error Handler

For errors that escape handlers (e.g., middleware errors), add a top-level error interceptor in `server.js` if your project has one:

```js
// server.js (optional custom server)
const cds = require('@sap/cds');

cds.on('bootstrap', (app) => {
  // Catch-all for unhandled errors
  app.use((err, req, res, next) => {
    const LOG = cds.log('server');
    LOG.error('Unhandled error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please contact support.'
      }
    });
  });
});
```

---

## Review Checklist

- [ ] No `throw new Error()` inside CAP service handlers — use `req.error()`
- [ ] `req.reject()` used when execution should stop immediately
- [ ] `req.error()` used when accumulating multiple validation errors
- [ ] Correct HTTP status codes used (400/403/404/409 — not 500 for business errors)
- [ ] All user-facing messages defined in i18n `.properties` files
- [ ] Utility functions throw typed errors (`ValidationError`, etc.), not `req.error()`
- [ ] Handlers catch typed errors from utilities and convert to `req.error()`
- [ ] `cds.log()` used instead of `console.log`
- [ ] No sensitive data (passwords, tokens, PII) in log messages
- [ ] Error messages include enough context (entity ID, field name) to diagnose the issue
