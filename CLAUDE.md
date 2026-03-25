# Lincoln — Claude Code Context

This file gives Claude Code the project-specific context needed to work safely and consistently across sessions.

---

## Project Overview

**Lincoln** is a multi-tenant law firm case management platform built with Next.js 15, Prisma, and PostgreSQL. It is designed to HIPAA standards and supports multiple independent law firms (tenants), their staff, attorneys, and their clients.

---

## Architecture Quick Reference

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui |
| ORM | Prisma 5 + PostgreSQL 16 |
| Auth | NextAuth v5 (JWT, 8hr sessions, TOTP MFA) |
| Encryption | AES-256-GCM, HKDF per-tenant key derivation |
| Storage | Local (`/storage`) in dev; S3 + SSE-KMS in production |
| Infrastructure | AWS ECS Fargate, RDS PostgreSQL, S3, ALB, WAF, KMS |
| IaC | Terraform (S3 remote state, DynamoDB locking) |
| CI/CD | GitHub Actions with OIDC (no long-lived AWS keys) |

### Directory Layout

```
src/
  app/
    (auth)/          # Login pages (firm + portal)
    (dashboard)/     # Firm-facing UI: matters, clients, kanban, admin
    (portal)/        # Client-facing portal
    api/             # Route handlers (all protected by auth middleware)
  components/
    auth/            # Login forms, MFA prompt
    cases/           # KanbanBoard, MatterList
    clients/         # ClientCard, IntakeForm
    documents/       # DocumentUploader, DocumentViewer
    layout/          # Sidebar, TopBar
    ui/              # shadcn/ui re-exports
  lib/
    auth.ts          # NextAuth config, account lockout, MFA
    audit.ts         # Immutable audit log writer
    db.ts            # Prisma client singleton
    encryption.ts    # AES-256-GCM + HKDF helpers
    permissions.ts   # RBAC permission map
    storage.ts       # Document encrypt-then-store abstraction
    utils.ts         # cn(), date helpers
    validations/     # Zod schemas shared between client and server

prisma/
  schema.prisma      # 14 models; sensitive fields prefixed `enc`
  rls.sql            # PostgreSQL Row-Level Security policies
  seed.ts            # Demo data (Smith & Associates + 5 users)

infrastructure/
  terraform/         # Full AWS stack (VPC, ECS, RDS, KMS, WAF, IAM)
  DEPLOYMENT.md      # Step-by-step deployment runbook

docker/
  entrypoint.sh      # Runs `prisma migrate deploy` then starts server
```

---

## Security Invariants — Never Violate These

1. **Every database query must filter by `tenantId`**. Cross-tenant data leakage is a critical vulnerability. Use the Prisma middleware in `src/lib/db.ts` or add explicit `where: { tenantId }` clauses.

2. **Encrypt all PHI fields before storing**. Fields prefixed `enc` in the schema (`encDateOfBirth`, `encSsnLastFour`, `encAddress`, `encNotes`) must go through `encryptField()` on write and `decryptField()` on read. Never store plaintext PHI.

3. **Audit every PHI/PII access**. All reads of client records, matter details, and document downloads must call an `audit.*` method from `src/lib/audit.ts`. Writes (uploads, status changes) must also be audited.

4. **Never expose the master encryption key**. `MASTER_ENCRYPTION_KEY` derives all tenant keys via HKDF. It lives only in AWS Secrets Manager and is never logged or returned in API responses.

5. **Validate tenant ownership before resource operations**. Before returning or mutating any record (matter, document, client, user), confirm `record.tenantId === session.user.tenantId`.

6. **Check permissions before every mutation**. Use `hasPermission(session.user.role, "PERMISSION_NAME")` from `src/lib/permissions.ts`. Return 403 if the check fails.

7. **Documents: store IV + AuthTag together**. The `iv` column in the `Document` model stores `"<iv_hex>:<authTag_hex>"`. Always split on `:` to extract both values on read.

8. **No plaintext secrets in code or logs**. Never `console.log` a secret, key, or password. Never hardcode credentials.

---

## User Roles

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | Platform-wide: all tenants, all data, billing |
| `FIRM_ADMIN` | Full access within their tenant; manage users/matters |
| `ATTORNEY` | Assigned matters; full matter + client + document access |
| `STAFF` | Assigned matters; limited admin actions |
| `CLIENT` | Portal only; own matters, own documents (where `allowClientView=true`), messaging |

---

## Key Patterns

### API Route Handler Pattern

```typescript
// src/app/api/example/route.ts
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "MATTER_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await db.matter.findMany({
    where: { tenantId: session.user.tenantId }, // ALWAYS filter by tenant
  });

  await audit.matterAccessed(session.user.id, session.user.tenantId, "list");

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

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (SSL required in prod) |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret (min 32 chars) |
| `NEXTAUTH_URL` | Full app URL (e.g., `https://app.yourfirm.com`) |
| `MASTER_ENCRYPTION_KEY` | 64-char hex (32 bytes) for HKDF key derivation |
| `STORAGE_PROVIDER` | `local` or `s3` |
| `AWS_S3_BUCKET` | S3 bucket name (when `STORAGE_PROVIDER=s3`) |
| `AWS_REGION` | AWS region |

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

## CI/CD

- **CI** (`.github/workflows/ci.yml`): npm audit, TypeScript, ESLint, Prisma validate, Docker build + Trivy scan, Gitleaks secret scan
- **Deploy** (`.github/workflows/deploy.yml`): OIDC → ECR push → ECS rolling deploy, triggered on push to `main`
- Images tagged `sha-<short-sha>` and deployed by digest for immutability

---

## Infrastructure

Terraform in `infrastructure/terraform/`. See `infrastructure/DEPLOYMENT.md` for the full runbook.

Key AWS resources: VPC (3 AZs), ECS Fargate (private subnets), RDS PostgreSQL Multi-AZ, S3 (documents), KMS (5 keys), WAF v2, ALB (TLS 1.2+), Secrets Manager, CloudWatch, VPC endpoints.

**Never run `terraform apply` without reviewing `terraform plan` first.**
