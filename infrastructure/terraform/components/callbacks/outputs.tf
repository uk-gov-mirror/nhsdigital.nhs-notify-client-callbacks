##
# Deployment details
##

output "deployment" {
  description = "Deployment details used for post-deployment scripts"
  value = {
    aws_region     = var.region
    aws_account_id = var.aws_account_id
    project        = var.project
    environment    = var.environment
    group          = var.group
    component      = local.component
  }
}

##
# EventBridge Event Bus Outputs
##

output "eventbus_name" {
  description = "Name of the EventBridge event bus for callback events"
  value = {
    name = aws_cloudwatch_event_bus.main.name
    arn  = aws_cloudwatch_event_bus.main.arn
  }
}

##
# KMS
##

output "kms_key_arn" {
  description = "ARN of the KMS key used for encryption in the callbacks component"
  value       = module.kms.key_arn
}

##
# Shared infrastructure for callback-clients component
##

output "security_group_id" {
  description = "Security group ID for per-client HTTPS delivery Lambda functions"
  value       = aws_security_group.https_client_lambda.id
}

output "elasticache" {
  description = "ElastiCache delivery state details for cross-component access"
  value = {
    endpoint     = aws_elasticache_serverless_cache.delivery_state.endpoint[0].address
    cache_name   = aws_elasticache_serverless_cache.delivery_state.name
    iam_username = aws_elasticache_user.delivery_state_iam.user_name
  }
}

output "client_config_bucket" {
  description = "S3 bucket for client subscription configuration"
  value = {
    bucket = var.client_config_s3_bucket
    arn    = local.client_config_bucket_arn
  }
}

output "vpc_subnet_ids" {
  description = "Private subnet IDs for Lambda VPC configuration"
  value       = try(local.acct.private_subnets[local.bc_name], [])
}

output "lambda_s3_bucket" {
  description = "S3 bucket ID for Lambda function artefacts"
  value       = local.acct.s3_buckets["lambda_function_artefacts"]["id"]
}

output "log_destination_arn" {
  description = "Firehose destination ARN for log forwarding"
  value       = local.log_destination_arn
}

output "log_subscription_role_arn" {
  description = "IAM role ARN for CloudWatch log subscription"
  value       = local.acct.log_subscription_role_arn
}
