locals {
  csi = replace(
    format(
      "%s-%s-%s",
      var.project,
      var.environment,
      var.component,
    ),
    "_",
    "",
  )

  client_prefix = "${local.csi}-${var.client_id}"

  default_tags = {
    Project     = var.project
    Environment = var.environment
    Component   = var.component
    Client      = var.client_id
  }
}
