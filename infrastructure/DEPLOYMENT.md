# Lincoln — Deployment Runbook

## Architecture Overview

```
Internet
   │
   ▼
[Route53 DNS]
   │
   ▼
[WAF] ← SQL injection, XSS, rate limiting, IP reputation
   │
   ▼
[ALB] ← TLS termination (TLS 1.2+), HTTP→HTTPS redirect
   │
   ├── Public Subnets (AZ-a, AZ-b, AZ-c)
   │
   ▼
[ECS Fargate Tasks] ← Private subnets, no public IP
   │  ↓ pulls image from  [ECR]
   │  ↓ reads secrets from [Secrets Manager]
   │  ↓ writes logs to    [CloudWatch]
   │
   ├── [RDS PostgreSQL] ← Multi-AZ, private DB subnets, KMS encrypted
   └── [S3 Documents]  ← SSE-KMS, versioned, private, lifecycle policy

[GitHub Actions] ──OIDC──▶ [IAM Deploy Role] → ECR push + ECS deploy
```

**Security controls in effect:**
- TLS 1.2+ everywhere (ALB policy: ELBSecurityPolicy-TLS13-1-2-2021-06)
- AES-256-GCM for documents + sensitive DB fields (application layer)
- KMS encryption for RDS, S3, Secrets Manager, CloudWatch
- PostgreSQL SSL enforced via RDS parameter group
- VPC flow logs → CloudWatch (6-year retention)
- WAF: AWS managed rules + rate limiting + body size limits
- No public IPs on ECS tasks or RDS
- IAM roles with least privilege; GitHub Actions uses OIDC (no access keys)
- Container image scanning on ECR push + Trivy in CI
- Secret scanning with Gitleaks in CI

---

## Prerequisites

| Tool | Version |
|------|---------|
| AWS CLI | v2.x |
| Terraform | >= 1.7.0 |
| Docker | >= 24 |
| Node.js | 20 LTS |

### AWS Account Setup

1. **Sign a HIPAA BAA** with AWS before storing any PHI.
   AWS Console → AWS Artifact → Agreements → BAA

2. **Create Terraform remote state bucket and DynamoDB lock table:**
   ```bash
   # Replace with your account/region
   BUCKET=lincoln-terraform-state
   REGION=us-east-1

   aws s3api create-bucket \
     --bucket $BUCKET \
     --region $REGION \
     --create-bucket-configuration LocationConstraint=$REGION

   # Enable versioning + encryption
   aws s3api put-bucket-versioning \
     --bucket $BUCKET \
     --versioning-configuration Status=Enabled

   aws s3api put-bucket-encryption \
     --bucket $BUCKET \
     --server-side-encryption-configuration \
       '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]}'

   # Block public access
   aws s3api put-public-access-block \
     --bucket $BUCKET \
     --public-access-block-configuration \
       "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

   # DynamoDB for state locking
   aws dynamodb create-table \
     --table-name lincoln-terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region $REGION
   ```

3. **Get an ACM certificate** for your domain:
   ```bash
   aws acm request-certificate \
     --domain-name app.yourfirm.com \
     --validation-method DNS \
     --region us-east-1
   # Follow DNS validation instructions in the console
   ```

---

## First Deployment

### Step 1 — Configure Terraform

```bash
cd infrastructure/terraform

cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual values:
#   domain_name, acm_certificate_arn, route53_zone_id
#   github_org, alert_email
```

### Step 2 — Initialize and Apply

```bash
terraform init
terraform plan -out=tfplan
# Review the plan carefully — check security groups, IAM policies

terraform apply tfplan
```

This will output all the values you need for GitHub secrets:
```
github_secrets_to_set = {
  AWS_ACCOUNT_ID       = "123456789012"
  AWS_REGION           = "us-east-1"
  AWS_DEPLOY_ROLE_ARN  = "arn:aws:iam::123456789012:role/..."
  ECR_REPOSITORY       = "lincoln"
  ECS_CLUSTER          = "lincoln-production"
  ECS_SERVICE          = "lincoln-production-app"
  CONTAINER_NAME       = "lincoln"
}
```

### Step 3 — Apply RLS Policies

After the first `prisma migrate deploy` runs (via the entrypoint), apply RLS:
```bash
# Get DB connection from Secrets Manager
DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id lincoln-production/db-credentials \
  --query SecretString --output text | jq -r '.url')

psql "$DB_URL" -f ../../prisma/rls.sql
```

### Step 4 — Set GitHub Secrets

In your GitHub repository: **Settings → Secrets and variables → Actions**

Set all secrets from the Terraform output.

### Step 5 — Run First Deploy

Push to `main` branch or trigger the Deploy workflow manually.

```bash
git push origin main
```

### Step 6 — Seed Initial Data (first time only)

After deployment, run the seed script via an ECS Fargate task:
```bash
aws ecs run-task \
  --cluster lincoln-production \
  --task-definition lincoln-production \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}" \
  --overrides '{"containerOverrides":[{"name":"lincoln","command":["npx","tsx","prisma/seed.ts"]}]}'
```

---

## Rolling Deploys (ongoing)

Every push to `main`:
1. CI runs (lint, type check, Trivy scan, secret scan)
2. If CI passes, Deploy workflow triggers
3. Docker image built + pushed to ECR with `sha-<short-sha>` tag
4. New ECS task definition registered with the new image digest
5. ECS rolling update: new tasks start before old ones drain (50% min healthy)
6. Health check on `/api/health` verifies deployment
7. Workflow summary posted to GitHub

**Rollback:** Re-deploy the previous tag via the GitHub Actions UI (re-run a previous workflow), or:
```bash
# Point ECS service at a previous task definition revision
aws ecs update-service \
  --cluster lincoln-production \
  --service lincoln-production-app \
  --task-definition lincoln-production:42  # previous revision
```

---

## Database Migrations

Migrations run automatically on container startup via `docker/entrypoint.sh`:
```sh
npx prisma migrate deploy
```

For large/dangerous migrations (schema changes on big tables):
1. Put the migration in `prisma/migrations/`
2. Run it manually on a maintenance window before deploying
3. Use `prisma migrate resolve --applied <migration_name>` to mark it applied

---

## Secrets Rotation

### Rotating the DB password
```bash
aws secretsmanager rotate-secret \
  --secret-id lincoln-production/db-credentials
# ECS tasks will pick up the new secret on next restart
aws ecs update-service \
  --cluster lincoln-production \
  --service lincoln-production-app \
  --force-new-deployment
```

### Rotating the master encryption key
⚠️ **Critical**: The `MASTER_ENCRYPTION_KEY` is used to derive all tenant encryption keys via HKDF. Changing it makes all existing encrypted data unreadable without re-encryption.

Procedure:
1. Generate a new key
2. Write a migration script that decrypts all data with the old key and re-encrypts with the new key
3. Test thoroughly in staging
4. Apply in a maintenance window with the app offline
5. Update the secret in Secrets Manager
6. Redeploy

---

## Monitoring

- **CloudWatch Dashboard**: See Terraform output `cloudwatch_dashboard_url`
- **WAF logs**: CloudWatch log group `aws-waf-logs-lincoln-production`
- **App logs**: CloudWatch log group `/ecs/lincoln-production/app`
- **RDS logs**: CloudWatch log group `/aws/rds/instance/lincoln-production-postgres/postgresql`
- **VPC flow logs**: CloudWatch log group `/aws/vpc/lincoln-production/flow-logs`
- **Alarms**: Email to `alert_email` on CPU/memory/error spikes, WAF block spikes

---

## HIPAA Compliance Checklist

Before handling actual PHI, ensure:

- [ ] HIPAA BAA signed with AWS
- [ ] HIPAA BAA signed with any other service providers (email, monitoring, etc.)
- [ ] All users have completed HIPAA workforce training
- [ ] Written HIPAA policies and procedures documented
- [ ] Business Associate Agreements in place with all law firm clients
- [ ] Penetration test completed
- [ ] Incident response plan documented and tested
- [ ] Backup restore procedure tested
- [ ] Access log review cadence established (monthly minimum)
- [ ] MFA enforced for all firm users (check admin panel)
- [ ] Encryption key backup procedure in place and tested
- [ ] Audit log review configured (CloudWatch Insights queries set up)

---

## Disaster Recovery

**RTO (Recovery Time Objective):** ~15 minutes (ECS auto-recovery + RDS Multi-AZ failover)
**RPO (Recovery Point Objective):** ~5 minutes (RDS automated backups every 5 min transaction logs)

### RDS restore from snapshot
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lincoln-production-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t3.medium \
  --no-publicly-accessible
```

### Full environment restore
1. Deploy Terraform to new AWS account/region
2. Restore RDS from cross-region replica or snapshot
3. Copy S3 documents bucket to new region
4. Update DNS to new ALB endpoint
