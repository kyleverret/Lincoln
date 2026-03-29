# Lincoln — Claude Code Context

This file gives Claude Code the project-specific context needed to work safely and consistently across sessions.

---

## Mandatory Reference Documents

**Before writing or reviewing any code, Claude MUST reference these documents:**

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Systems, data, security, and privacy-by-design principles | Every code change — validate compliance before committing |
| **[BUGS.md](./BUGS.md)** | Running bug tracker with root cause analysis | After every bug fix — log the bug, root cause, and resolution |
| **[REQUIREMENTS.md](./REQUIREMENTS.md)** | Product requirements and feature audit | When building new features — check against requirements |

**Workflow — every code change follows this sequence:**
1. **Before writing code** → check ARCHITECTURE.md principles apply
2. **While writing code** → if making an assumption, document it (code comment + ARCHITECTURE.md §6.3 Assumption Register). If deferring something, log it (ARCHITECTURE.md §6.4 Deferral Register + BUGS.md as `FLAGGED`/`DEFERRED`)
3. **After writing code, before committing** → run the full Pre-Commit Review Protocol (ARCHITECTURE.md §6):
   - §6.1 Compliance Checklist (11 checks)
   - §6.2 Risk Flag Review (scan diff for all 5 root cause patterns)
   - Flag anything that matches a known risk pattern, even if it's not a bug yet
4. **After fixing a bug** → add entry to BUGS.md with root cause analysis explaining **why** it was coded wrong
5. **When a new bug or risk is found** → add to BUGS.md immediately (`OPEN` or `FLAGGED`), even before fixing
6. **Commit message** → follow ARCHITECTURE.md §6.5 protocol (include ASSUMPTIONS, DEFERRALS, FLAGS sections as applicable)

---

## Project Overview

**Lincoln** is a multi-tenant law firm case management platform built with Next.js 15, Prisma, and PostgreSQL. It is designed to HIPAA standards and supports multiple independent law firms (tenants), their staff, attorneys, and their clients.

**Target scale:** ~20 attorneys, ~500 clients, multiple matters per client.

---
#### BUGS and IMPROVEMENTS ####
added by Kyle on 3/27/26
We’ve got some work to do:

-in the title, update name of the law firm to  “SDLawyers” from Smith & Associates
We need a firm settings tab, that allows the name of the firm to be edited by firm admins.
 
For case project management:
- I could not move the cards.
- I could not add a column
- I could not delete a column.
- I could not change column names
- The Add column button did not do anything 

Action items:
- I need to be able to add action items.

On the cases list, for each cases card, I need an emoji or a designation like an A or a C to indicate which person is the lawyer and which is the client.
In case management, I could not add a note to a case

Billing, I could not add a time entry


Settings page gave me a 404
Hitting edit on a staff member gave me a 404
Intake gave me a 404
Messages gave me a 404
In a client matter, hitting edit gave me a 404

Documents gave me this error: Application error: a client-side exception has occurred while loading lincoln.verrettech.com (see the browser console for more information).

The main dashboard does not need to have a documents tile or a total matters.
=

I need to be able to add or delete a contact once added.




## Architecture Quick Reference

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui |
| ORM | Prisma 5 + PostgreSQL 16 |
| Auth | NextAuth v5 (JWT, 8hr sessions, TOTP MFA) |
| Encryption | AES-256-GCM, HKDF per-tenant key derivation |
| Storage | Local (`/storage`) in dev; DigitalOcean Spaces (S3-compatible) in production |
| Infrastructure | DigitalOcean App Platform + Managed PostgreSQL 16 |
| CI/CD | Push to `main` triggers auto-deploy on DO App Platform |

> **Note:** The AWS/Terraform/ECS infrastructure in `infrastructure/terraform/` is legacy scaffolding from an earlier architecture decision. The active deployment target is DigitalOcean. Do not reference AWS resources when making deployment decisions.

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — every push triggers a DO App Platform deploy |
| `claude/law-firm-case-management-QO590` | Feature development branch |

Always develop on the feature branch. Merge to `main` only when ready to deploy.

### Directory Layout

```
src/
  app/
    (auth)/          # Login pages (firm + portal)
    (dashboard)/     # Firm-facing UI: matters, clients, kanban, admin, billing
    (portal)/        # Client-facing portal
    api/             # Route handlers (all protected by auth middleware)
  components/
    auth/            # Login forms, MFA prompt
    cases/           # KanbanBoard, MatterList
    clients/         # ClientCard, IntakeForm
    documents/       # DocumentUploader, DocumentViewer
    layout/          # Sidebar, TopBar, NotificationBell
    ui/              # shadcn/ui re-exports
  lib/
    auth.ts          # NextAuth config, account lockout, MFA
    audit.ts         # Immutable audit log writer (use writeAuditLog() directly — NOT audit.writeAuditLog())
    db.ts            # Prisma client singleton
    encryption.ts    # AES-256-GCM + HKDF helpers
    permissions.ts   # RBAC permission map + ROLE_LABELS
    storage.ts       # Document encrypt-then-store abstraction
    utils.ts         # cn(), date helpers
    validations/     # Zod schemas shared between client and server
    security/        # SOC-2/ISO 27001 controls (password-policy, session-manager, security-monitor, compliance)
    trust/           # IOLTA trust accounting helpers (notifications.ts)

prisma/
  schema.prisma      # 20+ models; sensitive fields prefixed `enc`
  rls.sql            # PostgreSQL Row-Level Security policies
  seed.ts            # Demo data (Smith & Associates + 5 users)
  migrations/        # Empty — using db push for initial deployment

infrastructure/
  terraform/         # Legacy AWS stack — NOT the active deployment target
  DEPLOYMENT.md      # Legacy AWS deployment runbook
  DEPLOYMENT-DO.md   # Active: DigitalOcean deployment runbook

docker/
  entrypoint.sh      # Runs `prisma db push` then starts server (no psql dependency)

.mcp.json            # Gitignored; DO MCP server config (Bearer $DO_TOKEN auth)
.local/              # Gitignored local dev scripts (not committed)
  watch-do-deploy.sh # Polls DO API after push; invokes Claude on failure
.do-logs/            # Gitignored; DO deploy log output from watch script
```

---

## Security Invariants — Never Violate These

1. **Every database query must filter by `tenantId`**. Cross-tenant data leakage is a critical vulnerability. Use the Prisma middleware in `src/lib/db.ts` or add explicit `where: { tenantId }` clauses.

2. **Encrypt all PHI fields before storing**. Fields prefixed `enc` in the schema (`encDateOfBirth`, `encSsnLastFour`, `encAddress`, `encNotes`) must go through `encryptField()` on write and `decryptField()` on read. Never store plaintext PHI.

3. **Audit every PHI/PII access**. All reads of client records, matter details, and document downloads must call `writeAuditLog()` from `src/lib/audit.ts`. Writes (uploads, status changes) must also be audited.

4. **Never expose the master encryption key**. `MASTER_ENCRYPTION_KEY` derives all tenant keys via HKDF. It lives only in environment secrets and is never logged or returned in API responses.

5. **Validate tenant ownership before resource operations**. Before returning or mutating any record (matter, document, client, user), confirm `record.tenantId === session.user.tenantId`.

6. **Check permissions before every mutation**. Use `hasPermission(session.user.role, "PERMISSION_NAME")` from `src/lib/permissions.ts`. Return 403 if the check fails.

7. **Documents: store IV + AuthTag together**. The `iv` column in the `Document` model stores `"<iv_hex>:<authTag_hex>"`. Always split on `:` to extract both values on read.

8. **No plaintext secrets in code or logs**. Never `console.log` a secret, key, or password. Never hardcode credentials.

9. **Trust accounting (IOLTA)**: TRANSFER_OUT transactions require PENDING_APPROVAL workflow. Never allow direct withdrawals without approval. Stale reconciliation locks block invoice sending.

---

## User Roles

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | Platform-wide: all tenants, all data, billing |
| `FIRM_ADMIN` | Full access within their tenant; manage users/matters |
| `ATTORNEY` | Assigned matters; full matter + client + document access |
| `STAFF` | Assigned matters; limited admin actions |
| `CLIENT` | Portal only; own matters, own documents (where `allowClientView=true`), messaging, trust balances |

---

## Key Patterns

### API Route Handler Pattern

```typescript
// src/app/api/example/route.ts
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";  // NOTE: standalone function, not audit.writeAuditLog()

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "MATTER_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await db.matter.findMany({
    where: { tenantId: session.user.tenantId }, // ALWAYS filter by tenant
  });

  await writeAuditLog({ userId: session.user.id, tenantId: session.user.tenantId, action: "matter.list" });

  return Response.json(data);
}
```

### Encrypting PHI

```typescript
import { encryptField, decryptField } from "@/lib/encryption";

// Write
const encDob = encryptField(dob, tenant.encryptionKeyId);

// Read
const dob = decryptField(client.encDateOfBirth, tenant.encryptionKeyId);
```

### Document Storage

```typescript
import { storeDocument, retrieveDocument } from "@/lib/storage";

// Upload
const result = await storeDocument(tenantId, documentId, fileBuffer, keyId);
// result = { storagePath, iv, authTag, checksum, sizeBytes }
// Store iv as: `${result.iv}:${result.authTag}`

// Download
const [iv, authTag] = document.iv.split(":");
const buffer = await retrieveDocument(document.storagePath, iv, authTag, keyId);
```

### ROLE_LABELS Import

```typescript
// ROLE_LABELS lives in permissions.ts, not utils.ts
import { ROLE_LABELS, hasPermission } from "@/lib/permissions";
```

---

## Known Gotchas (save debugging time)

- **`writeAuditLog`** is a standalone export from `src/lib/audit.ts`. There is no `audit.writeAuditLog()` method.
- **`ROLE_LABELS`** is exported from `src/lib/permissions.ts`, not `src/lib/utils.ts`.
- **Lucide icons** do not accept a `title` prop — use `aria-label` instead.
- **`PrismaAdapter`** must be cast `as any` due to `@auth/core` version conflict between `next-auth` and `@auth/prisma-adapter`.
- **`crypto.hkdfSync`** returns `ArrayBuffer` — wrap with `Buffer.from(...)` before use.
- **`next/font/google`** requires network access at build time — removed in favor of Tailwind's `font-sans` (system font).
- **DO App Platform dev database** was deprecated due to PG15 permission restrictions. The app now uses a Managed PostgreSQL 16 cluster with a `databases` component binding in the app spec.
- **`DATABASE_URL` in production** is managed by the DO App Platform `${db.DATABASE_URL}` binding — do not hardcode connection strings in the app spec. The binding provides private networking automatically.
- **`entrypoint.sh`** must not use `psql` CLI — it previously caused deploy failures. Only `prisma db push` is needed.
- **`TrustTransactionStatus`** enum values: `CLEARED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`. There is no `VOIDED`.
- **`BankAccount`** field is `lastFourDigits`, not `accountNumberLast4`. There is no `routingNumber` field.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Injected by DO App Platform via `${db.DATABASE_URL}` binding in production; manual in dev |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret (min 32 chars) |
| `NEXTAUTH_URL` | Full app URL (e.g., `https://lincoln.verrettech.com`) |
| `MASTER_ENCRYPTION_KEY` | 64-char hex (32 bytes) for HKDF key derivation |
| `STORAGE_PROVIDER` | `local` or `s3` |
| `STORAGE_ENDPOINT` | `https://nyc3.digitaloceanspaces.com` (DO Spaces) |
| `AWS_S3_BUCKET` | Spaces bucket name |
| `AWS_REGION` | Spaces region (e.g. `nyc3`) |
| `AWS_ACCESS_KEY_ID` | Spaces access key (not your DO account key) |
| `AWS_SECRET_ACCESS_KEY` | Spaces secret key |

Never commit `.env` or `.env.local`. They are in `.gitignore`.

---

## Common Commands

```bash
# Development
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # ESLint
npx tsc --noEmit      # Type check

# Database
npx prisma generate           # Regenerate Prisma client after schema changes
npx prisma migrate dev        # Create + apply a new migration
npx prisma migrate deploy     # Apply pending migrations (prod/CI)
npx prisma studio             # Visual DB browser

# Seed demo data
npx tsx prisma/seed.ts

# Docker (local full stack)
docker-compose up --build
```

---

## Migrations

> **Current state:** No migration history exists. The app uses `prisma db push` on startup via `docker/entrypoint.sh`. The managed PostgreSQL 16 cluster is now connected with full DDL permissions. This should be switched to proper `migrate deploy` workflow once a migration baseline is created.

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Review the generated SQL in `prisma/migrations/`
4. If adding an `enc`-prefixed field, add encrypt/decrypt calls wherever the model is read/written
5. If RLS needs updating, edit `prisma/rls.sql` and re-apply it manually

---

## Testing Accounts (seed data)

All passwords: `Demo@Password1!`

| Email | Role |
|-------|------|
| `super@lincoln.dev` | `SUPER_ADMIN` |
| `admin@smithlaw.com` | `FIRM_ADMIN` |
| `j.smith@smithlaw.com` | `ATTORNEY` |
| `m.johnson@smithlaw.com` | `ATTORNEY` |
| `staff@smithlaw.com` | `STAFF` |

Client portal login uses client email + password set during intake.

---

## Deployment

**Active deployment: DigitalOcean App Platform**

- App ID: `277709bf-447d-41a7-8d06-544c9faba45e`
- Live URL: `https://lincoln-vcyps.ondigitalocean.app`
- Custom domain: `https://lincoln.verrettech.com` (CNAME pending)
- Push to `main` → auto-deploy triggers
- Database bound via app spec `databases` component → `lincoln-law-db1` cluster (private networking)
- See `infrastructure/DEPLOYMENT-DO.md` for full runbook

**Deploy monitoring (from local Mac):**
```bash
# After pushing to main:
./.local/watch-do-deploy.sh
# Requires DO_TOKEN and APP_ID env vars (set in ~/.zshrc)
```

**MCP Integration:**
DigitalOcean remote MCP servers (Apps + Databases) are configured in `.mcp.json` at the project root. They authenticate via `Bearer $DO_TOKEN` in the `Authorization` header (`DO_TOKEN` is set in `~/.zshrc`). When loaded, Claude can query app deployments, logs, database clusters, and connection details directly.

```
# .mcp.json server endpoints
Apps:      https://apps.mcp.digitalocean.com/mcp
Databases: https://databases.mcp.digitalocean.com/mcp
```

> **Note:** `.mcp.json` is gitignored. The `DO_TOKEN` env var must be set locally for MCP auth to work. The `Authorization` header must use `Bearer ${DO_TOKEN}` format. Restart Claude Code after changes.

---

## CI/CD

- Push to `main` triggers DigitalOcean App Platform auto-deploy
- Docker build uses multi-stage build (deps → builder → runner)
- `docker/entrypoint.sh` runs `prisma db push` on container start (no `psql` dependency)
- Health check: 60s initial delay, 15s period, 10s timeout, 9 failure threshold (allows time for `prisma db push`)
- **Pending:** Switch to `prisma migrate deploy` once migration baseline is created

---

## Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| DO App Platform | Active | App ID `277709bf-447d-41a7-8d06-544c9faba45e`; live at `lincoln-vcyps.ondigitalocean.app` |
| DO Managed PostgreSQL | Active | `lincoln-law-db1` (PG16); bound via app spec `databases` component (private networking) |
| DO Dev Database | Removed | Was PG15 with restricted permissions; fully replaced by Managed PostgreSQL cluster |
| DO Spaces | Not yet configured | Needed for document storage; currently using local storage |
| VPC | Active | Lincoln-1-VPC — `10.116.0.0/20`; app and database share this network |
| Custom domain | Pending | `lincoln.verrettech.com` — CNAME to be added in Squarespace DNS |
| MCP Servers | Configured | Remote DO MCP (Apps + Databases) in `.mcp.json`; requires `DO_TOKEN` env var; `Bearer` auth |
| AWS/Terraform | Legacy/unused | Do not deploy; kept for reference only |
