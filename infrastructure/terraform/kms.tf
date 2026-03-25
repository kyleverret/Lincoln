# ============================================================
# KMS Keys
#
# Separate keys per service — limits blast radius if a key is
# compromised and satisfies HIPAA "minimum necessary" principle.
# All keys have automatic annual rotation enabled.
# ============================================================

# ----------------------------------------------------------
# RDS encryption key
# ----------------------------------------------------------
resource "aws_kms_key" "rds" {
  description             = "Lincoln ${var.environment} — RDS database encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region            = false

  policy = data.aws_iam_policy_document.kms_rds.json

  tags = { Name = "${local.name_prefix}-rds-key" }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ----------------------------------------------------------
# S3 (document storage) encryption key
# ----------------------------------------------------------
resource "aws_kms_key" "s3" {
  description             = "Lincoln ${var.environment} — S3 document encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = data.aws_iam_policy_document.kms_s3.json

  tags = { Name = "${local.name_prefix}-s3-key" }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${local.name_prefix}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# ----------------------------------------------------------
# Secrets Manager encryption key
# ----------------------------------------------------------
resource "aws_kms_key" "secrets" {
  description             = "Lincoln ${var.environment} — Secrets Manager"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = data.aws_iam_policy_document.kms_secrets.json

  tags = { Name = "${local.name_prefix}-secrets-key" }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.name_prefix}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ----------------------------------------------------------
# CloudWatch Logs encryption key
# ----------------------------------------------------------
resource "aws_kms_key" "cloudwatch" {
  description             = "Lincoln ${var.environment} — CloudWatch Logs"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = data.aws_iam_policy_document.kms_cloudwatch.json

  tags = { Name = "${local.name_prefix}-cloudwatch-key" }
}

resource "aws_kms_alias" "cloudwatch" {
  name          = "alias/${local.name_prefix}-cloudwatch"
  target_key_id = aws_kms_key.cloudwatch.key_id
}

# ----------------------------------------------------------
# Application master encryption key (envelope encryption)
# This is the MASTER_ENCRYPTION_KEY used by src/lib/encryption.ts
# ----------------------------------------------------------
resource "aws_kms_key" "app_master" {
  description             = "Lincoln ${var.environment} — Application master encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = data.aws_iam_policy_document.kms_app_master.json

  tags = { Name = "${local.name_prefix}-app-master-key" }
}

resource "aws_kms_alias" "app_master" {
  name          = "alias/${local.name_prefix}-app-master"
  target_key_id = aws_kms_key.app_master.key_id
}

# ----------------------------------------------------------
# KMS Key Policies
# ----------------------------------------------------------
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "kms_rds" {
  statement {
    sid     = "RootAccess"
    effect  = "Allow"
    actions = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "RDSServiceAccess"
    effect = "Allow"
    actions = ["kms:GenerateDataKey*", "kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "kms_s3" {
  statement {
    sid     = "RootAccess"
    effect  = "Allow"
    actions = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "ECSTaskAccess"
    effect = "Allow"
    actions = ["kms:GenerateDataKey*", "kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ecs_task.arn]
    }
  }
}

data "aws_iam_policy_document" "kms_secrets" {
  statement {
    sid     = "RootAccess"
    effect  = "Allow"
    actions = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "SecretsManagerAccess"
    effect = "Allow"
    actions = ["kms:GenerateDataKey*", "kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["secretsmanager.amazonaws.com"]
    }
  }
  statement {
    sid    = "ECSTaskReadAccess"
    effect = "Allow"
    actions = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ecs_task.arn]
    }
  }
}

data "aws_iam_policy_document" "kms_cloudwatch" {
  statement {
    sid     = "RootAccess"
    effect  = "Allow"
    actions = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "CloudWatchLogsAccess"
    effect = "Allow"
    actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*",
      "kms:DescribeKey", "kms:ReEncrypt*"
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "kms_app_master" {
  statement {
    sid     = "RootAccess"
    effect  = "Allow"
    actions = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "ECSTaskAccess"
    effect = "Allow"
    actions = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ecs_task.arn]
    }
  }
}
