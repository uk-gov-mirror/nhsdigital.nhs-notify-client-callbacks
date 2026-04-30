locals {
  bc_name                       = "client-callbacks"
  aws_lambda_functions_dir_path = "../../../../lambdas"
  log_destination_arn           = "arn:aws:firehose:${var.region}:${var.aws_account_id}:deliverystream/nhs-main-obs-splunk-logs-firehose"
  root_domain_name              = "${var.environment}.${local.acct.route53_zone_names["client-callbacks"]}" # e.g. [main|dev|abxy0].smsnudge.[dev|nonprod|prod].nhsnotify.national.nhs.uk
  root_domain_id                = local.acct.route53_zone_ids["client-callbacks"]
  client_config_bucket_arn      = "arn:aws:s3:::${var.client_config_s3_bucket}"
}
