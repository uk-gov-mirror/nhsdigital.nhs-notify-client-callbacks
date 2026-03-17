resource "aws_cloudwatch_metric_alarm" "client_dlq_depth" {
  for_each = toset(keys(local.all_clients))

  alarm_name = "${local.csi}-${each.key}-dlq-depth"
  alarm_description = join(" ", [
    "RELIABILITY: Messages are in DLQ for ${each.key}.",
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
    QueueName = "${local.csi}-${each.key}-dlq-queue"
  }

  tags = merge(
    local.default_tags,
    {
      Name   = "${local.csi}-${each.key}-dlq-depth"
      Client = each.key
    },
  )
}
