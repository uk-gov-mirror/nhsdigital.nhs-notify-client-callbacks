locals {
  bc_name                       = "client-callbacks"
  aws_lambda_functions_dir_path = "../../../../lambdas"
  log_destination_arn           = local.callbacks.log_destination_arn
  log_subscription_role_arn     = local.callbacks.log_subscription_role_arn

  clients_dir_path = "${path.module}/../../modules/clients"

  config_clients = merge([
    for filename in fileset(local.clients_dir_path, "*.json") : {
      (replace(filename, ".json", "")) = jsondecode(file("${local.clients_dir_path}/${filename}"))
    }
  ]...)

  mock_server_spki_hash = var.deploy_mock_clients ? data.external.mock_server_spki_hash[0].result.hash : ""

  enriched_mock_config_clients = var.deploy_mock_clients ? {
    for client_id, client in local.config_clients :
    client_id => merge(client, {
      targets = [
        for target in try(client.targets, []) :
        merge(target, {
          invocationEndpoint = "https://${aws_lb.mock_webhook_mtls[0].dns_name}/${target.targetId}"
          apiKey             = merge(target.apiKey, { headerValue = random_password.mock_webhook_api_key[0].result })
          delivery = merge(try(target.delivery, {}), {
            mtls = merge(try(target.delivery.mtls, {}), {
              certPinning = merge(try(target.delivery.mtls.certPinning, {}), try(target.delivery.mtls.certPinning.enabled, false) ? {
                spkiHash = local.mock_server_spki_hash
              } : {})
            })
          })
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

  applications_map_s3_key = "${var.environment}/applications-map.json"
}
