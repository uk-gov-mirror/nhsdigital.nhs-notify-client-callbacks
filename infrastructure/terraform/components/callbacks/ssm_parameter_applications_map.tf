resource "aws_ssm_parameter" "applications_map" {
  count = var.deploy_mock_webhook ? 1 : 0

  name   = local.applications_map_parameter_name
  type   = "SecureString"
  key_id = module.kms.key_arn

  value = jsonencode({
    "mock-client" = "mock-application-id"
  })
}
