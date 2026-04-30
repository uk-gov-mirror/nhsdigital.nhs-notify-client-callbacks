<!-- BEGIN_TF_DOCS -->
<!-- markdownlint-disable -->
<!-- vale off -->

## Requirements

No requirements.
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | The AWS Account ID (numeric) | `string` | n/a | yes |
| <a name="input_client_bus_name"></a> [client\_bus\_name](#input\_client\_bus\_name) | The name of the event bus to create rules on | `string` | n/a | yes |
| <a name="input_client_id"></a> [client\_id](#input\_client\_id) | Unique identifier for the client | `string` | n/a | yes |
| <a name="input_component"></a> [component](#input\_component) | Component name | `string` | n/a | yes |
| <a name="input_environment"></a> [environment](#input\_environment) | The name of the tfscaffold environment | `string` | n/a | yes |
| <a name="input_force_lambda_code_deploy"></a> [force\_lambda\_code\_deploy](#input\_force\_lambda\_code\_deploy) | If the lambda package in s3 has the same commit id tag as the terraform build branch, the lambda will not update automatically. Set to True if making changes to Lambda code from on the same commit for example during development | `bool` | `false` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | KMS Key ARN | `string` | n/a | yes |
| <a name="input_log_retention_in_days"></a> [log\_retention\_in\_days](#input\_log\_retention\_in\_days) | The retention period in days for the Cloudwatch Logs events to be retained, default of 0 is indefinite | `number` | `0` | no |
| <a name="input_project"></a> [project](#input\_project) | The name of the tfscaffold project | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | The AWS Region | `string` | n/a | yes |
## Modules

No modules.
## Outputs

| Name | Description |
|------|-------------|
| <a name="output_callback_rule_arn"></a> [callback\_rule\_arn](#output\_callback\_rule\_arn) | ARN of the callback event rule |
| <a name="output_callback_rule_name"></a> [callback\_rule\_name](#output\_callback\_rule\_name) | Name of the callback event rule |
<!-- vale on -->
<!-- markdownlint-enable -->
<!-- END_TF_DOCS -->
