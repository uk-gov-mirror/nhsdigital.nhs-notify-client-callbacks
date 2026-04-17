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
    sid    = "SSMGetApplicationsMap"
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
    ]

    resources = [
      "arn:aws:ssm:${var.region}:${var.aws_account_id}:parameter${var.applications_map_parameter_name}",
    ]
  }

  statement {
    sid    = "S3ClientConfigReadAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "${var.client_config_bucket_arn}/client_subscriptions/*",
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
    for_each = var.mtls_cert_secret_arn != "" ? [1] : []
    content {
      sid    = "SecretsManagerMTLSCert"
      effect = "Allow"

      actions = [
        "secretsmanager:GetSecretValue",
      ]

      resources = [
        var.mtls_cert_secret_arn,
      ]
    }
  }

  dynamic "statement" {
    for_each = var.mtls_test_cert_s3_bucket != "" ? [1] : []
    content {
      sid    = "S3MTLSTestCertReadAccess"
      effect = "Allow"

      actions = [
        "s3:GetObject",
      ]

      resources = [
        "arn:aws:s3:::${var.mtls_test_cert_s3_bucket}/${var.mtls_test_cert_s3_key}",
        "arn:aws:s3:::${var.mtls_test_cert_s3_bucket}/${var.mtls_test_ca_s3_key}",
      ]
    }
  }
}
