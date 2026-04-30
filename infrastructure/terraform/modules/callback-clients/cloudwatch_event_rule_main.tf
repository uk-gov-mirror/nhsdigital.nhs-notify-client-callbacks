resource "aws_cloudwatch_event_rule" "main" {
  name           = "${local.csi}-callback-rule"
  event_bus_name = var.client_bus_name

  event_pattern = jsonencode({
    source = [{ prefix = "" }] # Your event pattern here this is effectively "*"
  })
}

# resource "aws_cloudwatch_event_target" "main" {
#   rule           = aws_cloudwatch_event_rule.main.name
#   event_bus_name = var.client_bus_name
#   target_id      = "callback-target"
#   arn            = # Your target ARN (Lambda, SNS, etc.)
#   # Additional target configuration...
# }
