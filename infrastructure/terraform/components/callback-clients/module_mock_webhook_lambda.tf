module "mock_webhook_lambda" {
  count  = var.deploy_mock_clients ? 1 : 0
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-lambda.zip"

  function_name = "mock-webhook"
  description   = "Mock webhook endpoint for integration testing - logs received callbacks to CloudWatch"

  aws_account_id = var.aws_account_id
  component      = local.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  group          = var.group

  log_retention_in_days = var.log_retention_in_days
  kms_key_arn           = local.callbacks.kms_key_arn

  iam_policy_document = {
    body = data.aws_iam_policy_document.mock_webhook_lambda[0].json
  }

  function_s3_bucket      = local.callbacks.lambda_s3_bucket
  function_code_base_path = local.aws_lambda_functions_dir_path
  function_code_dir       = "mock-webhook-lambda/dist"
  function_include_common = true
  handler_function_name   = "handler"
  runtime                 = "nodejs22.x"
  memory                  = 256
  timeout                 = 10
  log_level               = var.log_level

  force_lambda_code_deploy = var.force_lambda_code_deploy
  enable_lambda_insights   = false

  log_destination_arn       = local.log_destination_arn
  log_subscription_role_arn = local.log_subscription_role_arn

  lambda_env_vars = {
    LOG_LEVEL = var.log_level
    API_KEY   = random_password.mock_webhook_api_key[0].result
  }
}

resource "random_password" "mock_webhook_api_key" {
  count   = var.deploy_mock_clients ? 1 : 0
  length  = 32
  special = false
}

data "aws_iam_policy_document" "mock_webhook_lambda" {
  count = var.deploy_mock_clients ? 1 : 0

  statement {
    sid    = "KMSPermissions"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [
      local.callbacks.kms_key_arn,
    ]
  }
}
