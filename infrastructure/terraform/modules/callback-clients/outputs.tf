output "callback_rule_arn" {
  description = "ARN of the callback event rule"
  value       = aws_cloudwatch_event_rule.main.arn
}

output "callback_rule_name" {
  description = "Name of the callback event rule"
  value       = aws_cloudwatch_event_rule.main.name
}
