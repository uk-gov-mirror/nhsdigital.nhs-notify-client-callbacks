locals {
  bc_name                       = "client-callbacks"
  aws_lambda_functions_dir_path = "../../../../lambdas"
  log_destination_arn           = "arn:aws:firehose:${var.region}:${var.aws_account_id}:deliverystream/nhs-main-obs-splunk-logs-firehose"
  root_domain_name              = "${var.environment}.${local.acct.route53_zone_names["client-callbacks"]}" # e.g. [main|dev|abxy0].smsnudge.[dev|nonprod|prod].nhsnotify.national.nhs.uk
  root_domain_id                = local.acct.route53_zone_ids["client-callbacks"]

  clients_dir_path = "${path.module}/../../modules/clients"

  config_clients = merge([
    for filename in fileset(local.clients_dir_path, "*.json") : {
      (replace(filename, ".json", "")) = jsondecode(file("${local.clients_dir_path}/${filename}"))
    }
  ]...)

  # When deploying mock clients, replace sentinel placeholder values with the mock webhook URL and API key.
  # Only used for S3 object content — must not be used as a for_each source (contains apply-time values).
  enriched_mock_config_clients = var.deploy_mock_clients ? {
    for client_id, client in local.config_clients :
    client_id => merge(client, {
      targets = [
        for target in try(client.targets, []) :
        merge(target, {
          invocationEndpoint = try(target.delivery.mtls.enabled, false) ? "https://${aws_lb.mock_webhook_mtls[0].dns_name}/${target.targetId}" : "http://${aws_lb.mock_webhook_mtls[0].dns_name}/${target.targetId}"
          apiKey             = merge(target.apiKey, { headerValue = random_password.mock_webhook_api_key[0].result })
        })
      ]
    })
  } : local.config_clients


  client_subscriptions = {
    for client_id, data in local.config_clients :
    client_id => {
      for subscription in try(data.subscriptions, []) :
      subscription.subscriptionId => {
        subscription_id = subscription.subscriptionId
        target_ids      = try(subscription.targetIds, [])
      }
    }
  }

  client_subscription_targets = {
    for client_id, data in local.config_clients :
    client_id => merge([
      for subscription in try(data.subscriptions, []) : {
        for target_id in try(subscription.targetIds, []) :
        "${subscription.subscriptionId}-${target_id}" => {
          subscription_id = subscription.subscriptionId
          target_id       = target_id
        }
      }
    ]...)
  }

  applications_map_parameter_name = coalesce(var.applications_map_parameter_name, "/${var.project}/${var.environment}/${var.component}/applications-map")

  client_config_bucket_arn = "arn:aws:s3:::${var.project}-${var.aws_account_id}-${var.region}-${var.environment}-${var.component}-subscription-config"
}
