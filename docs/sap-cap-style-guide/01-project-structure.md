# 01 — Project Structure

## Standard CAP Project Layout

Every CAP project must follow this directory structure. Deviations require team approval and must be documented.

```
my-cap-project/
├── app/                        # Frontend applications (UI5/Fiori)
│   └── my-app/
│       ├── webapp/
│       │   ├── controller/
│       │   ├── view/
│       │   ├── i18n/
│       │   ├── manifest.json
│       │   └── index.html
│       └── xs-app.json
├── db/                         # Database layer
│   ├── schema.cds              # Core entity definitions
│   ├── data/                   # CSV seed data for development
│   │   └── my.namespace-Entity.csv
│   └── src/                    # HANA-specific artifacts (if needed)
├── srv/                        # Service layer
│   ├── catalog-service.cds     # Service definition
│   ├── catalog-service.js      # Service handler
│   ├── admin-service.cds
│   ├── admin-service.js
│   └── lib/                    # Shared utilities within srv
│       ├── validators.js
│       └── helpers.js
├── test/                       # Test files
│   ├── unit/
│   │   └── validators.test.js
│   └── integration/
│       └── catalog-service.test.js
├── .cdsrc.json                 # CDS configuration
├── .env                        # Local environment variables (never commit)
├── .env.example                # Template for .env (always commit)
├── .eslintrc.cjs               # ESLint config
├── .gitignore
├── .prettierrc
├── mta.yaml                    # Multi-target application descriptor (BTP deploy)
├── package.json
└── README.md
```

---

## Directory Rules

### `db/`

- Contains **only** CDS schema files and CSV seed data.
- Do not put service-layer logic here.
- One `schema.cds` for the core domain model. Split into multiple files (e.g., `schema-orders.cds`, `schema-products.cds`) when a domain grows beyond ~10 entities. Import them from `schema.cds` using `using from`.
- CSV files must match the fully qualified entity name: `namespace.EntityName.csv`.

```cds
// db/schema.cds
namespace com.company.sales;

entity Orders {
  key ID   : UUID;
  status   : String(20) default 'OPEN';
  customer : Association to Customers;
  items    : Composition of many OrderItems on items.order = $self;
}
```

### `srv/`

- One `.cds` file and one `.js` file per service. They must have the same base name.
- Put shared utility code in `srv/lib/`. Never import utilities from `db/`.
- Service handlers must export a class or function via `module.exports`.

```
srv/
├── catalog-service.cds    # "What" — exposed entities, actions
├── catalog-service.js     # "How" — event handlers, custom logic
├── admin-service.cds
├── admin-service.js
└── lib/
    ├── validators.js      # Reusable validation functions
    ├── calculators.js     # Business calculations
    └── external/          # External service adapters
        └── s4-sales.js
```

### `app/`

- Each UI5/Fiori application lives in its own subdirectory.
- The subdirectory name becomes the app's route path.
- See [07 — Frontend](./07-frontend-ui5-fiori.md) for internal app structure rules.

### `test/`

- Mirror the `srv/lib/` structure inside `test/unit/`.
- Mirror service names inside `test/integration/`.
- Test files must end with `.test.js`.

---

## Configuration Files

### `.cdsrc.json`

Central CDS configuration. Keep it minimal and well-commented.

```json
{
  "requires": {
    "db": {
      "kind": "sqlite",
      "credentials": {
        "database": ":memory:"
      }
    },
    "[production]": {
      "db": {
        "kind": "hana"
      }
    },
    "auth": {
      "kind": "mocked"
    },
    "[production]": {
      "auth": {
        "kind": "xsuaa"
      }
    }
  },
  "i18n": {
    "default_language": "en",
    "folders": ["_i18n", "i18n"]
  },
  "log": {
    "service": true
  }
}
```

### `package.json` Scripts

Every project must expose these scripts:

```json
{
  "scripts": {
    "start": "cds-serve",
    "dev": "cds watch",
    "build": "cds build",
    "test": "jest --runInBand",
    "test:unit": "jest test/unit --runInBand",
    "test:integration": "jest test/integration --runInBand",
    "lint": "eslint . --ext .js,.cjs,.mjs",
    "lint:fix": "eslint . --ext .js,.cjs,.mjs --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### `.env.example`

Always maintain an up-to-date example file for local setup:

```env
# Authentication
CDS_SECURITY_MOCK_USER_ROLES=admin,viewer

# HANA Cloud (fill in for local HANA testing)
# VCAP_SERVICES=...

# External services
# S4_URL=https://my-s4-system.example.com
# S4_KEY=
```

---

## Naming Conventions Summary

| Artifact | Convention | Example |
|----------|-----------|---------|
| CDS namespace | `com.company.domain` | `com.acme.sales` |
| Entities | PascalCase | `SalesOrder` |
| Entity elements | camelCase | `orderDate`, `totalAmount` |
| Service names (CDS) | PascalCase + `Service` | `CatalogService` |
| Service file (js/cds) | kebab-case | `catalog-service.js` |
| Actions / Functions | camelCase | `submitOrder`, `getStatus` |
| Parameters | camelCase | `orderID`, `quantity` |
| JS variables | camelCase | `salesOrder`, `lineItems` |
| JS constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| JS classes | PascalCase | `OrderValidator` |
| Test files | same-name + `.test.js` | `validators.test.js` |
| CSV seed data | `namespace-Entity.csv` | `com.acme.sales-Orders.csv` |

---

## What NOT to Do

```
# BAD: flat structure with everything at root
├── Orders.cds
├── handler.js
├── utils.js
└── test.js

# BAD: mixing frontend inside srv
├── srv/
│   ├── my-service.js
│   └── webapp/          <-- Frontend does not belong here

# BAD: single monolithic handler
├── srv/
│   └── all-services.js  <-- Handles 5 different services

# BAD: hardcoded connection strings in code
const db = connect('hana://user:password@host'); // NEVER
```

---

## Review Checklist

- [ ] Project follows the standard CAP directory layout
- [ ] One `.cds` + one `.js` file per service, same base name
- [ ] Shared utilities are in `srv/lib/`
- [ ] No business logic in `db/` files
- [ ] CSV seed data filenames match entity namespace
- [ ] `.env.example` is up to date with all required variables
- [ ] Test directory mirrors the service structure
- [ ] No hardcoded credentials or connection strings anywhere
