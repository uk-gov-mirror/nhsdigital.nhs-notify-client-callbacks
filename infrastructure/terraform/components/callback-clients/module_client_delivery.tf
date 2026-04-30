module "client_delivery" {
  source   = "../../modules/client-delivery"
  for_each = local.config_clients

  project        = var.project
  aws_account_id = var.aws_account_id
  region         = var.region
  component      = local.component
  environment    = var.environment
  group          = var.group

  client_id       = each.key
  client_bus_name = local.callbacks.eventbus_name.name
  kms_key_arn     = local.callbacks.kms_key_arn

  subscriptions        = local.client_subscriptions[each.key]
  subscription_targets = local.client_subscription_targets[each.key]

  client_config_bucket     = var.client_config_s3_bucket
  client_config_bucket_arn = local.callbacks.client_config_bucket.arn
  client_config_key_prefix = "${var.environment}/client_subscriptions/"

  applications_map_s3_bucket = var.applications_map_s3_bucket
  applications_map_s3_key    = local.applications_map_s3_key

  lambda_s3_bucket      = local.callbacks.lambda_s3_bucket
  lambda_code_base_path = local.aws_lambda_functions_dir_path

  force_lambda_code_deploy = var.force_lambda_code_deploy
  log_level                = var.log_level
  log_retention_in_days    = var.log_retention_in_days
  enable_xray_tracing      = var.enable_xray_tracing

  log_destination_arn       = local.log_destination_arn
  log_subscription_role_arn = local.log_subscription_role_arn

  elasticache_endpoint     = local.callbacks.elasticache.endpoint
  elasticache_cache_name   = local.callbacks.elasticache.cache_name
  elasticache_iam_username = local.callbacks.elasticache.iam_username

  mtls_cert_s3_bucket = local.mtls_cert_s3_bucket
  mtls_cert_s3_key    = local.mtls_cert_s3_key # gitleaks:allow
  mtls_ca_s3_key      = local.mtls_ca_s3_key   # gitleaks:allow

  token_bucket_burst_capacity = var.token_bucket_burst_capacity

  vpc_subnet_ids           = local.callbacks.vpc_subnet_ids
  lambda_security_group_id = local.callbacks.security_group_id
}
