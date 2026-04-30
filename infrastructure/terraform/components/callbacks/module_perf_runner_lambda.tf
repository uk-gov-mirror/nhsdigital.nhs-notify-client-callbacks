module "perf_runner_lambda" {
  count  = var.deploy_perf_runner ? 1 : 0
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-lambda.zip"

  function_name = "perf-runner"
  description   = "Lambda function that executes performance tests against the client callbacks pipeline from within AWS"

  aws_account_id = var.aws_account_id
  component      = local.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  group          = var.group

  log_retention_in_days = var.log_retention_in_days
  kms_key_arn           = module.kms.key_arn

  iam_policy_document = {
    body = data.aws_iam_policy_document.perf_runner_lambda[0].json
  }

  function_s3_bucket      = local.acct.s3_buckets["lambda_function_artefacts"]["id"]
  function_code_base_path = local.aws_lambda_functions_dir_path
  function_code_dir       = "perf-runner-lambda/dist"
  handler_function_name   = "handler"
  runtime                 = "nodejs22.x"
  memory                  = 512
  timeout                 = 900

  log_level                = var.log_level
  force_lambda_code_deploy = var.force_lambda_code_deploy
  enable_lambda_insights   = false
  enable_xray_tracing      = false

  log_destination_arn       = local.log_destination_arn
  log_subscription_role_arn = local.acct.log_subscription_role_arn

  lambda_env_vars = {
    ENVIRONMENT                = var.environment
    INBOUND_QUEUE_URL          = module.sqs_inbound_event.sqs_queue_url
    TRANSFORM_FILTER_LOG_GROUP = module.client_transform_filter_lambda.cloudwatch_log_group_name
    DELIVERY_LOG_GROUP_PREFIX  = "/aws/lambda/${var.project}-${var.environment}-cbc-https-client-"
    DELIVERY_QUEUE_URL_PREFIX  = "https://sqs.${var.region}.amazonaws.com/${var.aws_account_id}/${var.project}-${var.environment}-cbc-"
    MOCK_WEBHOOK_LOG_GROUP     = var.deploy_mock_clients ? "/aws/lambda/${var.project}-${var.environment}-cbc-mock-webhook" : ""
    ELASTICACHE_ENDPOINT       = aws_elasticache_serverless_cache.delivery_state.endpoint[0].address
    ELASTICACHE_CACHE_NAME     = aws_elasticache_serverless_cache.delivery_state.name
    ELASTICACHE_IAM_USERNAME   = "${var.project}-${var.environment}-${local.component}-elasticache-user"
  }

  vpc_config = {
    subnet_ids         = try(local.acct.private_subnets[local.bc_name], [])
    security_group_ids = [aws_security_group.https_client_lambda.id]
  }
}

data "aws_iam_policy_document" "perf_runner_lambda" {
  count = var.deploy_perf_runner ? 1 : 0

  statement {
    sid    = "KMSPermissions"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [
      module.kms.key_arn,
    ]
  }

  statement {
    sid    = "SQSSendMessage"
    effect = "Allow"

    actions = [
      "sqs:SendMessage",
      "sqs:SendMessageBatch",
    ]

    resources = [
      module.sqs_inbound_event.sqs_queue_arn,
    ]
  }

  statement {
    sid    = "SQSPurgeQueue"
    effect = "Allow"

    actions = [
      "sqs:PurgeQueue",
    ]

    resources = [
      module.sqs_inbound_event.sqs_queue_arn,
      "${module.sqs_inbound_event.sqs_queue_arn}-dlq",
      "arn:aws:sqs:${var.region}:${var.aws_account_id}:${local.csi}-*-delivery-queue",
      "arn:aws:sqs:${var.region}:${var.aws_account_id}:${local.csi}-*-delivery-dlq-queue",
    ]
  }

  statement {
    sid    = "CloudWatchLogsInsightsQuery"
    effect = "Allow"

    actions = [
      "logs:StartQuery",
      "logs:StopQuery",
    ]

    resources = concat(
      [
        "arn:aws:logs:${var.region}:${var.aws_account_id}:log-group:${module.client_transform_filter_lambda.cloudwatch_log_group_name}:*",
        "arn:aws:logs:${var.region}:${var.aws_account_id}:log-group:/aws/lambda/${local.csi}-https-client-*",
      ],
      var.deploy_mock_clients ? [
        "arn:aws:logs:${var.region}:${var.aws_account_id}:log-group:/aws/lambda/${var.project}-${var.environment}-cbc-mock-webhook:*",
      ] : [],
    )
  }

  statement {
    sid    = "CloudWatchLogsInsightsResults"
    effect = "Allow"

    actions = [
      "logs:GetQueryResults",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "ElastiCacheConnect"
    effect = "Allow"

    actions = [
      "elasticache:Connect",
    ]

    resources = [
      aws_elasticache_serverless_cache.delivery_state.arn,
      aws_elasticache_user.delivery_state_iam.arn,
    ]
  }

  statement {
    sid    = "VPCNetworkInterfacePermissions"
    effect = "Allow"

    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
    ]

    resources = [
      "*",
    ]
  }
}
