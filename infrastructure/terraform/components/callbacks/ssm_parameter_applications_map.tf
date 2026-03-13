resource "aws_ssm_parameter" "applications_map_ephemeral" {
  count = var.deploy_mock_webhook ? 1 : 0

  name   = local.applications_map_parameter_name
  type   = "SecureString"
  key_id = module.kms.key_arn

  value = jsonencode({
    "mock-client" = "mock-application-id"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "applications_map" {
  count = var.deploy_mock_webhook ? 0 : 1

  name   = local.applications_map_parameter_name
  type   = "SecureString"
  key_id = module.kms.key_arn

  value = jsonencode({})

  lifecycle {
    ignore_changes = [value]
  }
}
