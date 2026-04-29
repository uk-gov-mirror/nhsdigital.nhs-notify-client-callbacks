locals {
  callbacks = data.terraform_remote_state.callbacks.outputs
}

data "terraform_remote_state" "callbacks" {
  backend = "s3"

  config = {
    bucket = local.terraform_state_bucket

    key = format(
      "%s/%s/%s/%s/callbacks.tfstate",
      var.project,
      var.aws_account_id,
      "eu-west-2",
      var.parent_callbacks_environment
    )

    region = "eu-west-2"
  }
}
