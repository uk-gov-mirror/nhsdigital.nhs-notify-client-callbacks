output "mock_webhook_alb_dns" {
  description = "DNS name of the mock webhook ALB"
  value       = var.deploy_mock_clients ? aws_lb.mock_webhook_mtls[0].dns_name : null
}

output "applications_map_s3" {
  description = "S3 location of the client-to-application map"
  value = {
    bucket = var.applications_map_s3_bucket
    key    = local.applications_map_s3_key
  }
}
