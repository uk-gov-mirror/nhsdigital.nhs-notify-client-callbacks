module "client_transform_filter_lambda" {
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-lambda.zip"

  function_name = "client-transform-filter"
  description   = "Lambda function that transforms and filters events coming to through the eventpipe"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  group          = var.group

  log_retention_in_days = var.log_retention_in_days
  kms_key_arn           = module.kms.key_arn ## Requires shared kms module

  iam_policy_document = {
    body = data.aws_iam_policy_document.client_transform_filter_lambda.json
  }

  function_s3_bucket      = local.acct.s3_buckets["lambda_function_artefacts"]["id"]
  function_code_base_path = local.aws_lambda_functions_dir_path
  function_code_dir       = "client-transform-filter-lambda/dist"
  function_include_common = true
  handler_function_name   = "handler"
  runtime                 = "nodejs22.x"
  memory                  = 128
  timeout                 = 5
  log_level               = var.log_level

  force_lambda_code_deploy = var.force_lambda_code_deploy
  enable_lambda_insights   = false

  log_destination_arn       = local.log_destination_arn
  log_subscription_role_arn = local.acct.log_subscription_role_arn

  lambda_env_vars = {
    ENVIRONMENT                           = var.environment
    METRICS_NAMESPACE                     = "nhs-notify-client-callbacks"
    DEBUG_BUCKET_NAME                     = var.enable_debug_log_bucket ? module.debug_log_bucket[0].id : ""
    CLIENT_SUBSCRIPTION_CONFIG_BUCKET     = module.client_config_bucket.id
    CLIENT_SUBSCRIPTION_CONFIG_PREFIX     = "client_subscriptions/"
    CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS = "60"
    MESSAGE_ROOT_URI                      = var.message_root_uri
    APPLICATIONS_MAP_PARAMETER            = local.applications_map_parameter_name
  }
}

data "aws_iam_policy_document" "client_transform_filter_lambda" {
  statement {
    sid    = "KMSPermissions"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [
      module.kms.key_arn, ## Requires shared kms module
    ]
  }

  statement {
    sid    = "S3ClientConfigListAccess"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
    ]

    resources = [
      module.client_config_bucket.arn,
    ]
  }

  statement {
    sid    = "S3ClientConfigReadAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "${module.client_config_bucket.arn}/*",
    ]
  }

  statement {
    sid    = "SSMApplicationsMapRead"
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
    ]

    resources = [
      "arn:aws:ssm:${var.region}:${var.aws_account_id}:parameter${local.applications_map_parameter_name}",
    ]
  }

  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"

    actions = [
      "cloudwatch:PutMetricData",
    ]

    resources = [
      "*",
    ]
  }

  dynamic "statement" {
    for_each = var.enable_debug_log_bucket ? toset(["enabled"]) : toset([])

    content {
      sid    = "DebugLogBucketWrite"
      effect = "Allow"

      actions = [
        "s3:PutObject",
      ]

      resources = [
        "${module.debug_log_bucket[0].arn}/*",
      ]
    }
  }
}
