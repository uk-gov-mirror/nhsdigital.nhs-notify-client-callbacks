module "debug_log_bucket" {
  count  = var.enable_debug_log_bucket ? 1 : 0
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-s3bucket.zip"

  name = "debug-log"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region

  default_tags = merge(
    local.default_tags,
    {
      Description = "Debug log storage for integration testing"
    }
  )

  kms_key_arn        = module.kms.key_arn
  force_destroy      = true
  versioning         = false
  object_ownership   = "BucketOwnerPreferred"
  bucket_key_enabled = true

  lifecycle_rules = [
    {
      enabled = true

      expiration = {
        days = 1
      }

      abort_incomplete_multipart_upload = {
        days = 1
      }
    }
  ]

  policy_documents = [
    data.aws_iam_policy_document.debug_log_bucket[0].json,
  ]
}

data "aws_iam_policy_document" "debug_log_bucket" {
  count = var.enable_debug_log_bucket ? 1 : 0

  statement {
    sid    = "AllowLambdaWriteAccess"
    effect = "Allow"

    principals {
      type = "AWS"
      identifiers = [
        module.mock_webhook_lambda[0].iam_role_arn,
        module.client_transform_filter_lambda.iam_role_arn,
      ]
    }

    actions = [
      "s3:PutObject",
    ]

    resources = [
      "${module.debug_log_bucket[0].arn}/*",
    ]
  }

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = [
      "s3:*",
    ]

    resources = [
      module.debug_log_bucket[0].arn,
      "${module.debug_log_bucket[0].arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
