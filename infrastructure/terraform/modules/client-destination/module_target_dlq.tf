module "target_dlq" {
  source   = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-sqs.zip"
  for_each = var.targets

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  name           = "${each.key}-dlq"

  sqs_kms_key_arn = var.kms_key_arn

  visibility_timeout_seconds = 60

  create_dlq = false

  sqs_policy_overload = data.aws_iam_policy_document.target_dlq[each.key].json
}

data "aws_iam_policy_document" "target_dlq" {
  for_each = var.targets

  statement {
    sid    = "AllowEventBridgeToSendMessage"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions = [
      "sqs:SendMessage"
    ]

    resources = [
      "arn:aws:sqs:${var.region}:${var.aws_account_id}:${var.project}-${var.environment}-${var.component}-${each.key}-dlq-queue"
    ]
  }
}
