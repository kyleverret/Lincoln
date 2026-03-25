# ============================================================
# Amazon ECR — Container Registry
#
# - Image scanning on push (detect vulnerabilities before deploy)
# - Encryption with KMS
# - Lifecycle policy (keep last 10 production images)
# ============================================================

resource "aws_ecr_repository" "lincoln" {
  name                 = "lincoln"
  image_tag_mutability = "IMMUTABLE"  # Tags cannot be overwritten

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.s3.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${local.name_prefix}-ecr" }
}

# Lifecycle policy — keep last 10 tagged images per environment
resource "aws_ecr_lifecycle_policy" "lincoln" {
  repository = aws_ecr_repository.lincoln.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}

# Repository policy — allow GitHub Actions deploy role to push/pull
resource "aws_ecr_repository_policy" "lincoln" {
  repository = aws_ecr_repository.lincoln.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowDeployRole"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.github_deploy.arn
        }
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:DescribeImages",
          "ecr:ListImages"
        ]
      },
      {
        Sid    = "AllowECSTaskPull"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_execution.arn
        }
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
      }
    ]
  })
}
