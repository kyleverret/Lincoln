# ============================================================
# Amazon RDS — PostgreSQL
#
# HIPAA requirements implemented:
#   - Encryption at rest with dedicated KMS key
#   - Multi-AZ for high availability
#   - Private subnet (no internet route)
#   - Automated backups with 35-day retention
#   - Performance Insights enabled
#   - Enhanced monitoring
#   - Deletion protection
#   - TLS-only connections enforced via parameter group
# ============================================================

# ----------------------------------------------------------
# DB Subnet Group
# ----------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name        = "${local.name_prefix}-db-subnet-group"
  description = "Private subnets for Lincoln RDS"
  subnet_ids  = aws_subnet.private_db[*].id

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

# ----------------------------------------------------------
# Parameter Group — enforce TLS + HIPAA-aligned settings
# ----------------------------------------------------------
resource "aws_db_parameter_group" "main" {
  family      = "postgres16"
  name        = "${local.name_prefix}-pg16-params"
  description = "Lincoln PostgreSQL 16 — HIPAA configuration"

  # Force SSL connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Log all connections and disconnections
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # Log statements that take more than 1 second
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Log checkpoints
  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  tags = { Name = "${local.name_prefix}-db-params" }
}

# ----------------------------------------------------------
# IAM role for enhanced monitoring
# ----------------------------------------------------------
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ----------------------------------------------------------
# RDS Instance
# ----------------------------------------------------------
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  # Engine
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  # Credentials
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  # Storage
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 5
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  # HA
  multi_az = true

  # Backups
  backup_retention_period   = var.db_backup_retention_days
  backup_window             = "03:00-04:00"   # UTC — low traffic window
  maintenance_window        = "sun:04:00-sun:05:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false

  # Configuration
  parameter_group_name = aws_db_parameter_group.main.name

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Safety
  deletion_protection      = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot-${local.suffix}"

  tags = { Name = "${local.name_prefix}-postgres" }

  depends_on = [aws_cloudwatch_log_group.rds]
}

resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${local.name_prefix}-postgres/postgresql"
  retention_in_days = 2190  # 6 years
  kms_key_id        = aws_kms_key.cloudwatch.arn
}
