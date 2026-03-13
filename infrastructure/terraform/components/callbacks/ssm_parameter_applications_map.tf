resource "aws_ssm_parameter" "applications_map" {
  name   = local.applications_map_parameter_name
  type   = "SecureString"
  key_id = module.kms.key_arn

  value = var.deploy_mock_webhook ? jsonencode({
    "mock-client" = "mock-application-id"
  }) : jsonencode({})

  lifecycle {
    ignore_changes = [value]
  }
}
