# ============================================================
# AWS WAF v2 — Web Application Firewall
#
# Protects against:
#   - SQL injection
#   - Cross-site scripting (XSS)
#   - Common exploits (AWS Managed Rules)
#   - Known bad IPs (IP reputation list)
#   - Rate limiting (brute force protection)
# ============================================================

resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name_prefix}-waf"
  scope       = "REGIONAL"
  description = "Lincoln WAF — HIPAA-aligned web application firewall"

  default_action {
    allow {}
  }

  # ---- AWS Managed Rules ----

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 4

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # ---- Rate Limiting ----

  rule {
    name     = "RateLimitLoginEndpoint"
    priority = 10

    action { block {} }

    statement {
      rate_based_statement {
        limit              = 50   # 50 requests per 5 minutes per IP to /login
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/auth"
            field_to_match { uri_path {} }
            text_transformations {
              priority = 0
              type     = "LOWERCASE"
            }
            positional_constraint = "STARTS_WITH"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit-login"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitGlobal"
    priority = 11

    action { block {} }

    statement {
      rate_based_statement {
        limit              = 2000  # 2000 req/5min per IP globally
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit-global"
      sampled_requests_enabled   = true
    }
  }

  # ---- Document upload size limit (additional protection) ----

  rule {
    name     = "BlockOversizedBodies"
    priority = 20

    action { block {} }

    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = 55000000  # 55MB — slightly above app limit
        field_to_match { body { oversized_body_handling = "MATCH" } }
        text_transformations {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-oversized-body"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${local.name_prefix}-waf" }
}

# WAF logs to CloudWatch
resource "aws_cloudwatch_log_group" "waf" {
  # WAF log group name MUST start with "aws-waf-logs-"
  name              = "aws-waf-logs-${local.name_prefix}"
  retention_in_days = 2190
  kms_key_id        = aws_kms_key.cloudwatch.arn
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn
}
