resource "aws_s3_object" "mock_client_config" {
  for_each = var.deploy_mock_clients ? toset(keys(local.config_clients)) : toset([])

  bucket  = var.client_config_s3_bucket
  key     = "${var.environment}/client_subscriptions/${local.config_clients[each.key].clientId}.json"
  content = jsonencode(local.enriched_mock_config_clients[each.key])

  kms_key_id             = module.kms.key_arn
  server_side_encryption = "aws:kms"

  content_type = "application/json"
}
