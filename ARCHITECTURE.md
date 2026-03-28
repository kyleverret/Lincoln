# Lincoln — Architecture Principles & Standards

This document defines the mandatory architecture principles for the Lincoln platform. All code — new and existing — must comply. Claude Code references this document on every session.

**Last updated:** 2026-03-27

---

## 1. Systems Architecture Principles

### 1.1 Separation of Concerns (SoC)
Every module, file, and function has one clear responsibility. UI components do not contain business logic. API routes do not contain presentation logic. Database queries are isolated from auth logic.

**Lincoln application:**
- Pages (`src/app/`) handle routing, layout, and server-side data fetching
- Components (`src/components/`) handle UI rendering and client interaction
- API routes (`src/app/api/`) handle request validation, auth, business logic, and responses
- Libraries (`src/lib/`) contain shared utilities: auth, db, encryption, permissions, audit
- Validation schemas (`src/lib/validations/`) define data shapes shared between client and server

**Violation example:** An API route that renders HTML or a component that directly queries the database.

### 1.2 Single Responsibility Principle (SRP)
Each function does one thing. Each file exports a cohesive set of related functions. When a function grows beyond ~50 lines or handles multiple concerns, it should be decomposed.

### 1.3 Defense in Depth
Security is layered. No single control is trusted alone:
- **Layer 1:** Middleware — auth check, role routing
- **Layer 2:** API route — session validation, permission check, tenant filtering
- **Layer 3:** Database — RLS policies (when enabled), unique constraints, foreign keys
- **Layer 4:** Application — encryption at rest, audit logging, input validation

If any one layer fails, the others still protect the system.

### 1.4 Fail-Safe Defaults
The system denies access by default. Explicit grants are required:
- Unauthenticated requests are redirected to login
- API routes return 401/403 unless the caller proves identity and authorization
- New features default to the most restrictive permission level
- Environment variables that control security features (encryption, audit) must not have permissive defaults

### 1.5 Principle of Least Privilege
Users, services, and code modules receive only the minimum permissions required:
- RBAC roles grant specific permissions, not blanket access
- Database credentials use least-privilege users where possible
- API routes check granular permissions (`MATTER_READ`, `CLIENT_CREATE`) not just roles

### 1.6 Idempotency
State-changing operations should be safe to retry:
- POST endpoints that create resources should check for duplicates
- Payment operations must be wrapped in transactions to prevent double-processing
- Audit log writes are append-only and inherently idempotent (duplicate entries are preferable to missing entries)

### 1.7 Graceful Degradation
When a non-critical subsystem fails, the application continues operating:
- If audit logging fails, the primary operation should still complete (log the failure separately)
- If encryption key derivation fails, return a clear error — never store plaintext as fallback
- If external services (S3, email) are unavailable, queue operations for retry

### 1.8 12-Factor App Compliance
- **Config in environment:** All configuration via env vars, never hardcoded
- **Stateless processes:** No in-memory state between requests; all state in the database
- **Port binding:** App exports HTTP via configurable port
- **Disposability:** Fast startup, graceful shutdown
- **Dev/prod parity:** Same Docker image, same Prisma schema, same auth flow
- **Logs as event streams:** Structured console output, captured by platform

### 1.9 DRY (Don't Repeat Yourself)
Shared logic is extracted to reusable modules:
- Auth patterns → `src/lib/auth.ts`
- Permission checks → `src/lib/permissions.ts`
- Validation schemas → `src/lib/validations/`
- Encryption → `src/lib/encryption.ts`
- Audit → `src/lib/audit.ts`

When the same pattern appears in 3+ places, it must be extracted.

### 1.10 Consistent API Contract
All API routes follow the same structure and error format:
```
Success: { data: T } or T directly, status 200/201
Validation error: { message: string, errors?: object }, status 400
Auth error: { error: "Unauthorized" }, status 401
Permission error: { error: "Forbidden" }, status 403
Not found: { error: "Not found" }, status 404
Server error: { error: "Internal server error" }, status 500
```

**Current violation:** Some routes return `{ message }`, others return `{ error }`. This must be standardized.

---

## 2. Data Architecture Principles

### 2.1 Multi-Tenant Data Isolation
Every row of tenant-scoped data includes a `tenantId` foreign key. Every query filters by `tenantId`. There are no exceptions.

**Mandatory pattern:**
```typescript
const data = await db.model.findMany({
  where: { tenantId: session.user.tenantId, ...otherFilters },
});
```

**Prohibited pattern:**
```typescript
where: { tenantId: session.user.tenantId ?? undefined }
// If tenantId is null, this removes the filter entirely — data leakage
```

**Correct null handling:**
```typescript
if (!session?.user?.tenantId) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
// tenantId is now guaranteed non-null
```

### 2.2 Referential Integrity
All relationships are enforced by foreign keys in the schema. Orphaned records are not acceptable:
- Use `onDelete: Cascade` for child records that have no meaning without their parent
- Use `onDelete: Restrict` for records that must be explicitly handled before parent deletion
- Use soft deletes (`isActive: false`) for compliance-sensitive data

### 2.3 Soft Deletes for Compliance Data
Any record that may be subject to legal hold, audit, or HIPAA retention must use soft delete:
- Clients: `isActive: false`
- Matters: `isActive: false`, `closedAt` timestamp
- Contacts: `isActive: false`
- Documents: mark as archived, never hard delete
- Audit logs: immutable, never deleted

**Hard deletes are only acceptable for:**
- Ephemeral UI state (draft kanban columns with no cards)
- Temporary tokens or sessions
- User-initiated data that has no compliance implications

### 2.4 Schema Evolution Strategy
- All schema changes go through Prisma migrations (`prisma migrate dev`)
- Migrations are reviewed before deployment
- Destructive migrations (drop column, drop table) require explicit approval
- New `enc`-prefixed fields require corresponding encrypt/decrypt code
- RLS policy updates are tracked in `prisma/rls.sql`

### 2.5 Data Classification
All data fields fall into one of these sensitivity levels:

| Level | Examples | Storage | Access Logging |
|-------|----------|---------|----------------|
| **PUBLIC** | Firm name, tenant slug | Plaintext | No |
| **INTERNAL** | Matter status, case type | Plaintext | Optional |
| **CONFIDENTIAL** | Client name, attorney assignment | Plaintext | Required |
| **PHI/PII** | DOB, SSN, address, medical notes | AES-256-GCM encrypted | Required + audit |
| **SECRET** | Encryption keys, passwords, tokens | Env vars / hashed | Never logged |

### 2.6 Decimal Precision for Financial Data
All monetary values use `Decimal(10, 2)` in the schema and `Decimal` type in application code. JavaScript `number` floating-point operations are prohibited for money:
```typescript
// WRONG: Precision loss
const total = Number(invoice.amount) + Number(payment.amount);

// CORRECT: Use Prisma Decimal or string-based arithmetic
const total = invoice.amount.add(payment.amount);
```

### 2.7 Pagination
All list endpoints must support pagination:
- Use cursor-based pagination for large or frequently-changing datasets
- Use `take` + `skip` for smaller, stable datasets
- Default page size: 50 records
- Maximum page size: 200 records
- Always return total count alongside results for UI pagination

### 2.8 Indexing Strategy
Every foreign key used in `WHERE` clauses must have a database index:
- `tenantId` on all tenant-scoped models
- Compound indexes for common query patterns: `(tenantId, matterId)`, `(tenantId, isActive)`
- Unique indexes for business keys: `User.email`, `Tenant.slug`

---

## 3. Security Architecture Principles

### 3.1 Zero Trust
No request, user, or system component is trusted by default:
- Every API request is authenticated (verify JWT)
- Every operation is authorized (check permissions)
- Every data access is scoped (filter by tenant)
- Internal services validate inputs even from other internal services

### 3.2 Input Validation at Boundaries
All external input is validated before processing:
- HTTP request bodies → Zod schema validation
- URL parameters → type checking and format validation
- File uploads → size limits, type checking, virus scanning (future)
- Query strings → whitelist of allowed parameters

**Validation must happen at the API boundary, not deep in business logic.**

### 3.3 Output Encoding
All data returned to clients is properly encoded:
- React's JSX escaping handles XSS for rendered content
- API responses use `Response.json()` which properly serializes
- Never construct HTML strings with user data
- Never interpolate user data into SQL (Prisma parameterizes automatically)

### 3.4 Encryption Standards
- **At rest:** AES-256-GCM for all PHI/PII fields
- **In transit:** TLS 1.2+ (enforced by platform)
- **Key derivation:** HKDF with per-tenant key IDs
- **Key storage:** Master key in environment variables only
- **IV management:** Unique IV per encryption operation, stored with ciphertext
- **Auth tags:** Stored alongside IV for integrity verification

### 3.5 Session Management
- JWT-based sessions with 8-hour expiry
- No session data in cookies beyond the JWT token
- Account lockout after 5 failed attempts (30-minute lockout)
- Session does not contain sensitive data (no PHI in JWT payload)

### 3.6 Audit Trail Completeness
Every access to or modification of sensitive data must be audited:

| Operation | Audit Required | Details |
|-----------|---------------|---------|
| User login/logout | Yes | IP, user agent, success/failure |
| Client record access (read) | Yes | Which client, who accessed |
| Client record modification | Yes | What changed, who changed it |
| Matter access/modification | Yes | Matter ID, action taken |
| Document upload/download | Yes | Document ID, file name |
| Billing operations | Yes | Amount, matter, action |
| Permission changes | Yes | Role change, who authorized |
| Settings changes | Yes | What changed, old/new values |
| Trust account operations | Yes | Amount, approval status |

Audit log entries are **immutable**. They cannot be updated or deleted. Prisma middleware enforces this at the application level.

### 3.7 Rate Limiting
Public-facing endpoints must be rate-limited:
- Login: 10 attempts per IP per 15 minutes
- Public intake form: 5 submissions per IP per hour
- API endpoints: 100 requests per user per minute (future)

### 3.8 Error Handling Security
- Never expose stack traces, database errors, or internal paths in API responses
- Log detailed errors server-side with `console.error`
- Return generic error messages to clients: `"Internal server error"`
- Never include user input in error messages returned to clients (reflection attacks)

### 3.9 Dependency Security
- Keep dependencies updated (check monthly)
- Review `npm audit` output before deploying
- Pin major versions to prevent unexpected breaking changes
- Never install packages with known critical vulnerabilities

---

## 4. Privacy by Design Principles

Based on Ann Cavoukian's 7 Foundational Principles:

### 4.1 Proactive, Not Reactive
Privacy protections are built into the system from the start, not added after incidents:
- PHI encryption was designed into the schema from day one
- Audit logging is mandatory, not optional
- Tenant isolation is enforced at every layer

### 4.2 Privacy as the Default Setting
Users get maximum privacy without taking any action:
- Documents are private by default (`allowClientView: false`)
- Client data is encrypted by default
- Sessions expire after 8 hours
- Failed login attempts trigger lockout automatically

### 4.3 Privacy Embedded into Design
Privacy is not a bolt-on feature. It's part of the architecture:
- Encryption is in the data layer, not the presentation layer
- Tenant isolation is in every query, not a filter applied after fetching
- Audit logging is in every route handler, not a separate service that might be skipped

### 4.4 Full Functionality — Positive-Sum
Privacy doesn't reduce functionality:
- Encrypted fields can still be searched by authorized users (decrypt then search)
- Audit logs provide compliance AND operational insight
- Role-based access enables collaboration while protecting boundaries

### 4.5 End-to-End Security
Data is protected throughout its lifecycle:
- **Creation:** Validated, encrypted, audited
- **Storage:** Encrypted at rest, tenant-isolated
- **Access:** Authenticated, authorized, audited
- **Transmission:** TLS in transit
- **Deletion:** Soft delete, retained per policy
- **Archival:** Encrypted, immutable audit trail

### 4.6 Visibility and Transparency
The system's privacy practices are visible and verifiable:
- Audit logs can be exported for compliance review
- Permission system is documented and inspectable
- Encryption algorithms and key management are documented (this file)
- No hidden data collection or sharing

### 4.7 Respect for User Privacy
User interests are prioritized:
- Minimum necessary data collection (only fields required for legal practice)
- Client portal shows only their own data
- Clients can view documents explicitly shared with them
- No analytics or tracking beyond operational audit logs

### 4.8 Data Minimization
Collect only what is necessary:
- SSN: store only last 4 digits, encrypted
- DOB: encrypted, used only for identity verification
- Address: encrypted, used only for legal correspondence
- No collection of data not required for case management

### 4.9 Purpose Limitation
Data collected for one purpose is not repurposed:
- Client data is used for their legal matters only
- Billing data is used for invoicing only
- Audit logs are used for compliance only
- No cross-tenant analytics or data aggregation

### 4.10 Retention and Disposal
Data is retained only as long as required:
- Active matter data: retained while matter is open
- Closed matter data: retained per firm retention policy (typically 6-7 years)
- Audit logs: 6-year minimum retention (HIPAA)
- Session data: 8-hour maximum
- Failed login records: cleared on successful login

---

## 5. Coding Standards

### 5.1 API Route Template
Every API route must follow this exact structure:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function METHOD(req: Request) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Authorize
  if (!hasPermission(session.user.role, "REQUIRED_PERMISSION")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 3. Validate input (for mutations)
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 4. Execute business logic with tenant filter
    const result = await db.model.operation({
      where: { tenantId: session.user.tenantId },
    });

    // 5. Audit
    await writeAuditLog({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: "model.operation",
      resourceId: result.id,
    });

    // 6. Return response
    return Response.json(result);
  } catch (error) {
    console.error("[ROUTE_NAME METHOD]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 5.2 Error Response Standard
All error responses use this format:
```typescript
{ error: string, details?: object }
```

Never use `{ message: string }` for errors. The `message` key is reserved for success messages.

### 5.3 TypeScript Strictness
- `strict: true` in tsconfig
- No `any` types except where explicitly required (e.g., NextAuth adapter cast)
- All function parameters and return types are explicitly typed
- Prefer `unknown` over `any` for untyped external data

### 5.4 Edge Runtime Awareness
Next.js middleware runs in Edge Runtime. Files imported by middleware must not use:
- `PrismaClient` (use `auth.config.ts` for lightweight auth)
- Node.js built-ins (`fs`, `crypto`, `path`)
- `@prisma/client` enum imports (use string literals)

---

## 6. Compliance Checklist

Before any code is merged:

- [ ] All database queries filter by `tenantId`
- [ ] All mutations check `hasPermission()`
- [ ] All PHI fields use `encryptField()` / `decryptField()`
- [ ] All sensitive data access calls `writeAuditLog()`
- [ ] All user input is validated with Zod schemas
- [ ] All error responses use `{ error: string }` format
- [ ] No `console.log` of secrets, keys, or PHI
- [ ] No hard deletes of compliance-sensitive data
- [ ] No `?? undefined` on `tenantId` in queries
- [ ] TypeScript compiles without errors
- [ ] Build succeeds (`npm run build`)
