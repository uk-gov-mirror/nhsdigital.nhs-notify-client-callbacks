locals {
  csi = replace(
    format(
      "%s-%s-%s-%s",
      var.project,
      var.environment,
      var.component,
      var.client_id,
    ),
    "_",
    "",
  )
}
