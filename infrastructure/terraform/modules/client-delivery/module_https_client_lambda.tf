module "https_client_lambda" {
  source = "https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-lambda.zip"

  function_name = "https-client-${var.client_id}"
  description   = "HTTPS delivery Lambda for client ${var.client_id}"

  aws_account_id = var.aws_account_id
  component      = var.component
  environment    = var.environment
  project        = var.project
  region         = var.region
  group          = var.group

  log_retention_in_days = var.log_retention_in_days
  kms_key_arn           = var.kms_key_arn

  iam_policy_document = {
    body = data.aws_iam_policy_document.https_client_lambda.json
  }

  function_s3_bucket      = var.lambda_s3_bucket
  function_code_base_path = var.lambda_code_base_path
  function_code_dir       = "https-client-lambda/dist"
  function_include_common = true
  handler_function_name   = "handler"
  runtime                 = "nodejs22.x"
  memory                  = var.lambda_memory
  timeout                 = var.lambda_timeout
  log_level               = var.log_level

  force_lambda_code_deploy = var.force_lambda_code_deploy
  enable_lambda_insights   = false
  enable_xray_tracing      = var.enable_xray_tracing

  log_destination_arn       = var.log_destination_arn
  log_subscription_role_arn = var.log_subscription_role_arn

  lambda_env_vars = {
    APPLICATIONS_MAP_PARAMETER            = var.applications_map_parameter_name
    CLIENT_ID                             = var.client_id
    CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS = "60"
    CLIENT_SUBSCRIPTION_CONFIG_BUCKET     = var.client_config_bucket
    CLIENT_SUBSCRIPTION_CONFIG_PREFIX     = "client_subscriptions/"
    DLQ_URL                               = module.dlq_delivery.sqs_queue_url
    ELASTICACHE_CACHE_NAME                = var.elasticache_cache_name
    ELASTICACHE_ENDPOINT                  = var.elasticache_endpoint
    ELASTICACHE_IAM_USERNAME              = var.elasticache_iam_username
    ENVIRONMENT                           = var.environment
    MAX_RETRY_DURATION_SECONDS            = tostring(var.max_retry_duration_seconds)
    METRICS_NAMESPACE                     = "nhs-notify-client-callbacks"
    MTLS_CERT_SECRET_ARN                  = var.mtls_cert_secret_arn
    MTLS_TEST_CA_S3_KEY                   = var.mtls_test_ca_s3_key # gitleaks:allow
    MTLS_TEST_CERT_S3_BUCKET              = var.mtls_test_cert_s3_bucket
    MTLS_TEST_CERT_S3_KEY                 = var.mtls_test_cert_s3_key # gitleaks:allow
    QUEUE_URL                             = module.sqs_delivery.sqs_queue_url
  }

  vpc_config = var.lambda_security_group_id != "" ? {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  } : null
}

resource "aws_lambda_event_source_mapping" "sqs_delivery" {
  event_source_arn = module.sqs_delivery.sqs_queue_arn
  function_name    = module.https_client_lambda.function_arn
  batch_size       = var.lambda_batch_size
  enabled          = true

  function_response_types = ["ReportBatchItemFailures"]
}
