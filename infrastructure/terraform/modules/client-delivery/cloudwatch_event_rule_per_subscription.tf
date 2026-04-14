resource "aws_cloudwatch_event_rule" "per_subscription" {
  for_each = var.subscriptions

  name           = "${local.client_prefix}-${each.key}"
  description    = "Client Callbacks event rule for client ${var.client_id} subscription ${each.key}"
  event_bus_name = var.client_bus_name

  event_pattern = jsonencode({
    "detail" : {
      "subscriptions" : [each.value.subscription_id]
    }
  })

  tags = local.default_tags
}

resource "aws_cloudwatch_event_target" "per_subscription_target" {
  for_each = var.subscription_targets

  rule           = aws_cloudwatch_event_rule.per_subscription[each.value.subscription_id].name
  arn            = module.sqs_delivery.sqs_queue_arn
  target_id      = "${local.client_prefix}-${each.value.target_id}"
  event_bus_name = var.client_bus_name
  role_arn       = aws_iam_role.eventbridge_sqs_target.arn

  sqs_target {
    message_group_id = null
  }

  input_transformer {
    input_paths = {
      payload = "$.detail.payload"
    }

    input_template = "{\"payload\": <payload>, \"subscriptionId\": \"${each.value.subscription_id}\", \"targetId\": \"${each.value.target_id}\"}"
  }

  dead_letter_config {
    arn = module.dlq_delivery.sqs_queue_arn
  }

  retry_policy {
    maximum_retry_attempts       = 0
    maximum_event_age_in_seconds = 60
  }
}

resource "aws_iam_role" "eventbridge_sqs_target" {
  name               = "${local.client_prefix}-eb-sqs-role"
  description        = "Role for EventBridge to send messages to per-client SQS queue"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_sqs_assume.json

  tags = local.default_tags
}

data "aws_iam_policy_document" "eventbridge_sqs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "eventbridge_sqs_send" {
  name   = "sqs-send"
  role   = aws_iam_role.eventbridge_sqs_target.id
  policy = data.aws_iam_policy_document.eventbridge_sqs_send.json
}

data "aws_iam_policy_document" "eventbridge_sqs_send" {
  statement {
    sid    = "AllowSQSSendMessage"
    effect = "Allow"

    actions = [
      "sqs:SendMessage",
    ]

    resources = [
      module.sqs_delivery.sqs_queue_arn,
      module.dlq_delivery.sqs_queue_arn,
    ]
  }

  statement {
    sid    = "AllowKMSForSQS"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [
      var.kms_key_arn,
    ]
  }
}
