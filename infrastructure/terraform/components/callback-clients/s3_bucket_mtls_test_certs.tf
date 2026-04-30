locals {
  mtls_test_certs_s3_prefix = "callbacks/mtls-test"
  mtls_test_cert_s3_key     = "${local.mtls_test_certs_s3_prefix}/client-bundle.pem"
  mtls_test_ca_s3_key       = "${local.mtls_test_certs_s3_prefix}/ca.pem"
  mtls_cert_s3_bucket       = var.mtls_cert_s3_bucket
  mtls_cert_s3_key          = var.deploy_mock_clients ? local.mtls_test_cert_s3_key : var.mtls_cert_s3_key # gitleaks:allow
  mtls_ca_s3_key            = var.deploy_mock_clients ? local.mtls_test_ca_s3_key : var.mtls_ca_s3_key     # gitleaks:allow
}

# --- TLS provider: generate test CA, client, and server certificates ---

resource "tls_private_key" "test_ca" {
  count       = var.deploy_mock_clients ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_self_signed_cert" "test_ca" {
  count                 = var.deploy_mock_clients ? 1 : 0
  private_key_pem       = tls_private_key.test_ca[0].private_key_pem
  is_ca_certificate     = true
  validity_period_hours = 87600

  subject {
    common_name  = "NHS Notify Test CA"
    organization = "NHS Notify"
    country      = "GB"
  }

  allowed_uses = [
    "cert_signing",
  ]
}

resource "tls_private_key" "test_client" {
  count       = var.deploy_mock_clients ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "test_client" {
  count           = var.deploy_mock_clients ? 1 : 0
  private_key_pem = tls_private_key.test_client[0].private_key_pem

  subject {
    common_name  = "NHS Notify Callbacks Test Client"
    organization = "NHS Notify"
    country      = "GB"
  }
}

resource "tls_locally_signed_cert" "test_client" {
  count                 = var.deploy_mock_clients ? 1 : 0
  cert_request_pem      = tls_cert_request.test_client[0].cert_request_pem
  ca_private_key_pem    = tls_private_key.test_ca[0].private_key_pem
  ca_cert_pem           = tls_self_signed_cert.test_ca[0].cert_pem
  validity_period_hours = 87600

  allowed_uses = [
    "digital_signature",
    "client_auth",
  ]
}

resource "tls_private_key" "mock_server" {
  count       = var.deploy_mock_clients ? 1 : 0
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "mock_server" {
  count           = var.deploy_mock_clients ? 1 : 0
  private_key_pem = tls_private_key.mock_server[0].private_key_pem

  subject {
    common_name  = "NHS Notify Mock Webhook Server"
    organization = "NHS Notify"
    country      = "GB"
  }

  dns_names = ["*.eu-west-2.elb.amazonaws.com"]
}

resource "tls_locally_signed_cert" "mock_server" {
  count                 = var.deploy_mock_clients ? 1 : 0
  cert_request_pem      = tls_cert_request.mock_server[0].cert_request_pem
  ca_private_key_pem    = tls_private_key.test_ca[0].private_key_pem
  ca_cert_pem           = tls_self_signed_cert.test_ca[0].cert_pem
  validity_period_hours = 87600

  allowed_uses = [
    "digital_signature",
    "key_encipherment",
    "server_auth",
  ]
}

# --- S3 objects: Lambda reads certs from S3 at runtime ---

resource "aws_s3_object" "mtls_test_client_bundle" {
  count   = var.deploy_mock_clients ? 1 : 0
  bucket  = var.mtls_cert_s3_bucket
  key     = local.mtls_test_cert_s3_key # gitleaks:allow
  content = "${tls_locally_signed_cert.test_client[0].cert_pem}${tls_private_key.test_client[0].private_key_pem}"

  kms_key_id   = local.callbacks.kms_key_arn
  content_type = "application/x-pem-file"
}

resource "aws_s3_object" "mtls_test_ca" {
  count   = var.deploy_mock_clients ? 1 : 0
  bucket  = var.mtls_cert_s3_bucket
  key     = local.mtls_test_ca_s3_key # gitleaks:allow
  content = tls_self_signed_cert.test_ca[0].cert_pem

  kms_key_id   = local.callbacks.kms_key_arn
  content_type = "application/x-pem-file"
}

# Compute the base64-encoded SHA-256 hash of the mock server's SPKI (Subject Public Key Info) DER.
# Used by cert-pinning clients to verify the server certificate during mTLS handshake.
data "external" "mock_server_spki_hash" {
  count = var.deploy_mock_clients ? 1 : 0
  program = ["bash", "-c", <<-EOT
    HASH=$(jq -r '.pem' \
      | openssl pkey -pubin -outform DER 2>/dev/null \
      | openssl dgst -sha256 -binary \
      | base64 \
      | tr -d '\n')
    printf '{"hash":"%s"}' "$HASH"
  EOT
  ]

  query = {
    pem = tls_private_key.mock_server[0].public_key_pem
  }
}
