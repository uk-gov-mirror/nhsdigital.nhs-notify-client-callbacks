module "client_destination" {
  source = "../../modules/client-destination"

  project         = var.project
  aws_account_id  = var.aws_account_id
  region          = var.region
  component       = local.component
  environment     = var.environment
  client_bus_name = aws_cloudwatch_event_bus.main.name

  kms_key_arn = module.kms.key_arn

  targets              = local.config_targets
  subscriptions        = local.config_subscriptions
  subscription_targets = local.subscription_targets

}
