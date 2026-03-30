<!-- BEGIN_TF_DOCS -->
<!-- markdownlint-disable -->
<!-- vale off -->

## Requirements

No requirements.
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | Account ID | `string` | n/a | yes |
| <a name="input_client_bus_name"></a> [client\_bus\_name](#input\_client\_bus\_name) | EventBus name where you create the rule | `string` | n/a | yes |
| <a name="input_component"></a> [component](#input\_component) | Component name | `string` | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | The name of the tfscaffold environment | `string` | n/a | yes |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | KMS Key ARN | `string` | n/a | yes |
| <a name="input_project"></a> [project](#input\_project) | The name of the tfscaffold project | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | AWS Region | `string` | n/a | yes |
| <a name="input_subscription_targets"></a> [subscription\_targets](#input\_subscription\_targets) | Flattened subscription-target fanout map keyed by subscription-target composite key | <pre>map(object({<br/>    subscription_id = string<br/>    target_id       = string<br/>  }))</pre> | n/a | yes |
| <a name="input_subscriptions"></a> [subscriptions](#input\_subscriptions) | Flattened subscription definitions keyed by subscription\_id | <pre>map(object({<br/>    client_id       = string<br/>    subscription_id = string<br/>    target_ids      = list(string)<br/>  }))</pre> | n/a | yes |
| <a name="input_targets"></a> [targets](#input\_targets) | Flattened target definitions keyed by target\_id | <pre>map(object({<br/>    client_id                        = string<br/>    target_id                        = string<br/>    invocation_endpoint              = string<br/>    invocation_rate_limit_per_second = number<br/>    http_method                      = string<br/>    header_name                      = string<br/>    header_value                     = string<br/>  }))</pre> | n/a | yes |
## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_target_dlq"></a> [target\_dlq](#module\_target\_dlq) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-sqs.zip | n/a |
## Outputs

No outputs.
<!-- vale on -->
<!-- markdownlint-enable -->
<!-- END_TF_DOCS -->
