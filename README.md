# Lincoln — Law Firm Case Management Platform

A secure, multi-tenant case management platform for law firms with HIPAA-informed security design.

## Architecture Overview

### Security Model
- **Encryption at rest**: AES-256-GCM envelope encryption. Per-tenant data encryption keys (DEK) derived via HKDF from a master key. Documents stored as ciphertext; sensitive client fields (SSN, DOB, address) encrypted at the field level before database storage.
- **Encryption in transit**: TLS 1.3 (infrastructure level).
- **Authentication**: NextAuth v5 with credentials + TOTP MFA. Bcrypt password hashing (cost 12). Account lockout after configurable failed attempts.
- **Row Level Security**: PostgreSQL RLS policies enforce tenant isolation at the database layer as defense-in-depth (see `prisma/rls.sql`).
- **Audit logging**: All PHI/PII access, document downloads, logins, and administrative actions are logged immutably (`audit_logs` table).
- **Session security**: Short-lived JWT sessions (8 hours by default), role-based access control.

### Multi-Tenancy
- Each law firm is a **Tenant** with a unique slug and its own encryption key ID.
- Every tenant-scoped table carries `tenant_id`; API routes validate this at every layer.
- RLS policies provide database-level guarantees independent of application code.

### User Roles
| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Platform-wide administration; manages all tenants |
| `FIRM_ADMIN` | Firm-level admin; manages users and assigns cases |
| `ATTORNEY` | Licensed attorney; manages assigned matters |
| `STAFF` | Paralegal/support; works on assigned matters |
| `CLIENT` | Client portal access only |

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth v5 beta
- **UI**: Tailwind CSS + shadcn/ui + Radix UI
- **Kanban**: dnd-kit (drag-and-drop)
- **Encryption**: Node.js `crypto` (AES-256-GCM + HKDF)
- **Storage**: Pluggable (local filesystem or S3-compatible)

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+

### Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your database URL and secrets

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Apply Row Level Security policies
psql $DATABASE_URL -f prisma/rls.sql

# Seed demo data
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables (required)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | 64+ char random string for NextAuth |
| `MASTER_ENCRYPTION_KEY` | 64 hex chars (32 bytes) — master encryption key |
| `ENCRYPTION_SALT` | 32 hex chars — HKDF salt |

### Demo Accounts (after seeding)

Password for all accounts: `Demo@Password1!`

| Role | Email |
|------|-------|
| Super Admin | superadmin@lincoln.example.com |
| Firm Admin | admin@smith-associates.example.com |
| Attorney | jdoe@smith-associates.example.com |
| Attorney | mjohnson@smith-associates.example.com |
| Staff | staff@smith-associates.example.com |

## Features

### Current
- ✅ Multi-tenant firm management
- ✅ Role-based access control (5 roles)
- ✅ Client management with encrypted PII fields
- ✅ Matter/case management with full CRUD
- ✅ Kanban board with drag-and-drop (customizable columns)
- ✅ Secure document repository (AES-256-GCM encrypted)
- ✅ Client intake forms
- ✅ Client portal (case status, documents)
- ✅ TOTP-based multi-factor authentication
- ✅ Comprehensive audit logging
- ✅ Admin dashboard with security overview

### Planned
- Client-attorney messaging (encrypted)
- Document version control UI
- Time tracking and billing
- Court date calendar
- Conflict of interest checker
- Client portal onboarding flow
- Email notifications
- S3 document storage configuration
- Super admin platform dashboard

## HIPAA Compliance Notes

This system implements technical safeguards aligned with HIPAA Security Rule requirements:

1. **Access Control** (§164.312(a)): RBAC with least-privilege, unique user IDs, auto-logoff
2. **Audit Controls** (§164.312(b)): Immutable audit log of all PHI access
3. **Integrity** (§164.312(c)): SHA-256 checksums on documents; AES-GCM authentication tags
4. **Transmission Security** (§164.312(e)): TLS 1.3 enforced via headers + HSTS
5. **Encryption** (§164.312(a)(2)(iv)): AES-256-GCM for all documents and sensitive fields

**Important**: While this system implements strong technical controls, full HIPAA compliance also requires administrative and physical safeguards, a signed BAA with hosting providers, workforce training, and documented policies. Consult a HIPAA compliance expert before handling actual PHI.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, MFA
│   ├── (dashboard)/     # Firm user workspace
│   │   ├── dashboard/   # Overview dashboard
│   │   ├── cases/       # Case list, detail, kanban board
│   │   ├── clients/     # Client management, intake
│   │   ├── documents/   # Document repository
│   │   └── admin/       # Firm administration
│   ├── (portal)/        # Client portal
│   └── api/             # REST API routes
├── components/
│   ├── ui/              # shadcn primitives
│   ├── layout/          # Sidebar, header
│   ├── cases/           # Kanban board components
│   ├── clients/         # Client forms
│   ├── documents/       # Upload form
│   └── auth/            # Login form
└── lib/
    ├── auth.ts          # NextAuth config
    ├── db.ts            # Prisma client
    ├── encryption.ts    # AES-256-GCM utilities
    ├── audit.ts         # Audit logging
    ├── storage.ts       # Document storage (local/S3)
    ├── permissions.ts   # RBAC
    └── validations/     # Zod schemas
```
