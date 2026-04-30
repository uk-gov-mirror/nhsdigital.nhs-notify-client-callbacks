variable "project" {
  type        = string
  description = "The name of the tfscaffold project"
}

variable "environment" {
  type        = string
  description = "The name of the tfscaffold environment"
}

variable "component" {
  type        = string
  description = "Component name"
}

variable "aws_account_id" {
  type        = string
  description = "Account ID"
}

variable "region" {
  type        = string
  description = "AWS Region"
}

variable "group" {
  type        = string
  description = "The name of the tfscaffold group"
  default     = null
}

variable "client_id" {
  type        = string
  description = "Unique identifier for this client"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN for encryption at rest"
}

variable "client_bus_name" {
  type        = string
  description = "EventBridge bus name for subscription rules"
}

variable "subscriptions" {
  type = map(object({
    subscription_id = string
    target_ids      = list(string)
  }))
  description = "Subscription definitions for this client, keyed by subscription_id"
}

variable "subscription_targets" {
  type = map(object({
    subscription_id = string
    target_id       = string
  }))
  description = "Flattened subscription-target fanout map keyed by subscription-target composite key"
}

variable "client_config_bucket" {
  type        = string
  description = "S3 bucket name containing client subscription configuration"
}

variable "client_config_bucket_arn" {
  type        = string
  description = "S3 bucket ARN containing client subscription configuration"
}

variable "applications_map_parameter_name" {
  type        = string
  description = "SSM Parameter Store path for the clientId-to-applicationData map"
}

variable "lambda_s3_bucket" {
  type        = string
  description = "S3 bucket for Lambda function artefacts"
}

variable "lambda_code_base_path" {
  type        = string
  description = "Base path to Lambda source code directories"
}

variable "force_lambda_code_deploy" {
  type        = bool
  description = "Force Lambda code redeployment even when commit tag matches"
  default     = false
}

variable "log_level" {
  type        = string
  description = "Log level for the Lambda function"
  default     = "INFO"
}

variable "log_retention_in_days" {
  type        = number
  description = "CloudWatch log retention period in days"
  default     = 0
}

variable "log_destination_arn" {
  type        = string
  description = "Firehose destination ARN for log forwarding"
  default     = ""
}

variable "log_subscription_role_arn" {
  type        = string
  description = "IAM role ARN for CloudWatch log subscription"
  default     = ""
}

variable "lambda_batch_size" {
  type        = number
  description = "Number of SQS messages per Lambda invocation"
  default     = 10
}

variable "lambda_memory" {
  type        = number
  description = "Lambda memory allocation in MB"
  default     = 256
}

variable "lambda_timeout" {
  type        = number
  description = "Lambda timeout in seconds"
  default     = 30
}

variable "max_retry_duration_seconds" {
  type        = number
  description = "Maximum retry window before messages are sent to DLQ"
  default     = 7200
}

variable "sqs_visibility_timeout_seconds" {
  type        = number
  description = "Visibility timeout for the per-client delivery queue"
  default     = 60
}

variable "sqs_max_receive_count" {
  type        = number
  description = "Safety-net maximum receive count before a message moves to DLQ. Supplements the time-based retry window for cases where the Lambda fails before reaching the window check."
  default     = 100
}

variable "enable_xray_tracing" {
  type        = bool
  description = "Enable AWS X-Ray active tracing for the Lambda function"
  default     = false
}

variable "mtls_cert_s3_bucket" {
  type        = string
  description = "S3 bucket containing the mTLS client certificate bundle"
  default     = ""
}

variable "mtls_cert_s3_key" {
  type        = string
  description = "S3 key for the mTLS client certificate PEM bundle"
  default     = ""
}

variable "mtls_ca_s3_key" {
  type        = string
  description = "S3 key for the CA certificate PEM bundle used for server verification"
  default     = ""
}

variable "token_bucket_burst_capacity" {
  type        = number
  description = "Token bucket burst capacity used by the rate limiter"
  default     = 2250
}

variable "elasticache_endpoint" {
  type        = string
  description = "ElastiCache Serverless endpoint URL"
  default     = ""
}

variable "elasticache_cache_name" {
  type        = string
  description = "ElastiCache cache name for SigV4 token presigning"
  default     = ""
}

variable "elasticache_iam_username" {
  type        = string
  description = "IAM username for ElastiCache authentication"
  default     = ""
}

variable "vpc_subnet_ids" {
  type        = list(string)
  description = "VPC subnet IDs for Lambda execution"
  default     = []
}

variable "lambda_security_group_id" {
  type        = string
  description = "Security group ID for the Lambda function"
  default     = ""
}
