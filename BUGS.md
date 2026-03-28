# Lincoln — Bug Tracker & Root Cause Analysis

Running log of all bugs, fixes, and architectural violations. Each entry includes **why** the error was coded so we learn from it and prevent recurrence.

**Last updated:** 2026-03-28

---

## How to Read This Document

| Field | Meaning |
|-------|---------|
| **ID** | Unique bug identifier (BUG-NNN) |
| **Status** | `OPEN`, `FIXED`, `WONTFIX`, `DEFERRED`, `FLAGGED` |
| **Severity** | `P0` (Critical/Security), `P1` (Core Feature), `P2` (Quality), `P3` (Enhancement) |
| **Principle Violated** | Which ARCHITECTURE.md principle was broken |
| **Root Cause Category** | Which of the 5 root cause patterns (see Appendix) |
| **Root Cause** | Why this error was coded in the first place |
| **Resolution** | How it was fixed (commit hash when available) |

### Status Definitions

| Status | Meaning |
|--------|---------|
| `OPEN` | Known bug, not yet fixed |
| `FIXED` | Bug resolved, root cause documented |
| `DEFERRED` | Intentionally postponed — has a trigger condition in ARCHITECTURE.md §6.4 |
| `FLAGGED` | Not yet a bug, but matches a known risk pattern (ARCHITECTURE.md §6.2). Logged proactively during pre-commit review to prevent it from becoming a bug. |
| `WONTFIX` | Accepted as-is with documented justification |

---

## Active Bugs

### BUG-001: Edge Runtime crash — PrismaClient in middleware
- **Status:** FIXED
- **Severity:** P0
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (commit `b063e2d`)
- **Symptoms:** 500 error on every page load. Runtime log: `PrismaClient is not configured to run in Edge Runtime`
- **Principle Violated:** §5.4 Edge Runtime Awareness
- **Root Cause:** `src/middleware.ts` imported `auth` from `@/lib/auth.ts`, which imports `PrismaAdapter(db)`, which constructs a `PrismaClient`. Next.js middleware runs in Edge Runtime where `PrismaClient` cannot execute. The `db.$use()` middleware added for audit log immutability (BUG-020 fix) changed the Prisma bundling behavior, causing the Edge error to become fatal.
- **Why it was coded this way:** The original `auth` import worked because NextAuth v5's `auth()` wrapper only validates JWTs in middleware (no DB calls needed). However, the import chain still pulled in `PrismaClient` at module scope. This was a latent bug from the initial codebase — it became visible when `db.$use()` was added, which forced Prisma to initialize more eagerly. The developer did not realize that module-scope side effects in imported files execute even if their exports aren't called.
- **Resolution:** Split auth config into `auth.config.ts` (Edge-safe, no Prisma) and `auth.ts` (full config with PrismaAdapter). Middleware imports only `auth.config.ts`. Replaced `UserRole` enum imports with string literals to avoid any `@prisma/client` dependency in Edge bundle.
- **Prevention:** §5.4 now documents Edge Runtime constraints. Any future middleware changes must verify no Prisma imports in the dependency chain.

---

### BUG-002: Kanban drag-and-drop not working
- **Status:** FIXED
- **Severity:** P1
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (PR #4)
- **Symptoms:** Cards could not be dragged between columns on the kanban board.
- **Principle Violated:** §1.1 Separation of Concerns (UI library misuse)
- **Root Cause:** `@dnd-kit` requires columns to register as droppable containers via the `useDroppable` hook. The `KanbanColumn` component did not register itself as a drop target. Additionally, an outer `SortableContext` wrapper around columns interfered with the inner `SortableContext` for cards within each column.
- **Why it was coded this way:** The developer used `SortableContext` (for reordering items) when they needed `useDroppable` (for drop targets). These are different concepts in `@dnd-kit`: sortable items can be reordered within a list, while droppable containers accept items from other containers. The outer `SortableContext` created conflicting drag contexts that swallowed the card drag events.
- **Resolution:** Added `useDroppable` hook to `KanbanColumn`. Removed the outer `SortableContext` wrapper. Each column now correctly registers as a drop zone, and each column's cards have their own `SortableContext`.
- **Prevention:** Document the `@dnd-kit` pattern: Columns = `useDroppable`, Cards = `useSortable`, one `SortableContext` per column.

---

### BUG-003: Billing time entries infinite loading
- **Status:** FIXED
- **Severity:** P1
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (PR #4)
- **Symptoms:** Billing page showed "Loading..." forever. Browser console: `SyntaxError: Unexpected token '<'` — API returning HTML instead of JSON.
- **Principle Violated:** §3.8 Error Handling Security, §1.10 Consistent API Contract
- **Root Cause:** The `GET /api/billing/time-entries` endpoint had no try-catch error handling. When a Prisma query failed (likely due to a missing table or column during early development), the unhandled error propagated to Next.js's default error handler, which returned an HTML error page instead of JSON.
- **Why it was coded this way:** The developer followed the pattern of other API routes but omitted the try-catch wrapper. This was likely a copy-paste oversight — some routes had error handling and some didn't, with no linter or template enforcing consistency.
- **Resolution:** Added try-catch to both GET and POST handlers in the time entries API. Errors now return `{ error: "..." }` JSON with status 500.
- **Prevention:** §5.1 API Route Template now mandates try-catch on every handler. All existing routes should be audited.

---

### BUG-004: Multiple 404 errors (Settings, Messages, Intake, Staff edit, Matter edit)
- **Status:** FIXED
- **Severity:** P1
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (PR #4 + PR #5)
- **Symptoms:** Navigating to Settings, Messages, Intake, or editing staff/matters returned 404.
- **Principle Violated:** §1.8 12-Factor App (Dev/prod parity)
- **Root Cause:** Multiple causes:
  1. **Settings, Messages, Admin pages:** These pages were created in the feature branch but the DO deploy was stuck on an older commit. The stale build didn't include the new page files.
  2. **Intake 404:** Sidebar linked to `/intake` but the page was at `/clients/intake`. The href was wrong in the sidebar component.
  3. **Staff/Matter edit:** Edit pages at `/admin/users/[id]/edit` and `/cases/[id]/edit` didn't exist yet — they were never created.
- **Why it was coded this way:** (1) DO App Platform reused a cached build artifact instead of rebuilding from the new commit. (2) The intake path was changed during development but the sidebar reference wasn't updated — a classic rename-without-grep. (3) Edit pages were referenced in UI buttons but the corresponding page files were never created — features were listed in the UI before being implemented.
- **Resolution:** (1) Force-triggered a new deploy by pushing additional commits. (2) Fixed sidebar href to `/clients/intake`. (3) Created the missing page files in PR #5.
- **Prevention:** Add a build step that verifies all internal `href` values resolve to existing routes. Feature UI should not link to pages that don't exist.

---

### BUG-005: Documents page client-side error
- **Status:** FIXED
- **Severity:** P1
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (PR #5)
- **Symptoms:** `Application error: a client-side exception has occurred`
- **Principle Violated:** §1.7 Graceful Degradation
- **Root Cause:** The documents page component attempted to access properties on a null/undefined object, likely related to decryption of document metadata or a missing relation in the Prisma query (e.g., `document.matter.title` when `matter` is null).
- **Why it was coded this way:** The component assumed all documents have a linked matter, but `matterId` is nullable in the schema. The optional relation was not handled with null-safe access.
- **Resolution:** Added null checks and optional chaining for nullable relations. Added error boundary handling.
- **Prevention:** §2.2 Referential Integrity — nullable foreign keys must always be handled with optional chaining in the UI.

---

### BUG-006: tenantId coercion allows cross-tenant data leakage
- **Status:** OPEN
- **Severity:** P0
- **Found:** 2026-03-27 (architecture audit)
- **Symptoms:** No user-visible symptom — this is a latent security vulnerability.
- **Principle Violated:** §2.1 Multi-Tenant Data Isolation, §3.1 Zero Trust
- **Root Cause:** ~15 API routes use the pattern `where: { tenantId: session.user.tenantId ?? undefined }`. If `tenantId` is null (theoretically possible for SUPER_ADMIN accounts), the `?? undefined` converts it to `undefined`, and Prisma interprets `where: { tenantId: undefined }` as "no filter on tenantId" — returning ALL tenants' data.
- **Why it was coded this way:** The developer used `?? undefined` as a TypeScript null-safety pattern without understanding Prisma's behavior. In most ORMs, passing `undefined` for a field removes it from the WHERE clause entirely. The developer likely intended "if null, don't filter" for SUPER_ADMIN, but this should be an explicit code path, not an implicit removal of the security filter.
- **Affected files:** `messages/route.ts`, `notifications/route.ts`, `contacts/route.ts`, `billing/invoices/route.ts`, `billing/trust/transactions/route.ts`, and ~10 others.
- **Resolution:** PENDING — Replace all `?? undefined` with explicit null checks that return 401.
- **Prevention:** §2.1 now explicitly prohibits `?? undefined` on tenantId. Pre-merge checklist includes this check.

---

### BUG-007: Missing audit logging on sensitive reads
- **Status:** OPEN
- **Severity:** P1
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §3.6 Audit Trail Completeness
- **Root Cause:** Several GET endpoints that return sensitive data do not call `writeAuditLog()`:
  - `GET /api/notifications` — reads user notifications
  - `GET /api/billing/invoices` — reads financial data
  - `GET /api/billing/rules` — reads retainer rules
  - `GET /api/contacts` — reads contact information
  - `PATCH /api/notifications` — marks notifications as read (state change)
  - `PUT /api/kanban/columns/[id]` — updates column (state change)
- **Why it was coded this way:** The developer treated audit logging as required for "writes" but optional for "reads." This is a common misconception. Under HIPAA, accessing (reading) PHI is itself an auditable event. The developer also may not have considered notifications and billing data as "sensitive" in the HIPAA sense.
- **Resolution:** PENDING — Add `writeAuditLog()` to all affected endpoints.

---

### BUG-008: Hard deletes on compliance-sensitive data
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §2.3 Soft Deletes for Compliance Data
- **Root Cause:** Two operations use hard `DELETE`:
  - Kanban columns: `db.kanbanColumn.delete()` when column is empty
  - Invoices: `db.invoice.delete()` for DRAFT status invoices
- **Why it was coded this way:** The developer considered empty kanban columns and draft invoices as "ephemeral" data not requiring retention. While kanban columns may qualify, invoices — even drafts — may be relevant to a legal matter's history and should be soft-deleted.
- **Resolution:** PENDING — Convert invoice delete to soft delete. Evaluate kanban columns case-by-case.

---

### BUG-009: No rate limiting on public intake endpoint
- **Status:** OPEN
- **Severity:** P1
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §3.7 Rate Limiting
- **Root Cause:** `POST /api/intake/public` accepts form submissions from unauthenticated users with no rate limiting. An attacker could spam thousands of intake submissions, filling the database and creating a denial-of-service condition.
- **Why it was coded this way:** Rate limiting was deferred as a "later" concern. The endpoint was built to be functional first, with security hardening planned for a future sprint.
- **Resolution:** PENDING — Add IP-based rate limiting (5 submissions per IP per hour).

---

### BUG-010: Inconsistent error response format
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §1.10 Consistent API Contract
- **Root Cause:** API routes return errors inconsistently:
  - Some use `{ message: "...", status: 4xx }`
  - Some use `{ error: "...", status: 4xx }`
  - Validation errors use `{ message: "...", errors: parsed.error.flatten() }`
- **Why it was coded this way:** No error response standard was defined before development began. Different routes were written at different times, and each developer (or AI session) used slightly different conventions. Without a documented standard, drift was inevitable.
- **Resolution:** PENDING — Standardize all routes to use `{ error: string, details?: object }`.

---

### BUG-011: Document IV format not validated on read
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §3.2 Input Validation at Boundaries
- **Root Cause:** Document download splits `document.iv` on `:` without validating the result:
  ```typescript
  const [iv, authTag] = document.iv.split(":");
  ```
  If the `iv` field is corrupted or malformed, `authTag` will be `undefined`, causing a silent decryption failure or crash.
- **Why it was coded this way:** The developer assumed data integrity — if the encryption succeeded on upload, the stored IV:AuthTag format would always be valid. This assumption ignores database corruption, manual edits, or migration errors.
- **Resolution:** PENDING — Add validation that `split(":")` returns exactly 2 non-empty hex strings.

---

### BUG-012: Decimal precision loss in billing calculations
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §2.6 Decimal Precision for Financial Data
- **Root Cause:** Billing routes convert Prisma `Decimal` values to JavaScript `number` for arithmetic:
  ```typescript
  const newAmountPaid = Number(invoice.amountPaid) + amount;
  ```
  JavaScript `number` is IEEE 754 double-precision float. For most real-world invoice amounts this is fine, but it can produce rounding errors (e.g., `0.1 + 0.2 = 0.30000000000000004`).
- **Why it was coded this way:** JavaScript doesn't have a native Decimal type. The developer used the simplest approach (`Number()` conversion) without considering precision implications. Prisma's `Decimal` type wraps `decimal.js` but requires explicit use of its arithmetic methods.
- **Resolution:** PENDING — Use Prisma Decimal methods or a library like `decimal.js` for all monetary arithmetic.

---

### BUG-013: Missing indexes on frequently-queried foreign keys
- **Status:** OPEN
- **Severity:** P3
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §2.8 Indexing Strategy
- **Root Cause:** Models like `TrustTransaction`, `Invoice`, and `TimeEntry` reference `matterId` but lack explicit composite indexes like `@@index([tenantId, matterId])`. At current scale (~500 clients) this is not a performance issue, but it will become one.
- **Why it was coded this way:** Prisma auto-creates indexes for `@relation` fields in some cases, but compound indexes must be declared explicitly. The developer relied on Prisma's defaults without profiling query patterns.
- **Resolution:** DEFERRED — Add indexes when query performance becomes measurable. Document in schema comments.

---

### BUG-014: No error boundaries on dashboard pages
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §1.7 Graceful Degradation
- **Root Cause:** If a database query or decryption operation throws in a Server Component, the entire page crashes with Next.js's generic error page. There are no `error.tsx` boundary files in the route segments.
- **Why it was coded this way:** Error boundaries were deferred as a polish item. The developer focused on happy-path functionality first, which is common in MVP development but creates a poor user experience when errors inevitably occur.
- **Resolution:** PENDING — Add `error.tsx` files to each major route segment.

---

### BUG-015: Kanban card position collisions possible
- **Status:** OPEN
- **Severity:** P2
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §2.2 Referential Integrity
- **Root Cause:** When moving a card between columns, the `position` field is updated but there's no atomic reordering of other cards in the target column. If two concurrent moves target the same position, both cards will have the same position value.
- **Why it was coded this way:** The move operation updates only the moved card's position, not the surrounding cards. The developer assumed single-user usage or relied on the UI to prevent conflicts. This is a classic optimistic concurrency bug.
- **Resolution:** PENDING — Wrap card moves in a transaction that atomically adjusts all positions in both source and target columns.

---

### BUG-016: Encryption salt defaults to empty string
- **Status:** OPEN
- **Severity:** P1
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §1.4 Fail-Safe Defaults, §3.4 Encryption Standards
- **Root Cause:** In `encryption.ts`, `ENCRYPTION_SALT` defaults to `""` if the env var is not set. An empty salt weakens the HKDF key derivation, making per-tenant keys more predictable.
- **Why it was coded this way:** The developer added a fallback to prevent crashes during local development when env vars aren't fully configured. The intent was "don't break in dev," but the consequence is "silently weaken security in any environment."
- **Resolution:** PENDING — Require `ENCRYPTION_SALT` in production. Throw on startup if missing when `NODE_ENV=production`.

---

### BUG-017: No cursor-based pagination on list endpoints
- **Status:** OPEN
- **Severity:** P3
- **Found:** 2026-03-27 (architecture audit)
- **Principle Violated:** §2.7 Pagination
- **Root Cause:** All list endpoints use `take: N` without skip/cursor. Some use hardcoded limits (`take: 100`, `take: 500`). No endpoint returns total count for pagination UI.
- **Why it was coded this way:** At MVP scale, pagination wasn't needed — the target is ~20 attorneys and ~500 clients. The developer prioritized shipping features over scalability patterns.
- **Resolution:** DEFERRED — Add cursor-based pagination when any list exceeds 100 records in production.

---

### BUG-018: A/C badges missing on cases list
- **Status:** FIXED
- **Severity:** P2
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (PR #4)
- **Principle Violated:** §4.6 Visibility and Transparency (UX clarity)
- **Root Cause:** The cases list showed client and attorney names without visual distinction. Users couldn't tell at a glance who was the client vs. the attorney.
- **Why it was coded this way:** The initial cases page was built with minimal UI — just names and status badges. Role designation badges were not part of the initial design spec.
- **Resolution:** Added teal "C" badge for clients and blue "A" badge for attorneys on each case card.

---

### BUG-019: Sidebar intake link pointed to wrong URL
- **Status:** FIXED
- **Severity:** P1
- **Found:** 2026-03-27
- **Fixed:** 2026-03-27 (commit `d353918`)
- **Principle Violated:** §1.9 DRY (route constants should be centralized)
- **Root Cause:** Sidebar had `href="/intake"` but the intake page was at `/clients/intake`. The URL was changed during development but the sidebar reference was not updated.
- **Why it was coded this way:** Route paths were hardcoded as strings in multiple places. When the intake page was moved to `/clients/intake`, only the file system was updated — the sidebar was missed because there's no single source of truth for route paths.
- **Resolution:** Fixed the href. Long-term: consider a route constants file.

---

### BUG-020: Audit log immutability not enforced
- **Status:** FIXED
- **Severity:** P0
- **Found:** 2026-03-27 (requirements audit)
- **Fixed:** 2026-03-27 (PR #5, commit in `db.ts`)
- **Principle Violated:** §3.6 Audit Trail Completeness, HIPAA 6-year retention
- **Root Cause:** Nothing in the application prevented `db.auditLog.delete()` or `db.auditLog.update()` calls. While no code currently calls these, a future developer could accidentally delete or modify audit records.
- **Why it was coded this way:** The original developer relied on convention ("don't delete audit logs") rather than enforcement. There was no Prisma middleware to block prohibited operations.
- **Resolution:** Added `db.$use()` middleware that throws an error if any delete/update operation targets the `AuditLog` model. The error message references the HIPAA retention policy.
- **Prevention:** The guard is now documented in ARCHITECTURE.md §3.6.

---

### BUG-021: Tenant suspension not checked during auth
- **Status:** FIXED
- **Severity:** P0
- **Found:** 2026-03-27 (requirements audit)
- **Fixed:** 2026-03-27 (PR #5)
- **Principle Violated:** §1.4 Fail-Safe Defaults, §3.1 Zero Trust
- **Root Cause:** The auth flow (`authorize()` in `auth.ts`) did not check `tenant.isActive` when determining the user's active tenant. A user belonging to a suspended tenant could still log in and access data.
- **Why it was coded this way:** The `Tenant.isActive` field existed in the schema but was never checked in the auth flow. The developer built the login flow against active tenants only during testing and didn't consider the suspension use case.
- **Resolution:** Added filter in `authorize()`: `user.tenantUsers.filter(tu => tu.tenant.isActive)`. If all tenants are suspended, login is denied with an audit log entry.

---

### BUG-022: Client record access not audit logged
- **Status:** FIXED
- **Severity:** P0
- **Found:** 2026-03-27 (requirements audit)
- **Fixed:** 2026-03-27 (PR #5)
- **Principle Violated:** §3.6 Audit Trail Completeness
- **Root Cause:** `GET /api/clients` returned client records without calling `writeAuditLog()`. Under HIPAA, accessing client records (which contain or link to PHI) is an auditable event.
- **Why it was coded this way:** Same as BUG-007 — the developer treated reads as non-auditable.
- **Resolution:** Added `writeAuditLog({ action: "client.list" })` to the GET handler.

---

### BUG-023: Document checksum not verified on download
- **Status:** FIXED
- **Severity:** P0
- **Found:** 2026-03-27 (requirements audit)
- **Fixed:** 2026-03-27 (PR #5)
- **Principle Violated:** §4.5 End-to-End Security
- **Root Cause:** Documents are uploaded with a SHA-256 checksum stored in the database, but the download route did not verify the checksum after decryption. A corrupted or tampered file would be served without detection.
- **Why it was coded this way:** The developer implemented checksum generation on upload but forgot to implement verification on download. This is a common "write path vs. read path" asymmetry.
- **Resolution:** Added checksum verification in the download route. After decryption, compute SHA-256 of the plaintext and compare against the stored checksum. Return 500 if mismatch.

---

---

### BUG-024: Task added in case view overwrites existing task instead of creating new one
- **Status:** OPEN
- **Severity:** P1
- **Found:** 2026-03-28
- **Symptoms:** When adding a task from the case detail view, an existing task for that case is modified rather than a new task being created.
- **Principle Violated:** §1.5 Immutable Operations (mutations must target explicit IDs, not implicit first-match)
- **Root Cause:** PENDING INVESTIGATION — likely the POST handler for task creation is performing an upsert or finding an existing card and updating it instead of always inserting a new record.
- **Resolution:** PENDING — Verify the task creation API always uses `db.kanbanCard.create()` and never `upsert()` or `update()` for the create path. The UI should POST to a create endpoint, not a general-purpose save endpoint.

---

### BUG-025: Note authorship, edit window, and client visibility not enforced
- **Status:** DEFERRED
- **Severity:** P1
- **Found:** 2026-03-28
- **Principle Violated:** §2.4 Ownership and Authorization
- **Requirements:**
  1. Notes must be attributed to their author (userId stored on creation).
  2. Notes may only be edited by their author, and only within 24 hours of creation.
  3. Notes may be marked `firmInternal: true` — these must never be returned in client portal queries.
  4. Notes may be added by clients (via portal), staff, attorneys, and admins.
- **Root Cause:** Note authorship was stored but edit-window enforcement and `firmInternal` filtering were not implemented. Client portal queries do not yet filter on `firmInternal`.
- **Resolution:** PENDING:
  - Add `firmInternal` boolean field to `Note` schema (default `false`).
  - Add `authorId` field if not already present; enforce it on creation.
  - In note UPDATE API: reject if `now - note.createdAt > 24h` OR `session.user.id !== note.authorId` (unless `FIRM_ADMIN`/`SUPER_ADMIN`).
  - In client portal note queries: always add `where: { firmInternal: false }`.
- **Trigger:** Implement before client portal notes are exposed.

---

### BUG-026: Document client-visibility requires 2-step confirmation
- **Status:** DEFERRED
- **Severity:** P1
- **Found:** 2026-03-28
- **Principle Violated:** §4.6 Visibility and Transparency
- **Requirements:** Before a document can be toggled to `allowClientView: true`, the user must pass a 2-step confirmation modal displaying: *"Some material may not be shared directly with clients based on NDAs, discovery rules, or court orders. By confirming, you are stating this document may be shared with and downloaded by the client."*
- **Root Cause:** The `allowClientView` toggle was implemented as a simple boolean flip with no confirmation gate.
- **Resolution:** PENDING — Wrap the `allowClientView = true` action in a confirmation dialog. The confirmation should be a separate UI step (not just a toast). Log the confirmation in the audit log as `document.visibility.confirmed`.
- **Trigger:** Implement before document visibility controls are shipped to production.

---

### BUG-027: Project stage not enforced by permission or visible in case screen
- **Status:** DEFERRED
- **Severity:** P2
- **Found:** 2026-03-28
- **Requirements:**
  1. Project stage (matter status / kanban column) must only be editable by assigned staff or firm admins. Unassigned users may view but not change it.
  2. The current project stage must be displayed on the case detail screen.
  3. Users with permission may edit the project stage directly from the case detail screen (no need to navigate to the kanban board).
- **Root Cause:** Stage editing has no permission check beyond general matter-write access. The case detail page shows status badges but does not surface the kanban column (project stage) as an editable field.
- **Resolution:** PENDING:
  - Add `STAGE_EDIT` permission (assigned staff + firm admins only).
  - Display current kanban column on case detail page.
  - Add inline stage-change control on case detail, guarded by `STAGE_EDIT` permission.
- **Trigger:** Implement in same sprint as task PM work (BUG-028).

---

### BUG-028: Action Items must be refactored to Tasks with Kanban + list views, case integration, and separate Kanban topics
- **Status:** DEFERRED
- **Severity:** P2
- **Found:** 2026-03-28
- **Requirements:**
  1. Rename "Action Items" to "Tasks" throughout the UI and data model.
  2. Tasks must support both a **Kanban view** and a **list view** (toggle between them).
  3. Task Kanban column topics are a **distinct dataset** from the Case Project Management kanban columns — they are separate boards with separate columns.
  4. Tasks per case must be visible on the case detail screen.
  5. Tasks can be created from the case detail view (linked to that case).
  6. Fix BUG-024 (task creation overwrites existing task) as part of this work.
- **Root Cause:** Action Items was built as a flat list backed by `KanbanCard` due dates. It was never intended to be a full task management system with its own kanban board. The data model needs to be separated or a new `Task` / `TaskBoard` model introduced.
- **Resolution:** PENDING — Design review required. Options:
  - Option A: Create a `TaskBoard` and `TaskColumn` model separate from `KanbanBoard`/`KanbanColumn`.
  - Option B: Add a `boardType` enum (`CASE_STAGE` vs `TASK`) to distinguish boards.
  - Rename `action-items` route to `tasks`.
- **Trigger:** Implement after BUG-024 (task creation bug) is fixed.

---

### BUG-029: Billing items not addable from case view or task view
- **Status:** DEFERRED
- **Severity:** P2
- **Found:** 2026-03-28
- **Requirements:**
  1. Billing time entries can be added from the case detail view (pre-associated to the case).
  2. Billing time entries can be added from the billing view (existing — verify works).
  3. Billing time entries can be added from the task view and associated to a specific task.
  4. Billing items can be associated to a document (deferred until document work is complete — see BUG-026).
- **Root Cause:** Billing entry creation exists only on the billing page. No quick-add affordance exists on case or task views. Task-billing association requires a `taskId` foreign key on `TimeEntry` that does not yet exist.
- **Resolution:** PENDING:
  - Add "Add Time Entry" quick-action to the case detail view (pre-fill `matterId`).
  - Add `taskId` nullable FK to `TimeEntry` model (schema migration required).
  - Add "Log Time" action to task detail / task card.
  - Document association deferred until BUG-026 is resolved.
- **Trigger:** Implement after Task PM refactor (BUG-028) is complete.

---

### BUG-030: Billing rates not configurable per attorney, staff, or matter type
- **Status:** DEFERRED
- **Severity:** P2
- **Found:** 2026-03-28
- **Requirements:** Firm admins must be able to set billing rates:
  - Per attorney / staff member (default hourly rate for that user)
  - Per matter type / practice area (rate that overrides user default for that area)
  - Matter-level rate override (already partially supported via `Matter.hourlyRate`)
- **Root Cause:** The current billing rate is stored only at the matter level (`Matter.hourlyRate`). There is no user-level or practice-area-level rate configuration.
- **Resolution:** PENDING:
  - Add `defaultHourlyRate` to `TenantUser` or `User` model.
  - Add `hourlyRate` to `PracticeArea` model.
  - Rate resolution order: matter-level override → practice area rate → user default rate.
  - Expose rate configuration in firm admin settings.
- **Trigger:** Implement in same sprint as billing improvements.

---

### BUG-031: Permissions matrix documentation does not exist
- **Status:** DEFERRED
- **Severity:** P3
- **Found:** 2026-03-28
- **Requirements:** A human-readable permissions matrix must be created and kept in sync with `src/lib/permissions.ts`. It should show every permission string, which roles have it, and what UI features it gates.
- **Root Cause:** Permissions are defined in code (`permissions.ts`) but there is no external reference document. Role/feature access is difficult to audit without reading code.
- **Resolution:** PENDING — Create `PERMISSIONS.md` at the project root. Auto-generation from `permissions.ts` preferred; manual document acceptable for now.
- **Trigger:** Create before next permission audit or new role addition.

---

## Summary Statistics

| Status | Count |
|--------|-------|
| FIXED | 12 |
| OPEN | 12 |
| DEFERRED | 8 |
| **Total** | **32** |

| Severity | Open | Fixed |
|----------|------|-------|
| P0 | 1 | 5 |
| P1 | 4 | 4 |
| P2 | 6 | 1 |
| P3 | 3 | 0 |

---

## Appendix: Common Root Cause Categories

Understanding *why* bugs happen helps prevent them:

### Category 1: Implicit Behavior Assumptions
**Bugs:** BUG-001, BUG-006, BUG-011
The developer assumed a library or runtime would behave a certain way without verifying. Examples: assuming `?? undefined` removes a field safely, assuming Edge Runtime supports all Node.js modules, assuming stored data is always well-formatted.

**Prevention:** Read library documentation for edge cases. Add explicit validation at boundaries. Never trust data format, even from your own database.

### Category 2: Write Path / Read Path Asymmetry
**Bugs:** BUG-007, BUG-022, BUG-023
Security or validation was implemented on the write path (creation/upload) but not on the read path (retrieval/download). This happens because developers focus on "how does data get in" and forget "what happens when data comes out."

**Prevention:** For every security control on writes, add the corresponding control on reads: encryption ↔ decryption + verification, audit on create ↔ audit on access, validation on input ↔ validation on output.

### Category 3: Convention vs. Enforcement
**Bugs:** BUG-008, BUG-010, BUG-020
The developer relied on team conventions ("we always do X") instead of technical enforcement. Conventions drift. Enforcement doesn't.

**Prevention:** If a rule matters, enforce it in code: Prisma middleware for immutability, Zod schemas for validation, linter rules for patterns.

### Category 4: MVP Deferral
**Bugs:** BUG-009, BUG-014, BUG-017
Features were intentionally deferred for later implementation but not tracked. "We'll add pagination later" becomes "we forgot about pagination."

**Prevention:** This document. Every deferred item gets a bug entry with severity and a clear trigger for when it must be addressed.

### Category 5: Reference Staleness
**Bugs:** BUG-004, BUG-019
A resource was moved/renamed but references to it were not updated. This happens because references are strings, not checked by the compiler.

**Prevention:** Centralize route paths in a constants file. Use `grep` before renaming any path. Add smoke tests that verify all navigation links resolve.
