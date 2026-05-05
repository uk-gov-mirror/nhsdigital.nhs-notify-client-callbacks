locals {
  bc_name                       = "client-callbacks"
  component                     = "cb"
  client_csi                    = "${var.project}-${var.environment}-cbc"
  aws_lambda_functions_dir_path = "../../../../lambdas"
  log_destination_arn           = "arn:aws:firehose:${var.region}:${var.aws_account_id}:deliverystream/nhs-main-obs-splunk-logs-firehose"
  root_domain_name              = "${var.environment}.${local.acct.route53_zone_names[local.bc_name]}" # e.g. [main|dev|abxy0].smsnudge.[dev|nonprod|prod].nhsnotify.national.nhs.uk
  root_domain_id                = local.acct.route53_zone_ids[local.bc_name]

  clients_dir_path = "${path.module}/../../modules/clients"

  config_clients = merge([
    for filename in fileset(local.clients_dir_path, "*.json") : {
      (replace(filename, ".json", "")) = jsondecode(file("${local.clients_dir_path}/${filename}"))
    }
  ]...)

  # SPKI hash of the mock webhook server certificate for cert-pinning enrichment.
  # Computed via external data source because Terraform cannot SHA-256 hash raw binary (DER) data natively.
  mock_server_spki_hash = var.deploy_mock_clients ? data.external.mock_server_spki_hash[0].result.hash : ""

  # When deploying mock clients, replace sentinel placeholder values with the mock webhook URL and API key.
  # Only used for S3 object content — must not be used as a for_each source (contains apply-time values).
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

  client_config_bucket_arn = "arn:aws:s3:::${var.client_config_s3_bucket}"
}
