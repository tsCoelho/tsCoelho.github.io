# SAP CAP Node.js Style Guide

> A comprehensive guide for building maintainable, secure, and scalable SAP Cloud Application Programming Model applications.

## Purpose

This style guide defines conventions, patterns, and best practices for SAP CAP Node.js projects. It serves two audiences:

- **Junior developers**: Learn the right way to build CAP applications from the start.
- **Senior developers**: Use this as a baseline for code reviews, pull request standards, and team alignment.

This guide is **opinionated by design**. Where multiple valid approaches exist, one is recommended to reduce decision fatigue and keep the codebase consistent.

---

## Table of Contents

| # | Topic | Audience |
|---|-------|----------|
| [01](./01-project-structure.md) | Project Structure | All |
| [02](./02-cds-modeling.md) | CDS Data Modeling | All |
| [03](./03-service-layer.md) | Service Layer | All |
| [04](./04-error-handling.md) | Error Handling | All |
| [05](./05-security-authorization.md) | Security & Authorization | All |
| [06](./06-testing.md) | Testing | All |
| [07](./07-frontend-ui5-fiori.md) | Frontend: UI5 & Fiori Elements | All |
| [08](./08-code-style.md) | Code Style & Tooling | All |
| [09](./09-performance.md) | Performance | Senior |
| [10](./10-git-workflow.md) | Git Workflow | All |

---

## Quick Reference: The Golden Rules

These are non-negotiable across all CAP projects:

1. **CDS is the source of truth.** Define your data model, services, and annotations in `.cds` files. Never hardcode logic that belongs in CDS.
2. **No business logic in the database layer.** Put it in service handlers or reusable utility modules.
3. **Use `cds.error` for all error throwing.** Never `throw new Error()` in service handlers.
4. **Annotate authorization at the CDS level.** Never rely solely on programmatic checks in handlers.
5. **Write tests first or alongside feature code.** Use `@cap-js/cds-test` for integration tests.
6. **Never expose internal DB field names in external services.** Use projections and renaming in service definitions.
7. **One handler file per service.** Do not put all service logic in a single monolithic file.
8. **Prefer managed associations.** Let CAP handle foreign keys and joins.
9. **Follow CDS naming conventions strictly.** PascalCase for entities, camelCase for elements and parameters.
10. **Commit only working code.** The main/develop branch must always be deployable.

---

## Technology Stack Covered

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | SAP CAP (`@sap/cds` 7+) |
| Database | SAP HANA Cloud (production), SQLite (development) |
| Authentication | XSUAA (BTP), Local mock |
| Frontend | SAP UI5 / Fiori Elements |
| Testing | `@cap-js/cds-test`, Jest |
| Linting | ESLint + `eslint-plugin-cds` |
| Formatting | Prettier |
| CI/CD | SAP Business Technology Platform, GitHub Actions |

---

## How to Use This Guide

- During **feature development**: Follow the relevant section for the type of code you are writing.
- During **code review**: Use each section's checklist to validate changes systematically.
- During **onboarding**: Read all sections in order before touching production code.
- During **architecture discussions**: Reference sections 01, 02, and 03 to align on structure.

---

## Versioning

This guide targets `@sap/cds ^7.0.0` and Node.js `>=18`. Update this document when upgrading major versions of the CAP SDK.
