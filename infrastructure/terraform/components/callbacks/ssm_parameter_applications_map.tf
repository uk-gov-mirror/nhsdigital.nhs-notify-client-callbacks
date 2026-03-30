resource "random_password" "mock_application_id" {
  for_each = var.deploy_mock_clients ? toset(keys(local.config_clients)) : toset([])
  length   = 24
  special  = false
}

resource "aws_ssm_parameter" "applications_map" {
  name   = local.applications_map_parameter_name
  type   = "SecureString"
  key_id = module.kms.key_arn

  value = var.deploy_mock_clients ? jsonencode({
    for id in keys(local.config_clients) : local.config_clients[id].clientId => random_password.mock_application_id[id].result
  }) : jsonencode({})

  lifecycle {
    ignore_changes = [value]
  }
}
