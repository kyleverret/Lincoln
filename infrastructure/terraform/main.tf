# ============================================================
# Lincoln — AWS Infrastructure
# Terraform root module
#
# HIPAA-eligible services:
#   ECS Fargate, RDS PostgreSQL, S3 (SSE-KMS), Secrets Manager,
#   KMS, ALB, WAF, CloudWatch, VPC
#
# Prerequisites:
#   1. AWS account with HIPAA BAA signed with AWS
#   2. Route53 hosted zone for your domain
#   3. ACM certificate in us-east-1 (for CloudFront) or your region
#   4. terraform.tfvars (see terraform.tfvars.example)
#
# Usage:
#   terraform init
#   terraform plan -out=tfplan
#   terraform apply tfplan
# ============================================================

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state — replace bucket/key/region with your values
  backend "s3" {
    bucket         = "lincoln-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    # DynamoDB table for state locking
    dynamodb_table = "lincoln-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Lincoln"
      Environment = var.environment
      ManagedBy   = "Terraform"
      # HIPAA tag for compliance tracking
      Compliance  = "HIPAA"
    }
  }
}

# Random suffix for globally unique resource names
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "lincoln-${var.environment}"
  suffix      = random_id.suffix.hex
}
