resource "aws_cloudwatch_event_rule" "per_subscription" {
  for_each = var.subscriptions

  name           = "${local.csi}-${each.key}"
  description    = "Client Callbacks event rule for subscription ${each.key}"
  event_bus_name = var.client_bus_name

  event_pattern = jsonencode({
    "detail" : {
      "subscriptions" : [each.value.subscription_id]
    }
  })
}

resource "aws_cloudwatch_event_target" "per_subscription_target" {
  for_each = var.subscription_targets

  rule           = aws_cloudwatch_event_rule.per_subscription[each.value.subscription_id].name
  arn            = aws_cloudwatch_event_api_destination.per_target[each.value.target_id].arn
  target_id      = "${local.csi}-${each.value.target_id}"
  role_arn       = aws_iam_role.api_target_role.arn
  event_bus_name = var.client_bus_name

  dead_letter_config {
    arn = module.target_dlq[each.value.target_id].sqs_queue_arn
  }

  input_transformer {
    input_paths = {
      data = "$.detail.payload.data"
    }

    input_template = "{\"data\": <data>}"
  }

  http_target {
    header_parameters = {
      "x-hmac-sha256-signature" = "$.detail.signatures.${replace(each.value.target_id, "-", "_")}"
    }
  }

  retry_policy {
    maximum_retry_attempts       = 3
    maximum_event_age_in_seconds = 3600
  }
}
