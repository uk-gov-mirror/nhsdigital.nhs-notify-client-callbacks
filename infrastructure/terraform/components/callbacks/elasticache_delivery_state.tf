resource "aws_elasticache_serverless_cache" "delivery_state" {
  name                 = "${local.csi}-delivery-state"
  engine               = "valkey"
  major_engine_version = "8"
  description          = "Per-target rate limiting and circuit breaker state for callback delivery"

  snapshot_retention_limit = 0

  security_group_ids = [aws_security_group.elasticache_delivery_state.id]
  subnet_ids         = local.acct.private_subnet_ids

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
  vpc_id      = local.acct.vpc_id

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
  vpc_id      = local.acct.vpc_id

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
