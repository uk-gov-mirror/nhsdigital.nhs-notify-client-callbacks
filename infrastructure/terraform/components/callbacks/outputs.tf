# Define the outputs for the component. The outputs may well be referenced by other component in the same or different environments using terraform_remote_state data sources...

##
# Mock Webhook Lambda Outputs (test/dev environments only)
##

output "mock_webhook_lambda_log_group_name" {
  description = "CloudWatch log group name for mock webhook lambda (for integration test queries)"
  value       = var.deploy_mock_webhook ? module.mock_webhook_lambda[0].cloudwatch_log_group_name : null
}

output "mock_webhook_url" {
  description = "URL endpoint for mock webhook (for TEST_WEBHOOK_URL environment variable)"
  value       = var.deploy_mock_webhook ? aws_lambda_function_url.mock_webhook[0].function_url : null
}
