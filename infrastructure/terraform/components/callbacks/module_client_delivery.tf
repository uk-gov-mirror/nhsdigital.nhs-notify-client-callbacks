module "client_delivery" {
  source   = "../../modules/client-delivery"
  for_each = local.config_clients

  project        = var.project
  aws_account_id = var.aws_account_id
  region         = var.region
  component      = var.component
  environment    = var.environment
  group          = var.group

  client_id       = each.key
  client_bus_name = aws_cloudwatch_event_bus.main.name
  kms_key_arn     = module.kms.key_arn

  subscriptions        = local.client_subscriptions[each.key]
  subscription_targets = local.client_subscription_targets[each.key]

  client_config_bucket     = module.client_config_bucket.bucket
  client_config_bucket_arn = module.client_config_bucket.arn

  applications_map_parameter_name = local.applications_map_parameter_name

  lambda_s3_bucket      = local.acct.s3_buckets["lambda_function_artefacts"]["id"]
  lambda_code_base_path = local.aws_lambda_functions_dir_path

  force_lambda_code_deploy = var.force_lambda_code_deploy
  log_level                = var.log_level
  log_retention_in_days    = var.log_retention_in_days
  enable_xray_tracing      = var.enable_xray_tracing

  log_destination_arn       = local.log_destination_arn
  log_subscription_role_arn = local.acct.log_subscription_role_arn

  elasticache_endpoint     = aws_elasticache_serverless_cache.delivery_state.endpoint[0].address
  elasticache_cache_name   = aws_elasticache_serverless_cache.delivery_state.name
  elasticache_iam_username = "${var.project}-${var.environment}-${var.component}-elasticache-user"

  mtls_cert_s3_bucket = local.mtls_cert_s3_bucket
  mtls_cert_s3_key    = local.mtls_cert_s3_key # gitleaks:allow
  mtls_ca_s3_key      = local.mtls_ca_s3_key   # gitleaks:allow

  token_bucket_burst_capacity = var.token_bucket_burst_capacity
  cb_cooldown_period_ms       = var.cb_cooldown_period_ms
  cb_recovery_period_ms       = var.cb_recovery_period_ms

  vpc_subnet_ids           = try(local.acct.private_subnets[local.bc_name], [])
  lambda_security_group_id = aws_security_group.https_client_lambda.id
}
