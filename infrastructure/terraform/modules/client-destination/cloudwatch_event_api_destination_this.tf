resource "aws_cloudwatch_event_api_destination" "per_target" {
  for_each = var.targets

  name                             = "${local.csi}-${each.key}"
  description                      = "API Destination for ${each.key}"
  invocation_endpoint              = each.value.invocation_endpoint
  http_method                      = each.value.http_method
  invocation_rate_limit_per_second = each.value.invocation_rate_limit_per_second
  connection_arn                   = aws_cloudwatch_event_connection.per_target[each.key].arn
}
