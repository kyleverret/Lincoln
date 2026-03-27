# Lincoln — Claude Code Context

This file gives Claude Code the project-specific context needed to work safely and consistently across sessions.

---

## Project Overview

**Lincoln** is a multi-tenant law firm case management platform built with Next.js 15, Prisma, and PostgreSQL. It is designed to HIPAA standards and supports multiple independent law firms (tenants), their staff, attorneys, and their clients.

**Target scale:** ~20 attorneys, ~500 clients, multiple matters per client.

---

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
  entrypoint.sh      # Runs `prisma db push` then starts server

.mcp.json            # Gitignored; DO MCP server config (uses $DO_TOKEN from env)
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
- **DO App Platform dev database** has severely restricted PostgreSQL permissions. Do not use it for production. Use a standalone Managed PostgreSQL cluster.
- **`TrustTransactionStatus`** enum values: `CLEARED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`. There is no `VOIDED`.
- **`BankAccount`** field is `lastFourDigits`, not `accountNumberLast4`. There is no `routingNumber` field.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string with `?sslmode=require` in production |
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

> **Current state:** No migration history exists. The app uses `prisma db push` on startup via `docker/entrypoint.sh`. Once a managed PostgreSQL cluster with full DDL permissions is connected, this should be switched to proper `migrate deploy` workflow.

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
- Target URL: `https://lincoln.verrettech.com` (CNAME pending)
- Push to `main` → auto-deploy triggers
- See `infrastructure/DEPLOYMENT-DO.md` for full runbook

**Deploy monitoring (from local Mac):**
```bash
# After pushing to main:
./.local/watch-do-deploy.sh
# Requires DO_TOKEN and APP_ID env vars (set in ~/.zshrc)
```

**MCP Integration:**
DigitalOcean remote MCP servers (Apps + Databases) are configured in `.mcp.json` at the project root. They authenticate via the `DO_TOKEN` environment variable (set in `~/.zshrc`). When loaded, Claude can query app deployments, logs, database clusters, and connection details directly.

```
# .mcp.json server endpoints
Apps:      https://apps.mcp.digitalocean.com/mcp
Databases: https://databases.mcp.digitalocean.com/mcp
```

> **Note:** `.mcp.json` is gitignored. The `DO_TOKEN` env var must be set locally for MCP auth to work. Restart Claude Code after changes.

---

## CI/CD

- Push to `main` triggers DigitalOcean App Platform auto-deploy
- Docker build uses multi-stage build (deps → builder → runner)
- `docker/entrypoint.sh` runs `prisma db push` on container start
- **Pending:** Switch to `prisma migrate deploy` once managed PostgreSQL cluster is connected and migration baseline is created

---

## Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| DO App Platform | Active | App ID `277709bf-447d-41a7-8d06-544c9faba45e`, on Lincoln-1-VPC |
| DO Managed PostgreSQL | Provisioned | On Lincoln-1-VPC (`10.116.0.0/20`); use private hostname for `DATABASE_URL` |
| DO Dev Database | Deprecated | Had PG15 permission restrictions; replaced by Managed PostgreSQL cluster |
| DO Spaces | Not yet configured | Needed for document storage; currently using local storage |
| VPC | Active | Lincoln-1-VPC — `10.116.0.0/20`; app and database share this network |
| Custom domain | Pending | `lincoln.verrettech.com` — CNAME to be added in Squarespace DNS |
| MCP Servers | Configured | Remote DO MCP (Apps + Databases) in `.mcp.json`; requires `DO_TOKEN` env var |
| AWS/Terraform | Legacy/unused | Do not deploy; kept for reference only |
