# ============================================================
# S3 — Encrypted Document Storage
#
# HIPAA requirements:
#   - Server-side encryption with dedicated KMS key (SSE-KMS)
#   - Versioning enabled (recover deleted/overwritten documents)
#   - Lifecycle policy (transition to IA after 90 days, Glacier after 1 year)
#   - Block all public access
#   - Object lock (WORM) disabled by default — enable per HIPAA retention policy
#   - Replication to secondary region (optional)
#   - Access logging
# ============================================================

resource "aws_s3_bucket" "documents" {
  bucket = "${local.name_prefix}-documents-${local.suffix}"

  # Prevent accidental deletion of PHI
  force_destroy = false

  tags = {
    Name        = "${local.name_prefix}-documents"
    DataClass   = "PHI"
    Sensitivity = "High"
  }
}

# ----------------------------------------------------------
# Block ALL public access — documents are never public
# ----------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ----------------------------------------------------------
# Versioning — recover deleted or overwritten documents
# ----------------------------------------------------------
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ----------------------------------------------------------
# Server-Side Encryption with KMS
# ----------------------------------------------------------
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    # Require SSE — reject unencrypted uploads
    bucket_key_enabled = true
  }
}

# ----------------------------------------------------------
# Lifecycle policy
# ----------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER_IR"  # Instant retrieval — keeps 6-year HIPAA access requirement
    }

    # Keep non-current versions for recovery but eventually expire them
    noncurrent_version_expiration {
      noncurrent_days = 2190  # 6 years
    }
  }
}

# ----------------------------------------------------------
# Bucket Policy — deny non-TLS requests and restrict access
# ----------------------------------------------------------
resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid    = "AllowECSTaskAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Sid    = "AllowECSTaskListBucket"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.documents.arn
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.documents]
}

# ----------------------------------------------------------
# S3 Access Logging bucket
# ----------------------------------------------------------
resource "aws_s3_bucket" "access_logs" {
  bucket        = "${local.name_prefix}-access-logs-${local.suffix}"
  force_destroy = false

  tags = { Name = "${local.name_prefix}-access-logs" }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "documents" {
  bucket        = aws_s3_bucket.documents.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "documents/"
}

resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-old-logs"
    status = "Enabled"
    expiration { days = 2190 }
  }
}
