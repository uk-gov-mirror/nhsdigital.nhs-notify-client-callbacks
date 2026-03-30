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

# This is the only primary variable to have its value defined as
# a default within its declaration in this file, because the variables
# purpose is as an identifier unique to this component, rather
# then to the environment from where all other variables come.
variable "component" {
  type        = string
  description = "The variable encapsulating the name of this component"
  default     = "callbacks"
}

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

##
# Variables specific to the component
##

variable "log_retention_in_days" {
  type        = number
  description = "The retention period in days for the Cloudwatch Logs events to be retained, default of 0 is indefinite"
  default     = 0
}

variable "kms_deletion_window" {
  type        = string
  description = "When a kms key is deleted, how long should it wait in the pending deletion state?"
  default     = "30"
}

variable "log_level" {
  type        = string
  description = "The log level to be used in lambda functions within the component. Any log with a lower severity than the configured value will not be logged: https://docs.python.org/3/library/logging.html#levels"
  default     = "INFO"
}

variable "force_lambda_code_deploy" {
  type        = bool
  description = "If the lambda package in s3 has the same commit id tag as the terraform build branch, the lambda will not update automatically. Set to True if making changes to Lambda code from on the same commit for example during development"
  default     = false
}

variable "pipe_event_patterns" {
  type        = list(string)
  description = "value"
  default     = []
}



variable "pipe_log_level" {
  type        = string
  description = "Log level for the EventBridge Pipe."
  default     = "ERROR"

  validation {
    condition     = contains(["OFF", "ERROR", "INFO", "TRACE"], var.pipe_log_level)
    error_message = "pipe_log_level must be one of: OFF, ERROR, INFO, TRACE."
  }
}

variable "pipe_sqs_input_batch_size" {
  type    = number
  default = 1
}

variable "pipe_sqs_max_batch_window" {
  type    = number
  default = 2
}

variable "sqs_inbound_event_visibility_timeout_seconds" {
  type    = number
  default = 60
}

variable "sqs_inbound_event_max_receive_count" {
  type    = number
  default = 3
}

variable "enable_event_anomaly_detection" {
  type        = bool
  description = "Enable CloudWatch anomaly detection alarm for inbound event queue message reception"
  default     = true
}

variable "event_anomaly_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for the anomaly alarm. Each period is defined by event_anomaly_period."
  default     = 2
}

variable "event_anomaly_period" {
  type        = number
  description = "The period in seconds over which the specified statistic is applied for anomaly detection. Minimum 300 seconds (5 minutes). Recommended: 300-600."
  default     = 300
}

variable "event_anomaly_band_width" {
  type        = number
  description = "The width of the anomaly detection band. Higher values (e.g. 4-6) reduce sensitivity and noise, lower values (e.g. 2-3) increase sensitivity. Recommended: 2-4."
  default     = 3

  validation {
    condition     = var.event_anomaly_band_width >= 2 && var.event_anomaly_band_width <= 10
    error_message = "Band width must be between 2 and 10"
  }
}

variable "deploy_mock_clients" {
  type        = bool
  description = "Flag to deploy mock webhook lambda for integration testing (test/dev environments only)"
  default     = false
}

variable "client_config_bucket_force_destroy" {
  type        = bool
  description = "Force-delete all objects and versions from the client config bucket during destroy"
  default     = false
}

variable "message_root_uri" {
  type        = string
  description = "The root URI used for constructing message links in callback payloads"
}

variable "applications_map_parameter_name" {
  type        = string
  default     = null
  description = "SSM Parameter Store path for the clientId-to-applicationData map, where applicationData is currently only the applicationId"
}
