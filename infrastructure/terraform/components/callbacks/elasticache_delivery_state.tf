resource "random_password" "elasticache_default_user" {
  length  = 32
  special = false
}

resource "aws_elasticache_user" "delivery_state_default" {
  user_id       = "${local.csi}-valkey-default"
  user_name     = "default"
  engine        = "valkey"
  access_string = "off -@all"

  authentication_mode {
    type      = "password"
    passwords = [random_password.elasticache_default_user.result]
  }

  tags = local.default_tags
}

resource "aws_elasticache_user" "delivery_state_iam" {
  user_id       = "${local.csi}-elasticache-user"
  user_name     = "${local.csi}-elasticache-user"
  engine        = "valkey"
  access_string = "on ~* &* +@all"

  authentication_mode {
    type = "iam"
  }

  tags = local.default_tags
}

resource "aws_elasticache_user_group" "delivery_state" {
  engine        = "valkey"
  user_group_id = "${local.csi}-delivery-state"

  user_ids = [
    aws_elasticache_user.delivery_state_default.user_id,
    aws_elasticache_user.delivery_state_iam.user_id,
  ]

  tags = local.default_tags
}

resource "aws_elasticache_serverless_cache" "delivery_state" {
  name                 = "${local.csi}-delivery-state"
  engine               = "valkey"
  major_engine_version = "8"
  description          = "Per-target rate limiting and circuit breaker state for callback delivery"

  snapshot_retention_limit = 0

  user_group_id = aws_elasticache_user_group.delivery_state.user_group_id

  security_group_ids = [aws_security_group.elasticache_delivery_state.id]
  subnet_ids         = try(local.acct.private_subnets[local.bc_name], [])

  kms_key_id = module.kms.key_arn

  cache_usage_limits {
    data_storage {
      maximum = var.elasticache_data_storage_maximum_gb
      unit    = "GB"
    }

    ecpu_per_second {
      maximum = 1000
    }
  }

  tags = merge(
    local.default_tags,
    {
      Name        = "${local.csi}-delivery-state"
      Description = "Callback delivery rate limiter and circuit breaker state"
    },
  )
}

resource "aws_security_group" "elasticache_delivery_state" {
  name        = "${local.csi}-elasticache-delivery-state"
  description = "Security group for ElastiCache delivery state cluster"
  vpc_id      = local.acct.vpc_ids[local.bc_name]

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-elasticache-delivery-state"
    },
  )
}

resource "aws_vpc_security_group_ingress_rule" "elasticache_from_lambda" {
  security_group_id            = aws_security_group.elasticache_delivery_state.id
  referenced_security_group_id = aws_security_group.https_client_lambda.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS Client Lambda to connect to ElastiCache"

  tags = local.default_tags
}

resource "aws_security_group" "https_client_lambda" {
  name        = "${local.csi}-https-client-lambda"
  description = "Security group for per-client HTTPS Client Lambda functions"
  vpc_id      = local.acct.vpc_ids[local.bc_name]

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-https-client-lambda"
    },
  )
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_elasticache" {
  security_group_id            = aws_security_group.https_client_lambda.id
  referenced_security_group_id = aws_security_group.elasticache_delivery_state.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Allow Lambda to connect to ElastiCache"

  tags = local.default_tags
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_https" {
  security_group_id = aws_security_group.https_client_lambda.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 0
  to_port           = 65535
  ip_protocol       = "tcp"
  description       = "Allow Lambda outbound TCP for HTTPS webhook delivery (port defined per-client in webhook URL)"

  tags = local.default_tags
}

resource "aws_cloudwatch_metric_alarm" "elasticache_storage_utilisation" {
  alarm_name = "${local.csi}-elasticache-storage-utilisation"
  alarm_description = join(" ", [
    "CAPACITY: ElastiCache data storage utilisation exceeds 80%.",
    "Review stored data or increase elasticache_data_storage_maximum_gb.",
  ])

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.elasticache_data_storage_maximum_gb * 0.8
  actions_enabled     = true
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "storage_used"
    return_data = false

    metric {
      metric_name = "BytesUsedForCache"
      namespace   = "AWS/ElastiCache"
      period      = 300
      stat        = "Maximum"

      dimensions = {
        CacheClusterId = aws_elasticache_serverless_cache.delivery_state.name
      }
    }
  }

  metric_query {
    id          = "storage_used_gb"
    expression  = "storage_used / 1073741824"
    label       = "Storage Used (GB)"
    return_data = true
  }

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-elasticache-storage-utilisation"
    },
  )
}

resource "aws_cloudwatch_metric_alarm" "elasticache_ecpu_utilisation" {
  alarm_name = "${local.csi}-elasticache-ecpu-utilisation"
  alarm_description = join(" ", [
    "PERFORMANCE: ElastiCache processing units utilisation is high.",
    "Consider scaling up or optimising Redis commands.",
  ])

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ElastiCacheProcessingUnits"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  actions_enabled     = true
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_serverless_cache.delivery_state.name
  }

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-elasticache-ecpu-utilisation"
    },
  )
}

resource "aws_cloudwatch_metric_alarm" "elasticache_connections" {
  alarm_name = "${local.csi}-elasticache-connections"
  alarm_description = join(" ", [
    "RELIABILITY: ElastiCache connection count is high.",
    "Review per-client Lambda connection pool sizing.",
  ])

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Maximum"
  threshold           = 500
  actions_enabled     = true
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_serverless_cache.delivery_state.name
  }

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-elasticache-connections"
    },
  )
}

resource "aws_cloudwatch_metric_alarm" "elasticache_throttled_ops" {
  alarm_name = "${local.csi}-elasticache-throttled-ops"
  alarm_description = join(" ", [
    "PERFORMANCE: ElastiCache throttled operations detected.",
    "Increase ECPU limit or reduce request rate.",
  ])

  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ThrottledCmds"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  actions_enabled     = true
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_serverless_cache.delivery_state.name
  }

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-elasticache-throttled-ops"
    },
  )
}
