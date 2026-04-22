resource "aws_security_group" "mock_webhook_alb" {
  count       = var.deploy_mock_clients ? 1 : 0
  name        = "${local.csi}-mock-webhook-alb"
  description = "Security group for mock webhook ALB mTLS endpoint"
  vpc_id      = local.acct.vpc_ids[local.bc_name]

  tags = merge(
    local.default_tags,
    {
      Name = "${local.csi}-mock-webhook-alb"
    },
  )
}

resource "aws_vpc_security_group_ingress_rule" "mock_webhook_alb_https" {
  count                        = var.deploy_mock_clients ? 1 : 0
  security_group_id            = aws_security_group.mock_webhook_alb[0].id
  referenced_security_group_id = aws_security_group.https_client_lambda.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS Client Lambda to reach mock webhook (mTLS and non-mTLS)"
  tags                         = local.default_tags
}

resource "aws_vpc_security_group_egress_rule" "mock_webhook_alb_egress" {
  count             = var.deploy_mock_clients ? 1 : 0
  security_group_id = aws_security_group.mock_webhook_alb[0].id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  tags              = local.default_tags
}

resource "aws_acm_certificate" "mock_webhook_server" {
  count             = var.deploy_mock_clients ? 1 : 0
  certificate_body  = tls_locally_signed_cert.mock_server[0].cert_pem
  private_key       = tls_private_key.mock_server[0].private_key_pem
  certificate_chain = tls_self_signed_cert.test_ca[0].cert_pem
  tags              = local.default_tags
}

resource "aws_lb" "mock_webhook_mtls" {
  count              = var.deploy_mock_clients ? 1 : 0
  name               = substr("${local.csi}-mock-mtls", 0, 32)
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.mock_webhook_alb[0].id]
  subnets            = try(local.acct.private_subnets[local.bc_name], [])
  tags               = local.default_tags
}

resource "aws_lb_target_group" "mock_webhook_mtls" {
  count       = var.deploy_mock_clients ? 1 : 0
  name        = substr("${local.csi}-mock-mtls", 0, 32)
  target_type = "lambda"
  tags        = local.default_tags
}

resource "aws_lambda_permission" "mock_webhook_mtls_alb" {
  count         = var.deploy_mock_clients ? 1 : 0
  statement_id  = "AllowMtlsAlb"
  action        = "lambda:InvokeFunction"
  function_name = module.mock_webhook_lambda[0].function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.mock_webhook_mtls[0].arn
}

resource "aws_lb_target_group_attachment" "mock_webhook_mtls" {
  count            = var.deploy_mock_clients ? 1 : 0
  target_group_arn = aws_lb_target_group.mock_webhook_mtls[0].arn
  target_id        = module.mock_webhook_lambda[0].function_arn
  depends_on       = [aws_lambda_permission.mock_webhook_mtls_alb]
}

resource "aws_lb_listener" "mock_webhook_mtls" {
  count             = var.deploy_mock_clients ? 1 : 0
  load_balancer_arn = aws_lb.mock_webhook_mtls[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.mock_webhook_server[0].arn

  mutual_authentication {
    mode = "passthrough"
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mock_webhook_mtls[0].arn
  }

  tags = local.default_tags
}
