locals {
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
          invocationEndpoint = "${aws_lambda_function_url.mock_webhook[0].function_url}${target.targetId}"
          apiKey             = merge(target.apiKey, { headerValue = random_password.mock_webhook_api_key[0].result })
        })
      ]
    })
  } : local.config_clients


  config_targets = merge([
    for client_id, data in local.config_clients : {
      for target in try(data.targets, []) : target.targetId => {
        client_id                        = client_id
        target_id                        = target.targetId
        invocation_endpoint              = var.deploy_mock_clients ? "${aws_lambda_function_url.mock_webhook[0].function_url}${target.targetId}" : target.invocationEndpoint
        invocation_rate_limit_per_second = target.invocationRateLimit
        http_method                      = target.invocationMethod
        header_name                      = target.apiKey.headerName
        header_value                     = var.deploy_mock_clients ? random_password.mock_webhook_api_key[0].result : target.apiKey.headerValue
      }
    }
  ]...)

  config_subscriptions = merge([
    for client_id, data in local.config_clients : {
      for subscription in try(data.subscriptions, []) : subscription.subscriptionId => {
        client_id       = client_id
        subscription_id = subscription.subscriptionId
        target_ids      = try(subscription.targetIds, [])
      }
    }
  ]...)

  subscription_targets = merge([
    for subscription_id, subscription in local.config_subscriptions : {
      for target_id in subscription.target_ids :
      "${subscription_id}-${target_id}" => {
        subscription_id = subscription_id
        target_id       = target_id
      }
    }
  ]...)

  applications_map_parameter_name = coalesce(var.applications_map_parameter_name, "/${var.project}/${var.environment}/${var.component}/applications-map")
}
