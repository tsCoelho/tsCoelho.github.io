# 08 — Code Style & Tooling

Consistent code style reduces cognitive load during code reviews and prevents debates about formatting. All style decisions in this guide are enforced through automated tooling.

---

## Tooling Setup

Every CAP project must include these tools configured and working:

```bash
npm install --save-dev eslint eslint-plugin-node prettier jest
```

`package.json` scripts (these must be runnable from a clean checkout):

```json
{
  "scripts": {
    "lint": "eslint . --ext .js,.cjs",
    "lint:fix": "eslint . --ext .js,.cjs --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "jest --runInBand"
  }
}
```

---

## ESLint Configuration

`.eslintrc.cjs` at the project root:

```js
// .eslintrc.cjs
'use strict';

module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'commonjs'
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended'
  ],
  plugins: ['node'],
  rules: {
    // ── Errors ──────────────────────────────────────────────────────
    'no-console': 'error',            // Use cds.log() instead
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',        // Allow _unused params in callbacks
      varsIgnorePattern: '^_'
    }],
    'no-var': 'error',                // Always let/const
    'no-eval': 'error',               // Security: no eval()
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // ── Style ────────────────────────────────────────────────────────
    'prefer-const': 'error',          // Use const unless reassignment needed
    'eqeqeq': ['error', 'always'],    // Always === not ==
    'curly': ['error', 'all'],        // Always use braces
    'no-throw-literal': 'error',      // throw only Error instances

    // ── Node.js ──────────────────────────────────────────────────────
    'node/no-unsupported-features/es-syntax': ['error', { version: '>=18.0.0' }],
    'node/no-missing-require': 'error',
    'node/no-extraneous-require': 'error',

    // ── Async ────────────────────────────────────────────────────────
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'warn',       // Usually a performance issue
    'require-await': 'error'          // async fn must have await
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['test/**/*.js'],
      rules: {
        'node/no-unpublished-require': 'off'
      }
    }
  ]
};
```

### ESLint Ignore

`.eslintignore`:
```
node_modules/
dist/
gen/
.cds-sidecar*
```

---

## Prettier Configuration

`.prettierrc` at the project root:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "always"
}
```

`.prettierignore`:
```
node_modules/
dist/
gen/
*.cds
*.csv
package-lock.json
```

> Note: CDS files have their own formatter (`cds format`) — do not run Prettier on `.cds` files.

---

## JavaScript Conventions

### Module System

Always use CommonJS (`require`/`module.exports`) for CAP service handlers — CAP's runtime is CommonJS.

```js
// GOOD — CommonJS (required for CAP handlers)
'use strict';
const cds = require('@sap/cds');
const { validateOrder } = require('./lib/validators');

module.exports = class CatalogService extends cds.ApplicationService { ... };

// BAD — ESM (not compatible with CAP runtime without extra config)
import cds from '@sap/cds';
export default class CatalogService extends cds.ApplicationService { ... }
```

### Variable Declarations

```js
// GOOD
const MAX_RETRIES = 3;            // Immutable value
let retryCount = 0;               // Mutable variable

// BAD
var retries = 0;                  // Never use var
```

### Functions

Prefer named functions and methods over anonymous arrow functions for handler registration (improves stack traces):

```js
// GOOD — named method (appears in stack traces)
async _validateOrder(req) {
  ...
}
this.before('CREATE', 'Orders', this._validateOrder);

// ACCEPTABLE — named arrow function stored in variable
const validateOrder = async (req) => { ... };
this.before('CREATE', 'Orders', validateOrder);

// BAD — anonymous arrow function (invisible in stack traces)
this.before('CREATE', 'Orders', async (req) => {
  // 30 lines of logic...
});
```

### Async/Await

Always use `async/await`. Never mix callback-style and promise-style in the same codebase.

```js
// GOOD
async function fetchOrder(orderID) {
  const order = await SELECT.one.from(Orders, orderID);
  return order;
}

// BAD — callback style
function fetchOrder(orderID, callback) {
  db.run(SELECT.one.from(Orders, orderID), (err, result) => {
    if (err) callback(err);
    else callback(null, result);
  });
}

// BAD — raw promise chain when async/await is cleaner
function fetchOrder(orderID) {
  return SELECT.one.from(Orders, orderID)
    .then(order => order)
    .catch(err => { throw err; });
}
```

### Destructuring

Use destructuring for clarity:

```js
// GOOD
const { ID, status, customer_ID } = req.data;
const { Orders, Products } = cds.entities('com.company.sales');

// GOOD — in function params
async function processOrder({ ID, status, customer_ID }) { ... }

// BAD — repetitive property access
const id = req.data.ID;
const status = req.data.status;
const customerId = req.data.customer_ID;
```

### String Formatting

Use template literals for string interpolation. Never concatenate with `+`:

```js
// GOOD
const message = `Order ${orderID} created by ${req.user.id}`;
LOG.info(`Processing ${items.length} line items for order ${orderID}`);

// BAD
const message = 'Order ' + orderID + ' created by ' + req.user.id;
```

### Object Shorthand

```js
// GOOD
const order = { ID, status, customer_ID };

// BAD
const order = { ID: ID, status: status, customer_ID: customer_ID };
```

### Optional Chaining and Nullish Coalescing

Use modern JavaScript features — the minimum Node.js version is 18:

```js
// GOOD
const customerName = order?.customer?.name ?? 'Unknown';
const quantity = req.data?.items?.[0]?.quantity ?? 0;

// BAD — manual null checks
const customerName = order && order.customer && order.customer.name
  ? order.customer.name
  : 'Unknown';
```

---

## CDS File Formatting

Use `cds format` (available in `@sap/cds-dk`):

```bash
npx cds format '**/*.cds'
```

CDS formatting rules to follow manually if the formatter is unavailable:

```cds
// Consistent indentation: 2 spaces
entity Orders : cuid, managed {
  status   : String(20) default 'OPEN';
  customer : Association to Customers;
  items    : Composition of many OrderItems
               on items.order = $self;
}

// Align colons in element lists for readability
entity Products : cuid {
  code    : String(10)   not null;
  name    : String(255)  not null;
  price   : Decimal(15,2) not null;
  active  : Boolean default true;
}

// One annotation per line for complex annotations
annotate Products with @(
  UI.LineItem: [
    { Value: code, Label: 'Code' },
    { Value: name, Label: 'Name' }
  ]
);
```

---

## Comments

Write comments that explain **why**, not **what**. The code explains what.

```js
// GOOD — explains why
// Orders from B2B customers skip the credit check flow as they have pre-approved credit lines
if (customer.type === 'B2B') {
  return this._submitB2BOrder(req);
}

// BAD — explains what (obvious from code)
// Check if customer is B2B
if (customer.type === 'B2B') {
  // Call B2B order submission
  return this._submitB2BOrder(req);
}

// GOOD — explains business rule that isn't obvious
// Quantity must be divisible by the product's lot size (e.g., bolts sold in packs of 100)
if (quantity % product.lotSize !== 0) {
  req.error(400, 'QUANTITY_MUST_BE_MULTIPLE_OF_LOT_SIZE', ['quantity']);
}
```

**JSDoc** is required for exported utility functions:

```js
/**
 * Validates that a quantity value is a positive integer.
 *
 * @param {number} quantity - The quantity to validate
 * @param {string} [fieldPath='quantity'] - CDS field path for error targeting
 * @throws {ValidationError} When quantity is not a positive integer
 */
function validateQuantity(quantity, fieldPath = 'quantity') {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError('QUANTITY_MUST_BE_POSITIVE', fieldPath);
  }
}
```

---

## File Header

Every JavaScript file in `srv/` must start with:

```js
'use strict';
```

This enables strict mode, catching common bugs like undeclared variables.

---

## Import Order

Organize `require` statements in this order, separated by blank lines:

```js
'use strict';

// 1. Node.js built-ins
const path = require('path');
const crypto = require('crypto');

// 2. SAP/external packages
const cds = require('@sap/cds');

// 3. Internal project modules
const { validateOrder } = require('./lib/validators');
const { calculateDiscount } = require('./lib/calculators');
```

---

## Editor Setup

Recommend (and provide) a `.editorconfig` file:

```ini
# .editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

## Pre-commit Hooks

Enforce formatting and linting automatically before commits with `husky` + `lint-staged`:

```bash
npm install --save-dev husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

```json
// package.json
{
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.cds": ["cds format"]
  }
}
```

---

## Review Checklist

- [ ] `'use strict'` at top of every JS file in `srv/`
- [ ] No `console.log` — `cds.log()` used instead
- [ ] No `var` declarations — `const`/`let` only
- [ ] `===` used for all equality checks (no `==`)
- [ ] Named methods used for handler registration (not inline anonymous functions)
- [ ] `async/await` used consistently (no callbacks, no `.then()` chains)
- [ ] Template literals used for string interpolation (no `+` concatenation)
- [ ] JSDoc present on all exported utility functions
- [ ] Imports organized in the defined order (built-in → SAP → internal)
- [ ] ESLint passes with zero warnings (`npm run lint`)
- [ ] Prettier passes (`npm run format:check`)
- [ ] Pre-commit hooks configured and working
