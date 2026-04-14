resource "aws_cloudwatch_event_bus" "main" {
  name               = local.csi
  kms_key_identifier = module.kms.key_arn
}

resource "aws_cloudwatch_event_archive" "main" {
  name             = "${local.csi}-archive"
  event_source_arn = aws_cloudwatch_event_bus.main.arn
  retention_days   = 7
}
