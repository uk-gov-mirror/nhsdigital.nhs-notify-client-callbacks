resource "random_password" "mock_application_id" {
  for_each = var.deploy_mock_clients ? toset(keys(local.config_clients)) : toset([])
  length   = 24
  special  = false
}

resource "aws_s3_object" "applications_map" {
  count        = var.deploy_mock_clients ? 1 : 0
  bucket       = local.applications_map_s3_bucket
  key          = local.applications_map_s3_key
  content      = jsonencode({ for client_id, client in local.config_clients : client_id => try(client.applicationId, client_id) })
  content_type = "application/json"
  kms_key_id   = module.kms.key_arn

  server_side_encryption = "aws:kms"
}
