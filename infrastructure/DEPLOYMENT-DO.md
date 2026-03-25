# Lincoln — DigitalOcean Deployment Runbook

Single-firm deployment on DigitalOcean App Platform with managed PostgreSQL and Spaces object storage. Intended for firms that want a simpler operations model than the full AWS stack.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| `doctl` | ≥ 1.110 | `brew install doctl` / [docs](https://docs.digitalocean.com/reference/doctl/) |
| Docker | ≥ 26 | [docs.docker.com](https://docs.docker.com/get-docker/) |
| A DigitalOcean account | — | [cloud.digitalocean.com](https://cloud.digitalocean.com) |

> **HIPAA note**: Before storing any client data, contact DigitalOcean to sign a Business Associate Agreement (BAA). BAAs are available on Business/Enterprise plans. Without a BAA, you **cannot** store PHI on the platform.

---

## Step 1 — Authenticate doctl

```bash
doctl auth init
# paste your personal access token when prompted
doctl account get   # verify
```

---

## Step 2 — Create a Container Registry (DOCR)

```bash
doctl registry create lincoln-registry --subscription-tier basic
```

Note the registry name (`lincoln-registry` in this example). You will use it as the `DOCR_REGISTRY` GitHub Actions variable.

---

## Step 3 — Create a DigitalOcean Spaces Bucket

1. Go to **Spaces Object Storage** in the DO console → **Create a Space**
2. Region: choose the same region you will deploy the app to (e.g. `nyc3`)
3. Name: `lincoln-documents` (or your preferred name)
4. **File Listing**: Disabled (private bucket)
5. **Enable CDN**: No

Generate Spaces access keys:
1. Go to **API** → **Spaces Keys** → **Generate New Key**
2. Name it `lincoln-app`
3. Save the **Access Key** and **Secret Key** — you will only see the secret once

---

## Step 4 — Create the App

```bash
# From the repo root:
doctl apps create --spec .do/app.yaml
```

This creates the app and the managed PostgreSQL database. Note the **App ID** from the output — you will use it as the `DO_APP_ID` GitHub Actions secret.

---

## Step 5 — Set Secrets

Secrets marked `<CHANGE_ME>` in `.do/app.yaml` must be set before the first deployment. **Never edit the app.yaml with real values** — set them via the console or CLI.

```bash
APP_ID=<your-app-id>

# Generate a strong NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -hex 32)

# Generate the master encryption key (64 hex chars = 32 bytes)
MASTER_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Update app with secrets
doctl apps update $APP_ID --spec - <<EOF
name: lincoln
region: nyc
services:
  - name: web
    envs:
      - key: NEXTAUTH_SECRET
        scope: RUN_TIME
        type: SECRET
        value: "$NEXTAUTH_SECRET"
      - key: MASTER_ENCRYPTION_KEY
        scope: RUN_TIME
        type: SECRET
        value: "$MASTER_ENCRYPTION_KEY"
      - key: AWS_ACCESS_KEY_ID
        scope: RUN_TIME
        type: SECRET
        value: "<spaces-access-key>"
      - key: AWS_SECRET_ACCESS_KEY
        scope: RUN_TIME
        type: SECRET
        value: "<spaces-secret-key>"
EOF
```

Alternatively, set secrets via the **DO Console → Apps → lincoln → Settings → Environment Variables**.

> **Critical**: Save `MASTER_ENCRYPTION_KEY` in a password manager. Losing it means losing access to all encrypted PHI. It cannot be recovered.

---

## Step 6 — Configure GitHub Actions

In your GitHub repository settings (**Settings → Secrets and variables**):

**Secrets** (`Settings → Secrets → Actions`):
| Secret | Value |
|--------|-------|
| `DIGITALOCEAN_ACCESS_TOKEN` | Your DO personal access token (needs registry write + apps write) |
| `DO_APP_ID` | The App ID from Step 4 |

**Variables** (`Settings → Variables → Actions`):
| Variable | Value |
|----------|-------|
| `DOCR_REGISTRY` | Registry name from Step 2 (e.g. `lincoln-registry`) |

---

## Step 7 — First Deployment

Push to `main` to trigger the deploy workflow:

```bash
git push origin main
```

Watch the deployment:

```bash
doctl apps list-deployments $APP_ID
```

Or watch logs:

```bash
doctl apps logs $APP_ID --type=run --follow
```

---

## Step 8 — Seed Initial Data

After the first successful deployment, run the seed script via the App Platform console or a one-off job:

```bash
# One-off console run via doctl (requires App Platform console access)
doctl apps console $APP_ID --component web -- npx tsx prisma/seed.ts
```

Or connect to the managed DB directly and run:

```bash
# Get the DB connection string
doctl databases connection $DB_ID --format URI --no-header

# Then from your local machine (with psql):
DATABASE_URL="<connection-string>" npx tsx prisma/seed.ts
```

Default demo credentials after seeding: see `CLAUDE.md` → Testing Accounts.

---

## Step 9 — Custom Domain (Optional)

1. In the DO console → **Apps → lincoln → Settings → Domains** → **Add Domain**
2. Add your firm's domain (e.g. `app.smithlaw.com`)
3. Add the CNAME record shown by DO to your DNS provider
4. Wait for certificate provisioning (usually < 5 minutes via Let's Encrypt)
5. Update the `NEXTAUTH_URL` environment variable to the new URL

---

## Step 10 — Restrict Database Access

By default, the managed PostgreSQL only accepts connections from within the same VPC as the App Platform app. Verify this:

```bash
doctl databases firewalls list $DB_ID
```

Ensure no `0.0.0.0/0` rules exist. If you need local access for migrations, add a temporary trusted source by IP:

```bash
doctl databases firewalls append $DB_ID --rule ip_addr:<your-ip>
# Remove it when done:
doctl databases firewalls remove $DB_ID --uuid <rule-uuid>
```

---

## Upgrading

### Scale the app

```bash
# Scale to 2 instances (horizontal)
doctl apps update $APP_ID --spec - <<EOF
services:
  - name: web
    instance_count: 2
EOF
```

### Upgrade database tier

```bash
doctl databases resize $DB_ID --size db-s-2vcpu-4gb --num-nodes 2
```

### Enable high availability (standby node)

Recommended before going live with real clients:

```bash
doctl databases resize $DB_ID --num-nodes 2
```

---

## Monitoring

```bash
# Live app logs
doctl apps logs $APP_ID --type=run --follow

# Build logs for a specific deployment
doctl apps logs $APP_ID --deployment <deployment-id> --type=build

# Recent deployments
doctl apps list-deployments $APP_ID

# App health / current status
doctl apps get $APP_ID
```

Set up email alerts in the DO console under **Apps → lincoln → Insights → Alerts**.

---

## Rollback

```bash
# List recent deployments
doctl apps list-deployments $APP_ID

# Re-deploy a previous deployment
doctl apps create-deployment $APP_ID \
  --previous-deployment <deployment-id>
```

---

## Disaster Recovery

| Scenario | Recovery |
|----------|---------|
| App crash / bad deploy | Rollback to previous deployment (above) |
| Database corruption | Restore from automatic daily backup: `doctl databases backups restore $DB_ID` |
| Spaces object loss | Versioning is off by default — enable it in Spaces settings for object-level recovery |
| Lost `MASTER_ENCRYPTION_KEY` | **Unrecoverable** — all PHI ciphertext is permanently inaccessible |

---

## Environment Variables Reference

| Variable | Example Value | Notes |
|----------|--------------|-------|
| `DATABASE_URL` | (auto-injected from managed DB) | Set by App Platform |
| `NEXTAUTH_URL` | `https://app.smithlaw.com` | Must match actual app URL |
| `NEXTAUTH_SECRET` | 64-char hex | `openssl rand -hex 32` |
| `MASTER_ENCRYPTION_KEY` | 64-char hex | `openssl rand -hex 32` |
| `STORAGE_PROVIDER` | `s3` | Use `local` only for dev |
| `STORAGE_ENDPOINT` | `https://nyc3.digitaloceanspaces.com` | Region must match bucket |
| `AWS_S3_BUCKET` | `lincoln-documents` | Spaces bucket name |
| `AWS_REGION` | `nyc3` | Spaces region |
| `AWS_ACCESS_KEY_ID` | (Spaces key) | Not your DO account key |
| `AWS_SECRET_ACCESS_KEY` | (Spaces secret) | Not your DO account key |
