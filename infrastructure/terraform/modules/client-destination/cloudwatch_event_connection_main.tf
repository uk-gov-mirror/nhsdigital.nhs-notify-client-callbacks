resource "aws_cloudwatch_event_connection" "per_target" {
  for_each = var.targets

  name               = "${local.csi}-${each.key}"
  description        = "Event Connection which would be used by API Destination ${each.key}"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = each.value.header_name
      value = each.value.header_value
    }
  }
}
