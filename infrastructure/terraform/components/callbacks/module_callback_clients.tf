locals {
  clients = toset(["alpha", "beta", "gamma"])
}

module "callback_clients" {
  source = "../../modules/callback-clients"

  for_each = local.clients

  project         = var.project
  aws_account_id  = var.aws_account_id
  region          = var.region
  component       = local.component
  client_id       = each.key
  environment     = var.environment
  client_bus_name = aws_cloudwatch_event_bus.main.name

  kms_key_arn = module.kms.key_arn

  log_retention_in_days    = var.log_retention_in_days
  force_lambda_code_deploy = var.force_lambda_code_deploy
}
