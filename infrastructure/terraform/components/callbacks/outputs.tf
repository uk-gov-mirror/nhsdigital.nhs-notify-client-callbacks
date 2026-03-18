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
    component      = var.component
  }
}

##
# Mock Webhook Lambda Outputs (test/dev environments only).
##

output "mock_webhook_lambda_log_group_name" {
  description = "CloudWatch log group name for mock webhook lambda (for integration test queries)"
  value       = var.deploy_mock_webhook ? module.mock_webhook_lambda[0].cloudwatch_log_group_name : null
}

output "mock_webhook_url" {
  description = "URL endpoint for mock webhook (for TEST_WEBHOOK_URL environment variable)"
  value       = var.deploy_mock_webhook ? aws_lambda_function_url.mock_webhook[0].function_url : null
}

output "debug_log_bucket_name" {
  description = "S3 bucket name for debug logs (integration testing only)"
  value       = var.enable_debug_log_bucket ? module.debug_log_bucket[0].id : null
}
