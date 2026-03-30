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

variable "targets" {
  type = map(object({
    client_id                        = string
    target_id                        = string
    invocation_endpoint              = string
    invocation_rate_limit_per_second = number
    http_method                      = string
    header_name                      = string
    header_value                     = string
  }))

  description = "Flattened target definitions keyed by target_id"
}

variable "subscriptions" {
  type = map(object({
    client_id       = string
    subscription_id = string
    target_ids      = list(string)
  }))

  description = "Flattened subscription definitions keyed by subscription_id"
}

variable "subscription_targets" {
  type = map(object({
    subscription_id = string
    target_id       = string
  }))

  description = "Flattened subscription-target fanout map keyed by subscription-target composite key"
}

variable "client_bus_name" {
  type        = string
  description = "EventBus name where you create the rule"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN"
}
