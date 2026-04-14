module "sqs_delivery" {
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.9/terraform-sqs.zip"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  name           = "${var.client_id}-delivery"

  sqs_kms_key_arn = var.kms_key_arn

  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  max_receive_count          = var.sqs_max_receive_count

  create_dlq = false

  sqs_policy_overload = data.aws_iam_policy_document.sqs_delivery.json
}

data "aws_iam_policy_document" "sqs_delivery" {
  statement {
    sid    = "AllowEventBridgeToSendMessage"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions = [
      "sqs:SendMessage",
    ]

    resources = [
      "arn:aws:sqs:${var.region}:${var.aws_account_id}:${local.csi}-${var.client_id}-delivery-queue",
    ]
  }
}
