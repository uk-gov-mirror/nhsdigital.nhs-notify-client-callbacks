resource "aws_s3_object" "mock_client_config" {
  for_each = var.deploy_mock_clients ? toset(keys(local.config_clients)) : toset([])

  bucket  = module.client_config_bucket.id
  key     = "client_subscriptions/${local.config_clients[each.key].clientId}.json"
  content = jsonencode(local.enriched_mock_config_clients[each.key])

  kms_key_id             = module.kms.key_arn
  server_side_encryption = "aws:kms"

  content_type = "application/json"
}

module "client_config_bucket" {
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-s3bucket.zip"

  name = "subscription-config"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region

  default_tags = merge(
    local.default_tags,
    {
      Description = "Client subscription configuration storage"
    }
  )

  kms_key_arn        = module.kms.key_arn
  force_destroy      = var.s3_enable_force_destroy
  versioning         = true
  object_ownership   = "BucketOwnerPreferred"
  bucket_key_enabled = true

  policy_documents = [
    data.aws_iam_policy_document.client_config_bucket.json
  ]
}

data "aws_iam_policy_document" "client_config_bucket" {
  statement {
    sid    = "AllowLambdaListAccess"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [module.client_transform_filter_lambda.iam_role_arn]
    }

    actions = [
      "s3:ListBucket",
    ]

    resources = [
      module.client_config_bucket.arn,
    ]
  }

  statement {
    sid    = "AllowLambdaReadAccess"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [module.client_transform_filter_lambda.iam_role_arn]
    }

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "${module.client_config_bucket.arn}/*",
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
      module.client_config_bucket.arn,
      "${module.client_config_bucket.arn}/*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
