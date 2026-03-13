<!-- BEGIN_TF_DOCS -->
<!-- markdownlint-disable -->
<!-- vale off -->

## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10.1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | 6.13 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_applications_map_parameter_name"></a> [applications\_map\_parameter\_name](#input\_applications\_map\_parameter\_name) | SSM Parameter Store path for the clientId-to-applicationId map used for payload signing | `string` | n/a | yes |
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | The AWS Account ID (numeric) | `string` | n/a | yes |
| <a name="input_clients"></a> [clients](#input\_clients) | n/a | <pre>list(object({<br/>    connection_name                  = string<br/>    destination_name                 = string<br/>    invocation_endpoint              = string<br/>    invocation_rate_limit_per_second = optional(number, 10)<br/>    http_method                      = optional(string, "POST")<br/>    header_name                      = optional(string, "x-api-key")<br/>    header_value                     = string<br/>    client_detail                    = list(string)<br/>  }))</pre> | `[]` | no |
| <a name="input_component"></a> [component](#input\_component) | The variable encapsulating the name of this component | `string` | `"callbacks"` | no |
| <a name="input_default_tags"></a> [default\_tags](#input\_default\_tags) | A map of default tags to apply to all taggable resources within the component | `map(string)` | `{}` | no |
| <a name="input_deploy_mock_webhook"></a> [deploy\_mock\_webhook](#input\_deploy\_mock\_webhook) | Flag to deploy mock webhook lambda for integration testing (test/dev environments only) | `bool` | `false` | no |
| <a name="input_enable_debug_log_bucket"></a> [enable\_debug\_log\_bucket](#input\_enable\_debug\_log\_bucket) | Enable the debug log S3 bucket used for integration testing | `bool` | `false` | no |
| <a name="input_enable_event_anomaly_detection"></a> [enable\_event\_anomaly\_detection](#input\_enable\_event\_anomaly\_detection) | Enable CloudWatch anomaly detection alarm for inbound event queue message reception | `bool` | `true` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The name of the tfscaffold environment | `string` | n/a | yes |
| <a name="input_event_anomaly_band_width"></a> [event\_anomaly\_band\_width](#input\_event\_anomaly\_band\_width) | The width of the anomaly detection band. Higher values (e.g. 4-6) reduce sensitivity and noise, lower values (e.g. 2-3) increase sensitivity. Recommended: 2-4. | `number` | `3` | no |
| <a name="input_event_anomaly_evaluation_periods"></a> [event\_anomaly\_evaluation\_periods](#input\_event\_anomaly\_evaluation\_periods) | Number of evaluation periods for the anomaly alarm. Each period is defined by event\_anomaly\_period. | `number` | `2` | no |
| <a name="input_event_anomaly_period"></a> [event\_anomaly\_period](#input\_event\_anomaly\_period) | The period in seconds over which the specified statistic is applied for anomaly detection. Minimum 300 seconds (5 minutes). Recommended: 300-600. | `number` | `300` | no |
| <a name="input_force_lambda_code_deploy"></a> [force\_lambda\_code\_deploy](#input\_force\_lambda\_code\_deploy) | If the lambda package in s3 has the same commit id tag as the terraform build branch, the lambda will not update automatically. Set to True if making changes to Lambda code from on the same commit for example during development | `bool` | `false` | no |
| <a name="input_group"></a> [group](#input\_group) | The group variables are being inherited from (often synonmous with account short-name) | `string` | n/a | yes |
| <a name="input_kms_deletion_window"></a> [kms\_deletion\_window](#input\_kms\_deletion\_window) | When a kms key is deleted, how long should it wait in the pending deletion state? | `string` | `"30"` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | The log level to be used in lambda functions within the component. Any log with a lower severity than the configured value will not be logged: https://docs.python.org/3/library/logging.html#levels | `string` | `"INFO"` | no |
| <a name="input_log_retention_in_days"></a> [log\_retention\_in\_days](#input\_log\_retention\_in\_days) | The retention period in days for the Cloudwatch Logs events to be retained, default of 0 is indefinite | `number` | `0` | no |
| <a name="input_message_root_uri"></a> [message\_root\_uri](#input\_message\_root\_uri) | The root URI used for constructing message links in callback payloads | `string` | n/a | yes |
| <a name="input_parent_acct_environment"></a> [parent\_acct\_environment](#input\_parent\_acct\_environment) | Name of the environment responsible for the acct resources used, affects things like DNS zone. Useful for named dev environments | `string` | `"main"` | no |
| <a name="input_pipe_event_patterns"></a> [pipe\_event\_patterns](#input\_pipe\_event\_patterns) | value | `list(string)` | `[]` | no |
| <a name="input_pipe_log_level"></a> [pipe\_log\_level](#input\_pipe\_log\_level) | Log level for the EventBridge Pipe. | `string` | `"ERROR"` | no |
| <a name="input_pipe_sqs_input_batch_size"></a> [pipe\_sqs\_input\_batch\_size](#input\_pipe\_sqs\_input\_batch\_size) | n/a | `number` | `1` | no |
| <a name="input_pipe_sqs_max_batch_window"></a> [pipe\_sqs\_max\_batch\_window](#input\_pipe\_sqs\_max\_batch\_window) | n/a | `number` | `2` | no |
| <a name="input_project"></a> [project](#input\_project) | The name of the tfscaffold project | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | The AWS Region | `string` | n/a | yes |
| <a name="input_sqs_inbound_event_max_receive_count"></a> [sqs\_inbound\_event\_max\_receive\_count](#input\_sqs\_inbound\_event\_max\_receive\_count) | n/a | `number` | `3` | no |
| <a name="input_sqs_inbound_event_visibility_timeout_seconds"></a> [sqs\_inbound\_event\_visibility\_timeout\_seconds](#input\_sqs\_inbound\_event\_visibility\_timeout\_seconds) | n/a | `number` | `60` | no |
## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_client_config_bucket"></a> [client\_config\_bucket](#module\_client\_config\_bucket) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-s3bucket.zip | n/a |
| <a name="module_client_destination"></a> [client\_destination](#module\_client\_destination) | ../../modules/client-destination | n/a |
| <a name="module_client_transform_filter_lambda"></a> [client\_transform\_filter\_lambda](#module\_client\_transform\_filter\_lambda) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-lambda.zip | n/a |
| <a name="module_debug_log_bucket"></a> [debug\_log\_bucket](#module\_debug\_log\_bucket) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-s3bucket.zip | n/a |
| <a name="module_kms"></a> [kms](#module\_kms) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-kms.zip | n/a |
| <a name="module_mock_webhook_lambda"></a> [mock\_webhook\_lambda](#module\_mock\_webhook\_lambda) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-lambda.zip | n/a |
| <a name="module_sqs_inbound_event"></a> [sqs\_inbound\_event](#module\_sqs\_inbound\_event) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.6/terraform-sqs.zip | n/a |
## Outputs

| Name | Description |
|------|-------------|
| <a name="output_debug_log_bucket_name"></a> [debug\_log\_bucket\_name](#output\_debug\_log\_bucket\_name) | S3 bucket name for debug logs (integration testing only) |
| <a name="output_deployment"></a> [deployment](#output\_deployment) | Deployment details used for post-deployment scripts |
| <a name="output_mock_webhook_lambda_log_group_name"></a> [mock\_webhook\_lambda\_log\_group\_name](#output\_mock\_webhook\_lambda\_log\_group\_name) | CloudWatch log group name for mock webhook lambda (for integration test queries) |
| <a name="output_mock_webhook_url"></a> [mock\_webhook\_url](#output\_mock\_webhook\_url) | URL endpoint for mock webhook (for TEST\_WEBHOOK\_URL environment variable) |
<!-- vale on -->
<!-- markdownlint-enable -->
<!-- END_TF_DOCS -->
