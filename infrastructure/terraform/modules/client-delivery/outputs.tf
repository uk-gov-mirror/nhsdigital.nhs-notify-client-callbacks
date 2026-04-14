output "delivery_queue_arn" {
  description = "ARN of the per-client delivery SQS queue"
  value       = module.sqs_delivery.sqs_queue_arn
}

output "delivery_queue_url" {
  description = "URL of the per-client delivery SQS queue"
  value       = module.sqs_delivery.sqs_queue_url
}

output "dlq_arn" {
  description = "ARN of the per-client delivery DLQ"
  value       = module.dlq_delivery.sqs_queue_arn
}

output "dlq_url" {
  description = "URL of the per-client delivery DLQ"
  value       = module.dlq_delivery.sqs_queue_url
}

output "lambda_function_name" {
  description = "Name of the per-client HTTPS Client Lambda function"
  value       = module.https_client_lambda.function_name
}

output "lambda_function_arn" {
  description = "ARN of the per-client HTTPS Client Lambda function"
  value       = module.https_client_lambda.function_arn
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution IAM role"
  value       = module.https_client_lambda.iam_role_arn
}
