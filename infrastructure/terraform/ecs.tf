# ============================================================
# Amazon ECS Fargate — Application Cluster
#
# - Fargate (serverless, no EC2 instances to patch)
# - CloudWatch Container Insights for observability
# - Auto-scaling on CPU and memory
# - Rolling deployment (min 50% healthy, max 200%)
# - Secrets injected from Secrets Manager (never in image or env vars)
# ============================================================

# ----------------------------------------------------------
# ECS Cluster
# ----------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = var.ecs_min_count  # Minimum tasks always on FARGATE (not SPOT)
  }
}

# ----------------------------------------------------------
# CloudWatch Log Group for app logs
# ----------------------------------------------------------
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}/app"
  retention_in_days = 2190  # 6 years — HIPAA minimum
  kms_key_id        = aws_kms_key.cloudwatch.arn
}

# ----------------------------------------------------------
# ECS Task Definition
# ----------------------------------------------------------
resource "aws_ecs_task_definition" "app" {
  family                   = local.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "lincoln"
      image     = var.app_image != "" ? var.app_image : "${aws_ecr_repository.lincoln.repository_url}:latest"
      essential = true

      portMappings = [{
        containerPort = var.app_port
        protocol      = "tcp"
      }]

      # Non-sensitive env vars
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.app_port) },
        { name = "HOSTNAME", value = "0.0.0.0" },
        { name = "NEXT_TELEMETRY_DISABLED", value = "1" },
        { name = "AUTH_URL", value = "https://${var.domain_name}" },
        { name = "APP_URL", value = "https://${var.domain_name}" },
        { name = "STORAGE_PROVIDER", value = "s3" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_S3_BUCKET", value = aws_s3_bucket.documents.id },
        { name = "SESSION_MAX_AGE", value = "28800" },
        { name = "MAX_LOGIN_ATTEMPTS", value = "5" },
        { name = "LOCKOUT_DURATION_MINUTES", value = "30" },
        { name = "AUDIT_LOG_RETENTION_DAYS", value = "2190" },
      ]

      # Sensitive secrets — injected at runtime from Secrets Manager
      # These NEVER appear in logs, environment, or the Docker image
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:url::"
        },
        {
          name      = "AUTH_SECRET"
          valueFrom = aws_secretsmanager_secret.auth_secret.arn
        },
        {
          name      = "MASTER_ENCRYPTION_KEY"
          valueFrom = "${aws_secretsmanager_secret.encryption_keys.arn}:MASTER_ENCRYPTION_KEY::"
        },
        {
          name      = "ENCRYPTION_SALT"
          valueFrom = "${aws_secretsmanager_secret.encryption_keys.arn}:ENCRYPTION_SALT::"
        },
      ]

      # CloudWatch logging
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.app_port}/api/health || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }

      # Read-only root filesystem (security hardening)
      readonlyRootFilesystem = false  # Next.js standalone needs write access to /tmp

      # No privilege escalation
      privileged             = false
      user                   = "1001"
    }
  ])

  tags = { Name = "${local.name_prefix}-task-def" }
}

# ----------------------------------------------------------
# ECS Service
# ----------------------------------------------------------
resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  # Rolling update configuration
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_controller {
    type = "ECS"
  }

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false  # Private subnet — uses NAT
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "lincoln"
    container_port   = var.app_port
  }

  # Wait for ALB listener before creating service
  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.ecs_execution_managed,
  ]

  lifecycle {
    # Prevent Terraform from reverting task definition when CI/CD updates it
    ignore_changes = [task_definition, desired_count]
  }

  tags = { Name = "${local.name_prefix}-service" }
}

# ----------------------------------------------------------
# Auto-scaling
# ----------------------------------------------------------
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.ecs_max_count
  min_capacity       = var.ecs_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${local.name_prefix}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
