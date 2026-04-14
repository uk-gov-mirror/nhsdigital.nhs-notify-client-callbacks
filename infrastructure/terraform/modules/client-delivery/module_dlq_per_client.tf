module "dlq_delivery" {
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-sqs.zip"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  name           = "${var.client_id}-delivery-dlq"

  sqs_kms_key_arn = var.kms_key_arn

  create_dlq = false
}

resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  alarm_name = "${local.client_prefix}-dlq-depth"
  alarm_description = join(" ", [
    "RELIABILITY: Messages are in DLQ for client ${var.client_id}.",
    "Failed callback deliveries require operator attention.",
  ])

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  actions_enabled     = true
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = "${local.client_prefix}-delivery-dlq-queue"
  }

  tags = merge(
    local.default_tags,
    {
      Name = "${local.client_prefix}-dlq-depth"
    },
  )
}
