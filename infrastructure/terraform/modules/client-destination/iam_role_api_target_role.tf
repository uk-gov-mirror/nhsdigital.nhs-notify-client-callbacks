resource "aws_iam_role" "api_target_role" {
  name               = "${local.csi}-api-target-target-role"
  description        = "Role for client target rule"
  assume_role_policy = data.aws_iam_policy_document.api_target_role_assume_role_policy.json
}

data "aws_iam_policy_document" "api_target_role_assume_role_policy" {
  statement {
    actions = [
      "sts:AssumeRole"
    ]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "api_target_role" {
  role       = aws_iam_role.api_target_role.id
  policy_arn = aws_iam_policy.api_target_role.arn
}

resource "aws_iam_policy" "api_target_role" {
  name        = "${local.csi}-api-target-role-policy"
  description = "IAM Policy for the client target role"
  path        = "/"
  policy      = data.aws_iam_policy_document.api_target_role.json
}

data "aws_iam_policy_document" "api_target_role" {
  dynamic "statement" {
    for_each = length(aws_cloudwatch_event_api_destination.per_target) > 0 ? [1] : []
    content {
      sid    = "AllowAPIDestinationAccess"
      effect = "Allow"

      actions = [
        "events:InvokeApiDestination",
      ]

      resources = [
        for destination in aws_cloudwatch_event_api_destination.per_target :
        destination.arn
      ]
    }
  }

  dynamic "statement" {
    for_each = length(module.target_dlq) > 0 ? [1] : []
    content {
      sid    = "AllowSQSSendMessageForDLQ"
      effect = "Allow"

      actions = [
        "sqs:SendMessage",
      ]

      resources = [
        for dlq in module.target_dlq :
        dlq.sqs_queue_arn
      ]
    }
  }

  statement {
    sid    = "AllowKMSForDLQ"
    effect = "Allow"

    actions = [
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Encrypt",
      "kms:DescribeKey",
      "kms:Decrypt"
    ]

    resources = [
      var.kms_key_arn,
    ]
  }
}
