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
  value       = var.deploy_mock_clients ? module.mock_webhook_lambda[0].cloudwatch_log_group_name : null
}
