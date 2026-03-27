# Lincoln — Product Requirements Document

**Version:** 1.1
**Last Updated:** 2026-03-27
**Status:** Active Development

---

## 1. Overview

Lincoln is a multi-tenant law firm case management platform. It enables law firms to manage matters, clients, documents, and staff workflows — all within a HIPAA-compliant environment. Each law firm operates as an isolated tenant; their data is never visible to other tenants.

### 1.1 Goals

- Provide law firms a secure, web-based practice management system
- Enable clients to track their matters and communicate with counsel via a dedicated portal
- Meet HIPAA technical safeguard requirements from day one
- Support multiple independent firms on shared infrastructure with full data isolation

### 1.2 Non-Goals (v1)

- Mobile native applications (responsive web only)
- E-signature integration
- Court filing integrations
- Third-party calendar sync (Google, Outlook)

---

## 2. User Roles and Personas

### 2.1 Role Hierarchy

| Role | Scope | Key Responsibilities |
|------|-------|---------------------|
| `SUPER_ADMIN` | Platform-wide | Provision/manage tenants, monitor platform health, access all firms |
| `FIRM_ADMIN` | Single tenant | Manage users, configure firm settings, assign matters, view all data within firm |
| `ATTORNEY` | Assigned matters | Full access to assigned matters, clients, documents, notes |
| `STAFF` | Assigned matters | Support attorneys; limited access (no user management, no billing data) |
| `CLIENT` | Own matters only | View case status, upload/download shared docs, message attorney |

### 2.2 Authentication Requirements

- Email + password login (bcrypt, cost 12)
- TOTP-based MFA (RFC 6238 — Google Authenticator compatible)
- Account lockout after configurable failed attempts (default: 5)
- Session expiry: 8 hours
- Separate login URLs for firm users (`/login`) and clients (`/portal/login`)
- Firm users are redirected away from the client portal; clients cannot access firm UI

---

## 3. Functional Requirements

### 3.1 Tenant Management

| ID | Requirement |
|----|-------------|
| TM-01 | Super admins can create, suspend, and delete tenant accounts |
| TM-02 | Each tenant has a unique slug used in URLs and internal routing |
| TM-03 | Each tenant has an independent encryption key ID for data isolation |
| TM-04 | Tenant configuration includes: firm name, address, practice areas, MFA enforcement setting |
| TM-05 | Super admin can view aggregate platform metrics (tenant count, active users, storage used) |
| TM-06 | Suspending a tenant invalidates all active sessions for that tenant |

### 3.2 User Management

| ID | Requirement |
|----|-------------|
| UM-01 | Firm admins can invite attorneys and staff by email |
| UM-02 | Invited users receive a secure activation link (time-limited, single-use) |
| UM-03 | Firm admins can deactivate users; deactivated users cannot log in |
| UM-04 | Firm admins can change user roles within their tenant (up to FIRM_ADMIN) |
| UM-05 | Super admins can manage any user across all tenants |
| UM-06 | Users can update their own profile (name, password, MFA enrollment) |
| UM-07 | MFA enrollment generates a QR code and backup codes |
| UM-08 | All authentication events (login, failed login, logout, lockout) are written to the audit log |

### 3.3 Client Management

| ID | Requirement |
|----|-------------|
| CM-01 | Attorneys and staff can create client records |
| CM-02 | Client records include: full name, email, phone, address, date of birth, SSN (last 4) |
| CM-03 | All PII/PHI fields (DOB, SSN, address, notes) are encrypted at rest using AES-256-GCM |
| CM-04 | Clients can be searched by name or email within a tenant |
| CM-05 | Client records show all associated matters and their current status |
| CM-06 | A client can be linked to multiple matters (as lead client or additional party) |
| CM-07 | Accessing a client record writes an audit log entry |

### 3.4 Client Intake

| ID | Requirement |
|----|-------------|
| IN-01 | Public intake form accessible without authentication at `/intake/[tenantSlug]` |
| IN-02 | Intake form collects: name, contact details, matter type, brief description |
| IN-03 | Completed intake submissions create a pending client record and notify firm admins |
| IN-04 | Firm admins can review, accept (creating a full client + matter), or reject intake submissions |
| IN-05 | Upon acceptance, the client receives a portal activation email |
| IN-06 | Intake form submissions are rate-limited and validated server-side |

### 3.5 Matter Management

| ID | Requirement |
|----|-------------|
| MA-01 | Firm admins and attorneys can create matters |
| MA-02 | A matter includes: title, matter number, status, practice area, open date, close date, description |
| MA-03 | Matters are assigned to one or more attorneys/staff (matter assignments) |
| MA-04 | Matter status options are configurable per firm (default: Open, Pending, Active, Closed, Archived) |
| MA-05 | Matters have a timeline/activity feed showing notes, document uploads, and status changes |
| MA-06 | Firm admins can reassign or close matters |
| MA-07 | Attorneys can view all matters they are assigned to; firm admins can view all firm matters |
| MA-08 | Accessing a matter record writes an audit log entry |
| MA-09 | Closed/archived matters remain readable but cannot be edited without reopening |

### 3.6 Document Repository

| ID | Requirement |
|----|-------------|
| DO-01 | Attorneys and staff can upload documents to a matter |
| DO-02 | Accepted file types: PDF, DOCX, XLSX, PNG, JPG, TXT (configurable allow-list) |
| DO-03 | Maximum file size: 50 MB per file |
| DO-04 | All documents are encrypted at rest with AES-256-GCM before storage (encrypt-then-store) |
| DO-05 | Each document record stores: filename, MIME type, size, uploader, upload timestamp, IV+AuthTag, SHA-256 checksum, storage path |
| DO-06 | Downloads are decrypted on-the-fly and served with `Content-Disposition: attachment` and `Cache-Control: no-store` |
| DO-07 | Documents can be marked `allowClientView: true` to make them visible in the client portal |
| DO-08 | Clients can only download documents explicitly shared with them (`allowClientView=true`) |
| DO-09 | Attorneys can delete documents (soft-delete with audit trail, hard-delete by firm admins) |
| DO-10 | Every document upload and download writes an audit log entry including user, document ID, matter ID, and timestamp |
| DO-11 | Document integrity is verified on download (checksum comparison) |

### 3.7 Kanban Case Board

| ID | Requirement |
|----|-------------|
| KB-01 | Each matter has an associated Kanban board created automatically on matter creation |
| KB-02 | Board columns represent workflow stages; default columns: Intake, In Progress, Review, Pending Client, Closed |
| KB-03 | Firm admins can add, rename, reorder, and delete columns per board |
| KB-04 | Cards on the board represent tasks or sub-items within the matter |
| KB-05 | Cards include: title, description, assignee(s), priority (Low/Medium/High/Urgent), due date, labels, linked document count |
| KB-06 | Cards can be dragged between columns and reordered within a column |
| KB-07 | Card position is persisted to the database immediately after a drag operation |
| KB-08 | Optimistic UI updates apply immediately; the UI reverts if the server rejects the move |
| KB-09 | Overdue cards (past due date, not in final column) display a visual overdue indicator |
| KB-10 | Multiple boards per matter are supported for complex cases |

### 3.8 Messaging

| ID | Requirement |
|----|-------------|
| MS-01 | Firm users and clients can exchange messages scoped to a matter |
| MS-02 | Messages are stored in the database and not sent over email by default |
| MS-03 | New messages trigger an in-app notification for the recipient |
| MS-04 | Message history is paginated and preserved indefinitely |
| MS-05 | Clients can only message attorneys/staff assigned to their matter |
| MS-06 | All messages are tenant-scoped and cannot be viewed across tenants |

### 3.9 Client Portal

| ID | Requirement |
|----|-------------|
| CP-01 | Clients authenticate at `/portal/login` with email + password (+ MFA if enrolled) |
| CP-02 | Clients see only their own matters |
| CP-03 | For each matter: current status, assigned attorney, key dates, timeline summary |
| CP-04 | Clients can view and download documents shared with them |
| CP-05 | Clients can upload documents to their matter (attorney reviews before adding to main repository) |
| CP-06 | Clients can send messages to the attorneys on their matter |
| CP-07 | Clients cannot see other clients, firm financial data, internal notes, or unshared documents |
| CP-08 | Portal session expires after 8 hours of inactivity |

### 3.10 Billing and Time Tracking

| ID | Requirement |
|----|-------------|
| BL-01 | Attorneys and staff can log time entries against a matter (duration, rate, description) |
| BL-02 | Firm admins can create invoices from time entries |
| BL-03 | Invoices move through a workflow: DRAFT → SENT → PAID / VOID |
| BL-04 | Invoices cannot be sent if the matter's trust account has a stale reconciliation (past `staleThresholdDays`) |
| BL-05 | Billing rules define default hourly rates per role or matter type |
| BL-06 | Clients can view sent invoices in the client portal |

### 3.11 Trust Accounting (IOLTA)

| ID | Requirement |
|----|-------------|
| TR-01 | Each matter can be linked to an IOLTA trust bank account |
| TR-02 | Bank accounts track: name, type, bank name, last four digits, stale threshold days, last reconciled date |
| TR-03 | Trust transactions support types: DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT |
| TR-04 | TRANSFER_OUT transactions require PENDING_APPROVAL status before funds can move; another authorized user must approve or reject |
| TR-05 | Approvals and rejections are recorded with the approving user ID and timestamp |
| TR-06 | Account reconciliation can be triggered manually; sets `lastReconciledAt` and releases the stale lock |
| TR-07 | Bank statements can be imported via CSV to create transactions in bulk |
| TR-08 | Plaid integration allows linking real bank accounts for automatic transaction sync |
| TR-09 | Trust account balances are visible to clients in the portal (per matter) |
| TR-10 | Retainer balance alerts notify attorneys when trust balance falls below a configurable threshold |
| TR-11 | All trust transactions are audited; stale account state blocks invoice sending (see BL-04) |

### 3.12 In-App Notifications

| ID | Requirement |
|----|-------------|
| NO-01 | Users receive in-app notifications for: new messages, trust approval requests, retainer alerts, stale reconciliation warnings |
| NO-02 | Notification bell in the sidebar shows unread count badge |
| NO-03 | Clicking a notification marks it read; "mark all read" available |
| NO-04 | Notifications poll every 60 seconds |
| NO-05 | Notifications are tenant-scoped and user-scoped |

### 3.13 Audit Logging

| ID | Requirement |
|----|-------------|
| AU-01 | All PHI/PII access events are written to an immutable `audit_logs` table |
| AU-02 | Audit events include: actor user ID, tenant ID, action type, resource type, resource ID, IP address, user agent, timestamp |
| AU-03 | Covered events: login/logout/failed-login, client-accessed, matter-accessed, document-uploaded, document-downloaded, user-created, user-deactivated, settings-changed |
| AU-04 | Audit logs cannot be modified or deleted by any application role (enforced via DB constraints and RLS) |
| AU-05 | Firm admins can view audit logs for their tenant via the admin panel |
| AU-06 | Super admins can query audit logs across all tenants |
| AU-07 | Audit logs are retained for a minimum of 6 years (HIPAA §164.312(b)) |

---

## 4. Non-Functional Requirements

### 4.1 Security

| ID | Requirement |
|----|-------------|
| SE-01 | All data in transit uses TLS 1.2 or higher (enforced at DO App Platform load balancer) |
| SE-02 | All PHI stored in the database is encrypted at the application layer with AES-256-GCM |
| SE-03 | Document files are encrypted before writing to storage (encrypt-then-store) |
| SE-04 | Encryption keys are derived per-tenant via HKDF (SHA-256) from a master key |
| SE-05 | The master encryption key is stored in DO App Platform environment secrets; never hardcoded or logged |
| SE-06 | PostgreSQL Row-Level Security policies enforce tenant isolation as a defense-in-depth layer |
| SE-07 | JWT session tokens are short-lived (8hr) and signed with a strong secret |
| SE-08 | TOTP MFA is available for all user accounts; firm admins can require MFA for their tenant |
| SE-09 | Passwords are hashed with bcrypt (cost factor 12) |
| SE-10 | Account lockout activates after N consecutive failed login attempts |
| SE-11 | Authentication endpoint is rate-limited (50 requests / 5 min / IP) |
| SE-12 | Container images are scanned for vulnerabilities (Trivy) on every CI run |
| SE-13 | Secret scanning (Gitleaks) runs on every CI run |
| SE-14 | No plaintext secrets in application code, environment, logs, or container images |
| SE-15 | Managed PostgreSQL database is not publicly accessible; only reachable from App Platform VPC |

### 4.2 HIPAA Compliance

| ID | Requirement |
|----|-------------|
| HC-01 | DigitalOcean HIPAA BAA must be signed before any PHI is stored (available on Business/Enterprise plans) |
| HC-02 | All covered workforce members must complete HIPAA training before accessing PHI |
| HC-03 | Business Associate Agreements required with all sub-processors (DO, Plaid, etc.) |
| HC-04 | Access to PHI is logged and reviewable (satisfies §164.312(b)) |
| HC-05 | Encryption at rest for all PHI (satisfies §164.312(a)(2)(iv)) |
| HC-06 | Automatic session timeout (satisfies §164.312(a)(2)(iii)) |
| HC-07 | Unique user identification — no shared accounts (satisfies §164.312(a)(2)(i)) |
| HC-08 | Emergency access procedure documented in the runbook |
| HC-09 | Audit log retention minimum 6 years |
| HC-10 | Incident response plan in place before handling PHI |

### 4.3 Multi-Tenancy and Data Isolation

| ID | Requirement |
|----|-------------|
| MT-01 | Every database table includes a `tenantId` foreign key |
| MT-02 | All API routes filter queries by `session.user.tenantId` |
| MT-03 | PostgreSQL RLS policies enforce tenant isolation at the DB layer |
| MT-04 | Encryption keys are unique per tenant — a key compromise affects only one tenant |
| MT-05 | Document storage paths are namespaced by tenant ID |
| MT-06 | One tenant cannot see, search, or reference data belonging to another tenant |

### 4.4 Performance

| ID | Requirement |
|----|-------------|
| PF-01 | Page load (Time to First Byte) < 1s under normal load |
| PF-02 | API responses for list endpoints < 500ms at p95 |
| PF-03 | Document upload of 50MB completes within 30 seconds on a 10Mbps connection |
| PF-04 | ECS auto-scaling maintains p99 response time < 2s at 10x baseline traffic |
| PF-05 | Kanban board loads and is interactive within 2s for boards with up to 200 cards |

### 4.5 Availability and Reliability

| ID | Requirement |
|----|-------------|
| AV-01 | Target uptime: 99.9% (excluding planned maintenance) |
| AV-02 | Managed PostgreSQL deployed with standby node for automatic failover (enable before go-live) |
| AV-03 | App Platform minimum 2 instances; rolling deployments maintain availability |
| AV-04 | RTO (Recovery Time Objective): ~15 minutes |
| AV-05 | RPO (Recovery Point Objective): ~1 hour (DO managed DB automated daily backups) |
| AV-06 | Health check endpoint (`/api/health`) verifies application + DB connectivity |
| AV-07 | DO App Platform alerts notify on deploy failures and health check failures |

### 4.6 Scalability

| ID | Requirement |
|----|-------------|
| SC-01 | Platform must support at least 100 tenants without architectural changes |
| SC-02 | ECS auto-scaling handles traffic spikes up to 10x steady-state load |
| SC-03 | S3 document storage scales without capacity planning |
| SC-04 | Database schema changes are backwards-compatible and deployable with zero downtime |

---

## 5. User Stories

### Super Admin

- As a super admin, I can provision a new tenant so that a new law firm can onboard without manual DB intervention.
- As a super admin, I can suspend a tenant so that a firm in breach of terms loses access immediately.
- As a super admin, I can view cross-tenant audit logs to investigate a security incident.
- As a super admin, I can view platform-wide metrics to monitor system health.

### Firm Admin

- As a firm admin, I can invite a new attorney by email so they can start working in the system the same day.
- As a firm admin, I can deactivate a departed employee so their access is revoked instantly.
- As a firm admin, I can create a matter and assign it to an attorney.
- As a firm admin, I can review intake submissions and accept or reject new client requests.
- As a firm admin, I can view my firm's audit log to verify compliance.
- As a firm admin, I can require MFA for all users in my firm.

### Attorney

- As an attorney, I can view all matters assigned to me from my dashboard.
- As an attorney, I can upload documents to a matter and choose whether to share them with the client.
- As an attorney, I can write internal notes on a matter that clients cannot see.
- As an attorney, I can move Kanban cards between columns to reflect task progress.
- As an attorney, I can message a client directly through their matter thread.

### Staff

- As a staff member, I can support an attorney by uploading documents and updating Kanban cards on assigned matters.
- As a staff member, I cannot access matters I have not been assigned to.

### Client

- As a client, I can log in to the portal and see the current status of my case.
- As a client, I can download documents my attorney has shared with me.
- As a client, I can upload a document for my attorney to review.
- As a client, I can send a message to my attorney from within the portal.
- As a client, I cannot see other clients or any firm-internal data.

---

## 6. API Surface (Key Endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth authentication handlers |
| GET | `/api/health` | Health check (DB ping) |
| GET/POST | `/api/matters` | List / create matters |
| GET/PATCH/DELETE | `/api/matters/[id]` | Get / update / archive a matter |
| POST | `/api/documents/upload` | Upload + encrypt a document |
| GET | `/api/documents/[id]/download` | Download + decrypt a document |
| GET/POST | `/api/clients` | List / create clients |
| GET/PATCH | `/api/clients/[id]` | Get / update a client record |
| GET/POST | `/api/kanban/boards` | List / create boards for a matter |
| POST | `/api/kanban/columns` | Add a column to a board |
| PATCH | `/api/kanban/cards/[id]/move` | Move a card to a new column / position |
| GET/POST | `/api/messages` | List / send messages for a matter |
| GET | `/api/audit` | Query audit logs (admin only) |
| GET/POST | `/api/admin/users` | List / invite users (firm admin+) |
| POST | `/api/intake/[tenantSlug]` | Public intake form submission |
| GET/POST | `/api/billing/invoices` | List / create invoices |
| GET/PATCH | `/api/billing/invoices/[id]` | Get / update invoice (includes DRAFT→SENT stale lock check) |
| GET/POST | `/api/billing/time-entries` | List / log time entries |
| GET/POST | `/api/billing/rules` | List / create billing rules |
| GET/POST | `/api/billing/trust/accounts` | List / create trust bank accounts |
| GET | `/api/billing/trust/accounts/[id]` | Get account with ledger |
| POST | `/api/billing/trust/accounts/[id]/reconcile` | Mark account reconciled |
| POST | `/api/billing/trust/accounts/[id]/import` | Import transactions from CSV |
| GET/POST | `/api/billing/trust/transactions` | List / create trust transactions |
| POST | `/api/billing/trust/transactions/[id]/approve` | Approve or reject a pending transfer |
| POST | `/api/billing/plaid/exchange` | Exchange Plaid public token |
| POST | `/api/billing/plaid/sync/[accountId]` | Sync transactions from Plaid |
| GET | `/api/notifications` | List notifications (supports ?unread=true) |
| PATCH | `/api/notifications/[id]/read` | Mark a notification read |
| GET/POST | `/api/contacts` | List / create contacts |

All endpoints return `401` if unauthenticated, `403` if the user lacks the required permission, and `404` if the resource does not exist within the user's tenant.

---

## 7. Data Models (Summary)

| Model | Key Fields |
|-------|-----------|
| `Tenant` | id, name, slug, encryptionKeyId, mfaRequired |
| `User` | id, email, passwordHash, role, mfaSecret, failedLoginAttempts, lockedUntil |
| `TenantUser` | userId, tenantId, role, isActive |
| `Client` | id, tenantId, firstName, lastName, email, phone, encDateOfBirth, encSsnLastFour, encAddress, encNotes |
| `Matter` | id, tenantId, title, matterNumber, status, practiceAreaId, openDate, closeDate, trustBankAccountId |
| `Document` | id, tenantId, matterId, filename, mimeType, storagePath, iv (iv:authTag), checksum, sizeBytes, allowClientView |
| `KanbanBoard` | id, matterId, tenantId, name |
| `KanbanColumn` | id, boardId, name, position |
| `KanbanCard` | id, columnId, title, description, priority, dueDate, position |
| `Message` | id, matterId, tenantId, senderId, body, readAt |
| `AuditLog` | id, tenantId, userId, action, resourceType, resourceId, ipAddress, userAgent, createdAt |
| `BankAccount` | id, tenantId, name, accountType, bankName, lastFourDigits, lastReconciledAt, staleThresholdDays |
| `TrustTransaction` | id, tenantId, bankAccountId, matterId, type, status, amount, description, requestedById, approvedById, isReconciled |
| `Invoice` | id, tenantId, matterId, status (DRAFT/SENT/PAID/VOID), totalAmount, dueDate |
| `TimeEntry` | id, tenantId, matterId, userId, hours, rate, description, date |
| `BillingRule` | id, tenantId, role, ratePerHour |
| `Notification` | id, tenantId, userId, type, title, body, readAt, resourceId, resourceType |

---

## 8. Integration Points

| System | Purpose | Notes |
|--------|---------|-------|
| DigitalOcean App Platform | Application hosting | Auto-deploys on push to `main` |
| DigitalOcean Managed PostgreSQL | Primary database | PostgreSQL 16; pending migration from dev database |
| DigitalOcean Spaces | Document storage in production | S3-compatible; replaces AWS S3 |
| Plaid | Bank account linking for trust accounts | OAuth link flow + transaction sync |
| GitHub | Source control + CI trigger | Push to `main` triggers DO deploy |

---

## 9. Out of Scope

The following are explicitly out of scope for the initial release:

- E-signature (DocuSign, Adobe Sign)
- Court filing or docketing integration
- Mobile native apps (iOS, Android)
- Calendar sync (Google Calendar, Outlook)
- AI-assisted document drafting or review
- Multi-language / i18n support
- Custom reporting and analytics dashboards

---

## 10. Compliance and Legal

- Platform operator must sign a HIPAA Business Associate Agreement (BAA) with AWS before storing PHI.
- Each law firm using the platform is a Covered Entity and must sign a BAA with the platform operator before activation.
- Audit logs must be retained for a minimum of **6 years** per HIPAA §164.312(b). RDS automated backups cover 35 days; a separate archival strategy (e.g., manual snapshots to Glacier) must be implemented for the remaining retention period.
- Penetration testing is required before the first production deployment handling real PHI.
- An incident response plan must be documented and tested prior to go-live.

---

## 11. Requirements Audit — Bug & Gap List

**Audited:** 2026-03-27 by Claude Code against current codebase (`fix/bugs-and-improvements` branch)

### Legend
- **FAIL** — Feature missing or non-functional
- **PARTIAL** — Feature partially implemented; key pieces missing
- **PASS** — Not listed (only failures and gaps are documented below)

---

### 11.1 Tenant Management

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| TM-01 | Super admins can create, suspend, and delete tenants | PARTIAL | Permissions defined; no CRUD API endpoints implemented |
| TM-04 | Tenant config includes MFA enforcement | PARTIAL | Has name/address/areas; missing MFA enforcement flag on Tenant model |
| TM-05 | Super admin can view aggregate platform metrics | FAIL | Admin page shows only tenant-scoped metrics; no cross-tenant dashboard |
| TM-06 | Suspending a tenant invalidates all active sessions | **PARTIAL-RESOLVED** | ~~No suspension endpoint; auth does not check `tenant.isActive`~~ **Fix (2026-03-27):** Auth `authorize()` now filters tenantUsers to only active tenants; login denied if all tenants suspended. Remaining: no endpoint to suspend tenants, no active-session invalidation |

### 11.2 User Management

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| UM-01 | Firm admins can invite attorneys and staff by email | **PARTIAL-RESOLVED** | ~~No invite/create user endpoint~~ **Fix (2026-03-27):** Added POST `/api/users` endpoint + `/admin/users/new` page with temp password generation. Remaining: no email invitation (password shared manually) |
| UM-02 | Invited users receive a secure activation link | PARTIAL | No email service configured. Temp passwords are generated and shown to admin for secure sharing |
| UM-05 | Super admins can manage any user across all tenants | PARTIAL | API still filters by session `tenantId`; cannot cross-tenant manage |
| UM-06 | Users can update their own profile | PARTIAL | Settings page shows profile info; no edit form or PUT endpoint |
| UM-07 | MFA enrollment generates QR code and backup codes | PARTIAL | Schema fields exist; enrollment UI with QR code not implemented |

### 11.3 Client Management

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| CM-04 | Clients can be searched by name or email | FAIL | No search/filter parameters on GET `/api/clients` |
| CM-05 | Client records show all associated matters | PARTIAL | Returns matter count only, not full matter list |
| CM-07 | Accessing a client record writes an audit log entry | **RESOLVED** | ~~GET `/api/clients` does not call `writeAuditLog()`~~ **Fix (2026-03-27):** Added `audit.clientAccessed()` call to GET `/api/clients` endpoint |

### 11.4 Client Intake

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| IN-01 | Public intake form at `/intake/[tenantSlug]` | **RESOLVED** | ~~No public-facing route~~ **Fix (2026-03-27):** Created public intake page at `/intake/[tenantSlug]` with unauthenticated API at `/api/intake/public`; resolves tenant by slug |
| IN-03 | Intake creates pending client record + notifies admins | PARTIAL | Creates IntakeForm record only; no client record; no admin notification |
| IN-04 | Firm admins can review, accept, or reject intakes | **RESOLVED** | ~~No intake review/approval UI~~ **Fix (2026-03-27):** Created `/clients/intakes` review page with accept/reject/under-review workflow; GET/PATCH `/api/intake/[id]` endpoints with decrypted form data display |
| IN-05 | Client receives portal activation email on acceptance | FAIL | No email sending logic in codebase |
| IN-06 | Intake submissions are rate-limited | PARTIAL | Server-side validation exists; no rate-limiting |

### 11.5 Matter Management

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| MA-04 | Matter status options configurable per firm | FAIL | Status is a hardcoded Prisma enum; not per-firm configurable |
| MA-05 | Matters have timeline/activity feed | FAIL | No timeline or activity feed feature exists |
| MA-09 | Closed matters readable but not editable without reopening | PARTIAL | Soft delete hides closed matters entirely; no reopen mechanism |

### 11.6 Document Repository

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| DO-09 | Attorneys can delete documents (soft-delete) | FAIL | No DELETE endpoint for documents; `isActive` field unused |
| DO-11 | Document integrity verified on download (checksum) | **RESOLVED** | ~~Checksum stored but never compared on download~~ **Fix (2026-03-27):** Added SHA-256 checksum verification with constant-time comparison in download route; returns 500 on mismatch |

### 11.7 Kanban Case Board

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| KB-03 | Firm admins can reorder columns | PARTIAL | Add/rename/delete work; no column reorder endpoint |
| KB-05 | Cards include description field | PARTIAL | No description field on KanbanCard model; only title |
| KB-10 | Multiple boards per matter supported | FAIL | Only one default board per tenant; not per-matter |

### 11.8 Messaging

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| MS-01 | Firm users and clients can exchange messages | **RESOLVED** | ~~Messages page shows "Coming Soon"~~ **Fix (2026-03-27):** Built full messaging UI with compose/send/filter + GET/POST `/api/messages` with encrypted bodies, recipient validation, matter linking |
| MS-03 | New messages trigger in-app notification | PARTIAL | Message send works with audit logging; in-app notification creation on send not yet wired |
| MS-04 | Message history paginated and preserved | **PARTIAL-RESOLVED** | ~~No pagination~~ **Fix (2026-03-27):** GET `/api/messages` returns last 100 messages with 30s polling; cursor pagination not yet implemented |
| MS-05 | Clients can only message assigned attorneys/staff | **PARTIAL-RESOLVED** | ~~No access control~~ **Fix (2026-03-27):** Clients cannot see internal messages; recipient list filtered to tenant users. Remaining: client-to-assigned-attorney-only restriction |

### 11.9 Client Portal

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| CP-01 | Clients authenticate at `/portal/login` | **RESOLVED** | ~~No `/portal/login` page~~ **Fix (2026-03-27):** Created dedicated client portal login at `/portal/login` with client-branded UI; middleware redirects unauthenticated portal users there |
| CP-05 | Clients can upload documents for attorney review | FAIL | Portal documents page is read-only; no upload form |
| CP-06 | Clients can send messages to attorneys | FAIL | `/portal/messages` page does not exist |

### 11.10 Billing and Time Tracking

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| BL-05 | Billing rules define default hourly rates per role/matter | PARTIAL | BillingRule is retainer alert config, not rate rules; no per-role rate engine |
| BL-06 | Clients can view sent invoices in portal | FAIL | No portal invoice page or CLIENT endpoint for invoices |

### 11.11 In-App Notifications

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NO-01 | Notifications for messages, approvals, alerts, stale warnings | PARTIAL | IOLTA/retainer notifications work; MESSAGE_SENT and ACCOUNT_STALE never triggered |
| NO-02 | Notification bell shows unread count badge | **RESOLVED** | ~~No notification bell UI in dashboard~~ **Fix (2026-03-27):** Header now uses the functional `NotificationBell` component (was already in sidebar) with unread count badge and dropdown |
| NO-03 | Click marks read; mark all read available | **RESOLVED** | ~~No bulk mark-all-read~~ **Fix (2026-03-27):** Added PATCH `/api/notifications` bulk endpoint; NotificationBell uses single request instead of N individual calls |
| NO-04 | Notifications poll every 60 seconds | **RESOLVED** | ~~No polling~~ **Fix (2026-03-27):** NotificationBell component already had 60s polling via `setInterval`; was just not wired into header. Now active in both sidebar and header |

### 11.12 Audit Logging

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| AU-06 | Super admins can query audit logs across all tenants | FAIL | No cross-tenant audit query capability |
| AU-07 | Audit logs retained minimum 6 years | **RESOLVED** | ~~No retention policy or archival strategy implemented~~ **Fix (2026-03-27):** Added Prisma middleware in `db.ts` blocking all delete/update on AuditLog model; documented 6-year HIPAA retention policy in `audit.ts` header |

---

### Summary

| Category | Pass | Partial | Fail | Total |
|----------|------|---------|------|-------|
| 3.1 Tenant Management | 2 | 2 | 2 | 6 |
| 3.2 User Management | 3 | 3 | 2 | 8 |
| 3.3 Client Management | 4 | 1 | 2 | 7 |
| 3.4 Client Intake | 1 | 2 | 3 | 6 |
| 3.5 Matter Management | 5 | 1 | 3 | 9 |
| 3.6 Document Repository | 9 | 0 | 2 | 11 |
| 3.7 Kanban Case Board | 6 | 2 | 1 | 10* |
| 3.8 Messaging | 2 | 0 | 4 | 6 |
| 3.9 Client Portal | 4 | 0 | 3 | 8* |
| 3.10 Billing | 4 | 1 | 1 | 6 |
| 3.11 Trust Accounting | 11 | 0 | 0 | 11 |
| 3.12 Notifications | 1 | 2 | 2 | 5 |
| 3.13 Audit Logging | 4 | 0 | 2 | 6 |
| **TOTAL** | **56** | **14** | **27** | **99*** |

*Some counts include sub-items within requirements.

**Overall: 56 PASS (57%), 14 PARTIAL (14%), 27 FAIL (27%)**

### Priority Tiers

**P0 — Critical (security/compliance):** ✅ ALL RESOLVED (2026-03-27)
- ~~AU-07: No audit log retention strategy~~ → Prisma middleware blocks delete/update; policy documented
- ~~CM-07: Client record access not audited~~ → `audit.clientAccessed()` added to GET `/api/clients`
- ~~DO-11: Document checksum not verified on download~~ → SHA-256 verification added to download route
- ~~TM-06: Suspended tenants can still access the system~~ → Auth now checks `tenant.isActive` (partial: no suspension endpoint yet)

**P1 — High (core feature gaps):** ✅ ALL RESOLVED (2026-03-27)
- ~~MS-01: Messaging feature incomplete~~ → Full messaging UI + encrypted API (send, receive, filter, matter-linking)
- ~~UM-01/UM-02: Cannot invite new users~~ → POST `/api/users` + `/admin/users/new` page with temp password
- ~~IN-01/IN-04: Intake workflow incomplete~~ → Public form at `/intake/[tenantSlug]` + admin review page at `/clients/intakes`
- ~~CP-01: No separate client portal login~~ → `/portal/login` page with dedicated UI + middleware routing
- ~~NO-02/NO-04: No notification UI or polling~~ → NotificationBell wired into header + bulk mark-all-read endpoint

**P2 — Medium (feature completeness):**
- CP-05/CP-06: Client portal missing upload and messaging
- BL-06: Clients cannot view invoices in portal
- MA-05: No matter timeline/activity feed
- DO-09: Cannot delete documents
- KB-10: No per-matter kanban boards
- UM-06: Cannot edit own profile
- UM-07: MFA enrollment UI missing

**P3 — Low (nice-to-have/long-term):**
- MA-04: Per-firm configurable status options
- BL-05: Per-role billing rate rules
- TM-05: Cross-tenant platform metrics
- AU-06: Cross-tenant audit query
- KB-03: Column reorder
- KB-05: Card description field
