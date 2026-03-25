# ============================================================
# AWS Secrets Manager
#
# All application secrets are stored here — never in environment
# files, Docker images, or GitHub Actions environment variables.
#
# The ECS task role has read-only access to these secrets.
# Secrets are injected as environment variables via the ECS
# task definition's "secrets" field (not "environment").
# ============================================================

# ----------------------------------------------------------
# Database credentials (auto-generated)
# ----------------------------------------------------------
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.name_prefix}/db-credentials"
  description             = "RDS PostgreSQL credentials"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 30

  tags = { Name = "${local.name_prefix}-db-credentials" }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
    host     = aws_db_instance.main.address
    port     = 5432
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.address}:5432/${var.db_name}?schema=public&sslmode=require"
  })

  # Recreate if DB address changes
  depends_on = [aws_db_instance.main]
}

# ----------------------------------------------------------
# NextAuth secret (auto-generated)
# ----------------------------------------------------------
resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name                    = "${local.name_prefix}/auth-secret"
  description             = "NextAuth JWT signing secret"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = random_password.auth_secret.result
}

# ----------------------------------------------------------
# Application master encryption key
# CRITICAL: This is the root of all per-tenant key derivation.
# Back this up independently. Losing it = losing all encrypted data.
# ----------------------------------------------------------
resource "random_bytes" "master_encryption_key" {
  length = 32
}

resource "random_bytes" "encryption_salt" {
  length = 16
}

resource "aws_secretsmanager_secret" "encryption_keys" {
  name                    = "${local.name_prefix}/encryption-keys"
  description             = "Application envelope encryption keys — CRITICAL"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 30

  tags = {
    Name     = "${local.name_prefix}-encryption-keys"
    Critical = "true"
  }
}

resource "aws_secretsmanager_secret_version" "encryption_keys" {
  secret_id = aws_secretsmanager_secret.encryption_keys.id
  secret_string = jsonencode({
    MASTER_ENCRYPTION_KEY = random_bytes.master_encryption_key.hex
    ENCRYPTION_SALT       = random_bytes.encryption_salt.hex
  })
}

# ----------------------------------------------------------
# S3 bucket name (not sensitive, but centralised here)
# ----------------------------------------------------------
resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/${local.name_prefix}/s3-bucket-name"
  type  = "String"
  value = aws_s3_bucket.documents.id
}

resource "aws_ssm_parameter" "app_url" {
  name  = "/lincoln/production/app-url"
  type  = "String"
  value = "https://${var.domain_name}"
}
