locals {
  aws_lambda_functions_dir_path = "../../../../lambdas"
  log_destination_arn           = "arn:aws:firehose:${var.region}:${var.aws_account_id}:deliverystream/nhs-main-obs-splunk-logs-firehose"
  root_domain_name              = "${var.environment}.${local.acct.route53_zone_names["client-callbacks"]}" # e.g. [main|dev|abxy0].smsnudge.[dev|nonprod|prod].nhsnotify.national.nhs.uk
  root_domain_id                = local.acct.route53_zone_ids["client-callbacks"]

  clients_by_name = {
    for client in var.clients :
    client.connection_name => client
  }

  # Automatic test client when mock webhook is deployed
  mock_client = var.deploy_mock_webhook ? {
    "mock-client" = {
      connection_name                  = "mock-client"
      destination_name                 = "test-destination"
      invocation_endpoint              = aws_lambda_function_url.mock_webhook[0].function_url
      invocation_rate_limit_per_second = 10
      http_method                      = "POST"
      header_name                      = "x-api-key"
      header_value                     = random_password.mock_webhook_api_key[0].result
      client_detail = [
        "uk.nhs.notify.message.status.PUBLISHED.v1",
        "uk.nhs.notify.channel.status.PUBLISHED.v1"
      ]
    }
  } : {}

  all_clients = merge(local.clients_by_name, local.mock_client)
}
