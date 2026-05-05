data "aws_iam_policy_document" "https_client_lambda" {
  statement {
    sid    = "KMSPermissions"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [
      var.kms_key_arn,
    ]
  }

  statement {
    sid    = "SQSDeliveryQueueConsume"
    effect = "Allow"

    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]

    resources = [
      module.sqs_delivery.sqs_queue_arn,
    ]
  }

  statement {
    sid    = "SQSDLQSend"
    effect = "Allow"

    actions = [
      "sqs:SendMessage",
    ]

    resources = [
      module.dlq_delivery.sqs_queue_arn,
    ]
  }

  statement {
    sid    = "S3ApplicationsMapReadAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "arn:aws:s3:::${var.applications_map_s3_bucket}/${var.applications_map_s3_key}",
    ]
  }

  statement {
    sid    = "S3ClientConfigReadAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "${var.client_config_bucket_arn}/${var.client_config_key_prefix}*",
    ]
  }

  statement {
    sid    = "S3ClientConfigListAccess"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
    ]

    resources = [
      var.client_config_bucket_arn,
    ]
  }

  dynamic "statement" {
    for_each = var.delivery_lambda_security_group_id != "" ? [1] : []
    content {
      sid    = "VPCNetworkInterfacePermissions"
      effect = "Allow"

      actions = [
        "ec2:CreateNetworkInterface",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
      ]

      resources = [
        "*",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.mtls_cert_s3_bucket != "" ? [1] : []
    content {
      sid    = "S3MTLSCertReadAccess"
      effect = "Allow"

      actions = [
        "s3:GetObject",
      ]

      resources = [
        "arn:aws:s3:::${var.mtls_cert_s3_bucket}/${var.mtls_cert_s3_key}",
        "arn:aws:s3:::${var.mtls_cert_s3_bucket}/${var.mtls_ca_s3_key}",
      ]
    }
  }

  dynamic "statement" {
    for_each = var.elasticache_endpoint != "" ? [1] : []
    content {
      sid    = "ElastiCacheConnect"
      effect = "Allow"

      actions = [
        "elasticache:Connect",
      ]

      resources = [
        "arn:aws:elasticache:${var.region}:${var.aws_account_id}:serverlesscache:${var.elasticache_cache_name}",
        "arn:aws:elasticache:${var.region}:${var.aws_account_id}:user:${var.elasticache_iam_username}",
      ]
    }
  }
}
