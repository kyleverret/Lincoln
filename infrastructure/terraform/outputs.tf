output "alb_dns_name" {
  description = "ALB DNS name — use this for initial DNS validation"
  value       = aws_lb.main.dns_name
}

output "app_url" {
  description = "Application URL"
  value       = "https://${var.domain_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL — set as ECR_REPOSITORY in GitHub secrets"
  value       = aws_ecr_repository.lincoln.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name — set as ECS_CLUSTER in GitHub secrets"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name — set as ECS_SERVICE in GitHub secrets"
  value       = aws_ecs_service.app.name
}

output "github_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC — set as AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "rds_endpoint" {
  description = "RDS endpoint (private — not publicly accessible)"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "documents_bucket_name" {
  description = "S3 bucket for encrypted documents"
  value       = aws_s3_bucket.documents.id
}

output "cloudwatch_dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "github_secrets_to_set" {
  description = "GitHub repository secrets required for CI/CD"
  value = {
    AWS_ACCOUNT_ID       = data.aws_caller_identity.current.account_id
    AWS_REGION           = var.aws_region
    AWS_DEPLOY_ROLE_ARN  = aws_iam_role.github_deploy.arn
    ECR_REPOSITORY       = "lincoln"
    ECS_CLUSTER          = aws_ecs_cluster.main.name
    ECS_SERVICE          = aws_ecs_service.app.name
    CONTAINER_NAME       = "lincoln"
  }
  sensitive = false
}
