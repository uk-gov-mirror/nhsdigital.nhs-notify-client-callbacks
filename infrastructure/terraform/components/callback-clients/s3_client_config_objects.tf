resource "aws_s3_object" "mock_client_config" {
  for_each = var.deploy_mock_clients ? local.enriched_mock_config_clients : {}

  bucket       = var.client_config_s3_bucket
  key          = "${var.environment}/client_subscriptions/${each.key}.json"
  content      = jsonencode(each.value)
  content_type = "application/json"
  kms_key_id   = local.callbacks.kms_key_arn
}
