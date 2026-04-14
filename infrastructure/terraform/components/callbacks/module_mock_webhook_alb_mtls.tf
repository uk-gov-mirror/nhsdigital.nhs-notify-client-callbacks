resource "aws_security_group" "mock_webhook_alb" {
  count       = var.deploy_mock_clients ? 1 : 0
  name        = "${local.csi}-mock-webhook-alb"
  description = "Security group for mock webhook ALB mTLS endpoint"
  vpc_id      = local.acct.vpc_id

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
  description                  = "Allow HTTPS Client Lambda to reach mock webhook via mTLS"
  tags                         = local.default_tags
}

resource "aws_vpc_security_group_ingress_rule" "mock_webhook_alb_http" {
  count                        = var.deploy_mock_clients ? 1 : 0
  security_group_id            = aws_security_group.mock_webhook_alb[0].id
  referenced_security_group_id = aws_security_group.https_client_lambda.id
  from_port                    = 80
  to_port                      = 80
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS Client Lambda to reach mock webhook without mTLS"
  tags                         = local.default_tags
}

resource "aws_vpc_security_group_egress_rule" "mock_webhook_alb_egress" {
  count             = var.deploy_mock_clients ? 1 : 0
  security_group_id = aws_security_group.mock_webhook_alb[0].id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  tags              = local.default_tags
}

data "aws_s3_object" "mtls_mock_server_cert" {
  count  = var.deploy_mock_clients ? 1 : 0
  bucket = var.mtls_test_certs_s3_bucket
  key    = var.mtls_mock_server_cert_s3_key
}

data "aws_s3_object" "mtls_mock_server_key" {
  count  = var.deploy_mock_clients ? 1 : 0
  bucket = var.mtls_test_certs_s3_bucket
  key    = var.mtls_mock_server_key_s3_key
}

data "aws_s3_object" "mtls_ca_bundle" {
  count  = var.deploy_mock_clients ? 1 : 0
  bucket = var.mtls_test_certs_s3_bucket
  key    = var.mtls_test_ca_s3_key # gitleaks:allow
}

resource "aws_acm_certificate" "mock_webhook_server" {
  count             = var.deploy_mock_clients ? 1 : 0
  certificate_body  = data.aws_s3_object.mtls_mock_server_cert[0].body
  private_key       = data.aws_s3_object.mtls_mock_server_key[0].body
  certificate_chain = data.aws_s3_object.mtls_ca_bundle[0].body
  tags              = local.default_tags
}

resource "aws_lb" "mock_webhook_mtls" {
  count              = var.deploy_mock_clients ? 1 : 0
  name               = substr("${local.csi}-mock-mtls", 0, 32)
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.mock_webhook_alb[0].id]
  subnets            = local.acct.private_subnet_ids
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

resource "aws_lb_listener" "mock_webhook_http" {
  count             = var.deploy_mock_clients ? 1 : 0
  load_balancer_arn = aws_lb.mock_webhook_mtls[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mock_webhook_mtls[0].arn
  }

  tags = local.default_tags
}
