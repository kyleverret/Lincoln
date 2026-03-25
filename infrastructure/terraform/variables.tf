variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be 'production' or 'staging'."
  }
}

# ---- Network ----

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones (min 2 for HA)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# ---- Domain ----

variable "domain_name" {
  description = "Root domain name (e.g., mylaw.firm)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (must be in same region as ALB)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
}

# ---- Application ----

variable "app_port" {
  description = "Port the Next.js container listens on"
  type        = number
  default     = 3000
}

variable "app_image" {
  description = "Full ECR image URI (set by CI/CD)"
  type        = string
  default     = ""
}

# ---- ECS ----

variable "ecs_task_cpu" {
  description = "ECS task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "ecs_task_memory" {
  description = "ECS task memory in MiB"
  type        = number
  default     = 2048
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_min_count" {
  description = "Minimum tasks for autoscaling"
  type        = number
  default     = 2
}

variable "ecs_max_count" {
  description = "Maximum tasks for autoscaling"
  type        = number
  default     = 10
}

# ---- RDS ----

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "lincoln"
}

variable "db_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "lincoln_admin"
  sensitive   = true
}

variable "db_allocated_storage" {
  description = "RDS storage in GB"
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention (HIPAA: min 6 years = 2190 days)"
  type        = number
  default     = 35  # Max for automated backups; use manual snapshots for longer retention
}

# ---- GitHub Actions OIDC ----

variable "github_org" {
  description = "GitHub organization or username"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (without org prefix)"
  type        = string
  default     = "Lincoln"
}

variable "create_github_oidc_provider" {
  description = "Set false if the GitHub OIDC provider already exists in this AWS account"
  type        = bool
  default     = true
}

# ---- Alerts ----

variable "alert_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
}
