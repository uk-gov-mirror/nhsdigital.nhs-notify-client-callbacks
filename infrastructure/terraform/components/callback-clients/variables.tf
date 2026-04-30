##
# Basic Required Variables for tfscaffold Components
##

variable "project" {
  type        = string
  description = "The name of the tfscaffold project"
}

variable "environment" {
  type        = string
  description = "The name of the tfscaffold environment"
}

variable "aws_account_id" {
  type        = string
  description = "The AWS Account ID (numeric)"
}

variable "region" {
  type        = string
  description = "The AWS Region"
}

variable "group" {
  type        = string
  description = "The group variables are being inherited from (often synonmous with account short-name)"
}

##
# tfscaffold variables specific to this component
##

variable "default_tags" {
  type        = map(string)
  description = "A map of default tags to apply to all taggable resources within the component"
  default     = {}
}

variable "parent_acct_environment" {
  type        = string
  description = "Name of the environment responsible for the acct resources used, affects things like DNS zone. Useful for named dev environments"
  default     = "main"
}

variable "parent_callbacks_environment" {
  type        = string
  description = "The name of the environment which deployed the parent callbacks component. Used to identify the appropriate state file."
  default     = "main"
}

##
# Variables specific to the component
##

variable "log_retention_in_days" {
  type        = number
  description = "The retention period in days for the Cloudwatch Logs events to be retained, default of 0 is indefinite"
  default     = 0
}

variable "log_level" {
  type        = string
  description = "The log level to be used in lambda functions within the component"
  default     = "INFO"
}

variable "force_lambda_code_deploy" {
  type        = bool
  description = "If the lambda package in s3 has the same commit id tag as the terraform build branch, the lambda will not update automatically. Set to True if making changes to Lambda code from on the same commit for example during development"
  default     = false
}

variable "deploy_mock_clients" {
  type        = bool
  description = "Flag to deploy mock webhook lambda for integration testing"
  default     = false
}

variable "enable_xray_tracing" {
  type        = bool
  description = "Enable AWS X-Ray active tracing for Lambda functions"
  default     = false
}

variable "token_bucket_burst_capacity" {
  type        = number
  description = "Token bucket burst capacity used by the rate limiter"
  default     = 2250
}

variable "s3_enable_force_destroy" {
  type        = bool
  description = "Whether to enable force destroy for the S3 buckets created in this module"
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

variable "applications_map_s3_bucket" {
  type        = string
  description = "S3 bucket for the applications map"
}

variable "client_config_s3_bucket" {
  type        = string
  description = "S3 bucket for client subscription configuration"
}
