# 10 — Git Workflow

A consistent Git workflow reduces merge conflicts, makes history readable, and ensures the main branch is always deployable.

---

## Branching Strategy

This project uses **GitHub Flow** — a simplified, continuous delivery-friendly model.

```
main (always deployable)
  └── feature/add-order-approval
  └── fix/order-status-transition-bug
  └── chore/upgrade-cds-version
  └── docs/update-api-documentation
```

### Branch Naming

```
{type}/{short-description}
```

| Type | When to Use |
|------|------------|
| `feature/` | New functionality |
| `fix/` | Bug fix |
| `chore/` | Dependency updates, tooling, non-code changes |
| `docs/` | Documentation only |
| `refactor/` | Code restructure without behavior change |
| `test/` | Adding or fixing tests only |

```bash
# GOOD
git checkout -b feature/order-approval-workflow
git checkout -b fix/order-status-transition-bug
git checkout -b chore/upgrade-cds-7.5

# BAD
git checkout -b my-changes
git checkout -b fix
git checkout -b johns-branch
```

---

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
{type}({scope}): {short description}

{optional body — explain WHY, not WHAT}

{optional footer — BREAKING CHANGE, Closes #issue}
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `refactor` | Refactoring without behavior change |
| `chore` | Dependency update, config change |
| `docs` | Documentation only |
| `perf` | Performance improvement |
| `style` | Code style/formatting (no logic change) |
| `ci` | CI/CD pipeline changes |

### Examples

```bash
# GOOD — clear type, scope, and description
git commit -m "feat(orders): add order approval workflow with email notifications"
git commit -m "fix(catalog): correct decimal precision for price calculation"
git commit -m "test(admin): add authorization tests for product deletion"
git commit -m "chore: upgrade @sap/cds from 7.4.0 to 7.5.2"
git commit -m "docs: add CDS modeling guidelines to style guide"

# GOOD — with body explaining WHY
git commit -m "fix(orders): prevent double submission on rapid clicks

Orders could be submitted twice if the user clicked rapidly before
the first submission completed. Added idempotency check using a
submission lock flag that is cleared after confirmation.

Closes #42"

# BAD — vague
git commit -m "fix bug"
git commit -m "update code"
git commit -m "wip"
git commit -m "asdfgh"
```

### Breaking Changes

```bash
git commit -m "feat(api)!: change order status enum values to uppercase

BREAKING CHANGE: OrderStatus values changed from 'open'/'closed' to
'OPEN'/'CLOSED'. Clients must update their filter conditions.
Refer to migration guide in docs/migrations/v2.md."
```

---

## Pull Request Process

### Before Opening a PR

```bash
# 1. Sync with main
git fetch origin
git rebase origin/main

# 2. Run all checks locally
npm run lint
npm run format:check
npm test

# 3. Verify the build
npm run build
```

### PR Title

Use the same Conventional Commits format as commit messages:

```
feat(orders): add approval workflow with email notifications
fix(catalog): correct decimal precision on price calculation
```

### PR Description Template

Every PR must include:

```markdown
## Summary
Brief description of what changed and why.

## Changes
- Added `approveOrder` action to `OrderService`
- Added `Approver` role to `xs-security.json`
- Added integration tests for approval workflow

## Testing
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] Manual test: approve order as Alice, verify email received
- [ ] Authorization tested: Bob (Viewer) cannot approve

## Breaking Changes
None / [Describe breaking changes and migration steps]

## Related Issues
Closes #42
```

### PR Size

Keep PRs small and focused. A good PR:

- Addresses **one** feature, bug, or concern
- Has fewer than **400 lines changed** (excluding generated files and tests)
- Can be reviewed in under **30 minutes**

If a PR is larger, split it into a series of smaller PRs or use a feature branch as the base.

---

## Code Review Standards

### For Reviewers

**Do:**
- Approve only when all checklist items are met
- Comment on specific lines, not just the overall PR
- Distinguish between blocking issues (`needs fix`) and suggestions (`nit:`)
- Check the security and authorization section for any service changes

**Don't:**
- Approve PRs with failing tests or lint errors
- Approve without reviewing the test coverage
- Request changes based on personal style preferences that are not in the style guide

```markdown
<!-- Comment formats -->
needs fix: Missing `@requires` annotation on the new service — this would be inaccessible in production.

nit: Consider extracting this validation to `srv/lib/validators.js` for reusability.

question: Is there a test covering the case where `orderID` is not found?
```

### For Authors

- Do not merge your own PR without at least one approval (unless it's a hotfix with team lead approval).
- Address all `needs fix` comments before requesting re-review.
- Respond to `nit` and `question` comments — either implement the suggestion or explain why not.
- Keep conversations constructive and professional.

### Approval Requirements

| PR Type | Minimum Approvals |
|---------|-----------------|
| Feature | 1 senior review |
| Bug fix | 1 review |
| Hotfix (production issue) | 1 review (can merge immediately after) |
| Chore/docs | 1 review |
| Breaking change | 2 reviews + tech lead sign-off |

---

## Merge Strategy

Always **squash and merge** feature branches into `main`. This keeps the history clean.

```bash
# Local equivalent (only if doing it manually)
git checkout main
git merge --squash feature/order-approval-workflow
git commit -m "feat(orders): add approval workflow"
```

After merging, delete the feature branch:

```bash
git push origin --delete feature/order-approval-workflow
git branch -d feature/order-approval-workflow
```

---

## Rebasing vs Merging

- **Rebase** your feature branch onto `main` to incorporate updates (not merge commits).
- **Never** rebase shared branches (main, shared feature branches with multiple contributors).

```bash
# GOOD — rebase your local branch
git fetch origin
git rebase origin/main

# If conflicts occur, resolve them, then:
git add .
git rebase --continue

# BAD — creates noisy merge commits on feature branches
git merge origin/main
```

---

## Tags and Releases

Tag releases on `main` using semantic versioning:

```bash
git tag -a v1.2.0 -m "Release 1.2.0 — Order Approval Workflow"
git push origin v1.2.0
```

| Version | When to bump |
|---------|-------------|
| MAJOR (v**2**.0.0) | Breaking changes to the OData API or authorization model |
| MINOR (v1.**2**.0) | New non-breaking features |
| PATCH (v1.2.**1**) | Bug fixes |

---

## `.gitignore` Requirements

Every CAP project `.gitignore` must include:

```gitignore
# Dependencies
node_modules/

# CAP generated files
gen/
dist/
.cds-sidecar*
*.hdbcds
*.hdbtabledata

# Local environment
.env
.env.local
*.local

# Testing
coverage/
.jest-cache/

# IDE
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
```

**Never commit:**
- `.env` files with real credentials
- `node_modules/`
- `gen/` or `dist/` (build artifacts)
- IDE-specific files

---

## Review Checklist

- [ ] Branch name follows `{type}/{description}` convention
- [ ] Commit messages follow Conventional Commits format
- [ ] No `wip`, `fix`, or vague commit messages
- [ ] PR has a clear title in Conventional Commits format
- [ ] PR description includes summary, changes, and testing checklist
- [ ] PR addresses one concern (no mixed feature + refactor)
- [ ] `npm run lint`, `npm run format:check`, and `npm test` all pass
- [ ] No `.env` or `node_modules/` committed
- [ ] Feature branch rebased onto latest `main` before merging
- [ ] Branch deleted after merging
- [ ] Breaking changes documented in PR and commit message
