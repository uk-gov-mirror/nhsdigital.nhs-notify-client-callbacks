<!-- BEGIN_TF_DOCS -->
<!-- markdownlint-disable -->
<!-- vale off -->

## Requirements

No requirements.
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_applications_map_parameter_name"></a> [applications\_map\_parameter\_name](#input\_applications\_map\_parameter\_name) | SSM Parameter Store path for the clientId-to-applicationData map | `string` | n/a | yes |
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | Account ID | `string` | n/a | yes |
| <a name="input_client_bus_name"></a> [client\_bus\_name](#input\_client\_bus\_name) | EventBridge bus name for subscription rules | `string` | n/a | yes |
| <a name="input_client_config_bucket"></a> [client\_config\_bucket](#input\_client\_config\_bucket) | S3 bucket name containing client subscription configuration | `string` | n/a | yes |
| <a name="input_client_config_bucket_arn"></a> [client\_config\_bucket\_arn](#input\_client\_config\_bucket\_arn) | S3 bucket ARN containing client subscription configuration | `string` | n/a | yes |
| <a name="input_client_id"></a> [client\_id](#input\_client\_id) | Unique identifier for this client | `string` | n/a | yes |
| <a name="input_component"></a> [component](#input\_component) | Component name | `string` | n/a | yes |
| <a name="input_elasticache_cache_name"></a> [elasticache\_cache\_name](#input\_elasticache\_cache\_name) | ElastiCache cache name for SigV4 token presigning | `string` | `""` | no |
| <a name="input_elasticache_endpoint"></a> [elasticache\_endpoint](#input\_elasticache\_endpoint) | ElastiCache Serverless endpoint URL | `string` | `""` | no |
| <a name="input_elasticache_iam_username"></a> [elasticache\_iam\_username](#input\_elasticache\_iam\_username) | IAM username for ElastiCache authentication | `string` | `""` | no |
| <a name="input_enable_xray_tracing"></a> [enable\_xray\_tracing](#input\_enable\_xray\_tracing) | Enable AWS X-Ray active tracing for the Lambda function | `bool` | `false` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The name of the tfscaffold environment | `string` | n/a | yes |
| <a name="input_force_lambda_code_deploy"></a> [force\_lambda\_code\_deploy](#input\_force\_lambda\_code\_deploy) | Force Lambda code redeployment even when commit tag matches | `bool` | `false` | no |
| <a name="input_group"></a> [group](#input\_group) | The name of the tfscaffold group | `string` | `null` | no |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | KMS Key ARN for encryption at rest | `string` | n/a | yes |
| <a name="input_lambda_batch_size"></a> [lambda\_batch\_size](#input\_lambda\_batch\_size) | Number of SQS messages per Lambda invocation | `number` | `10` | no |
| <a name="input_lambda_batching_window_in_seconds"></a> [lambda\_batching\_window\_in\_seconds](#input\_lambda\_batching\_window\_in\_seconds) | Maximum time in seconds to wait for a full batch before invoking Lambda. Allows the delivery queue to fill to batch\_size, improving Lambda concurrency utilisation. | `number` | `1` | no |
| <a name="input_lambda_code_base_path"></a> [lambda\_code\_base\_path](#input\_lambda\_code\_base\_path) | Base path to Lambda source code directories | `string` | n/a | yes |
| <a name="input_lambda_memory"></a> [lambda\_memory](#input\_lambda\_memory) | Lambda memory allocation in MB | `number` | `256` | no |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket for Lambda function artefacts | `string` | n/a | yes |
| <a name="input_lambda_security_group_id"></a> [lambda\_security\_group\_id](#input\_lambda\_security\_group\_id) | Security group ID for the Lambda function | `string` | `""` | no |
| <a name="input_lambda_timeout"></a> [lambda\_timeout](#input\_lambda\_timeout) | Lambda timeout in seconds | `number` | `30` | no |
| <a name="input_log_destination_arn"></a> [log\_destination\_arn](#input\_log\_destination\_arn) | Firehose destination ARN for log forwarding | `string` | `""` | no |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Log level for the Lambda function | `string` | `"INFO"` | no |
| <a name="input_log_retention_in_days"></a> [log\_retention\_in\_days](#input\_log\_retention\_in\_days) | CloudWatch log retention period in days | `number` | `0` | no |
| <a name="input_log_subscription_role_arn"></a> [log\_subscription\_role\_arn](#input\_log\_subscription\_role\_arn) | IAM role ARN for CloudWatch log subscription | `string` | `""` | no |
| <a name="input_max_retry_duration_seconds"></a> [max\_retry\_duration\_seconds](#input\_max\_retry\_duration\_seconds) | Maximum retry window before messages are sent to DLQ | `number` | `7200` | no |
| <a name="input_mtls_cert_secret_arn"></a> [mtls\_cert\_secret\_arn](#input\_mtls\_cert\_secret\_arn) | Secrets Manager ARN for the mTLS client certificate | `string` | `""` | no |
| <a name="input_mtls_test_ca_s3_key"></a> [mtls\_test\_ca\_s3\_key](#input\_mtls\_test\_ca\_s3\_key) | S3 key for dev CA certificate PEM bundle used for server verification | `string` | `""` | no |
| <a name="input_mtls_test_cert_s3_bucket"></a> [mtls\_test\_cert\_s3\_bucket](#input\_mtls\_test\_cert\_s3\_bucket) | S3 bucket for dev mTLS test certificates | `string` | `""` | no |
| <a name="input_mtls_test_cert_s3_key"></a> [mtls\_test\_cert\_s3\_key](#input\_mtls\_test\_cert\_s3\_key) | S3 key for dev mTLS test certificate bundle | `string` | `""` | no |
| <a name="input_project"></a> [project](#input\_project) | The name of the tfscaffold project | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | AWS Region | `string` | n/a | yes |
| <a name="input_sqs_max_receive_count"></a> [sqs\_max\_receive\_count](#input\_sqs\_max\_receive\_count) | Safety-net maximum receive count before a message moves to DLQ. Supplements the time-based retry window for cases where the Lambda fails before reaching the window check. | `number` | `100` | no |
| <a name="input_sqs_visibility_timeout_seconds"></a> [sqs\_visibility\_timeout\_seconds](#input\_sqs\_visibility\_timeout\_seconds) | Visibility timeout for the per-client delivery queue | `number` | `60` | no |
| <a name="input_subscription_targets"></a> [subscription\_targets](#input\_subscription\_targets) | Flattened subscription-target fanout map keyed by subscription-target composite key | <pre>map(object({<br/>    subscription_id = string<br/>    target_id       = string<br/>  }))</pre> | n/a | yes |
| <a name="input_subscriptions"></a> [subscriptions](#input\_subscriptions) | Subscription definitions for this client, keyed by subscription\_id | <pre>map(object({<br/>    subscription_id = string<br/>    target_ids      = list(string)<br/>  }))</pre> | n/a | yes |
| <a name="input_vpc_subnet_ids"></a> [vpc\_subnet\_ids](#input\_vpc\_subnet\_ids) | VPC subnet IDs for Lambda execution | `list(string)` | `[]` | no |
## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_dlq_delivery"></a> [dlq\_delivery](#module\_dlq\_delivery) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-sqs.zip | n/a |
| <a name="module_https_client_lambda"></a> [https\_client\_lambda](#module\_https\_client\_lambda) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-lambda.zip | n/a |
| <a name="module_sqs_delivery"></a> [sqs\_delivery](#module\_sqs\_delivery) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.9/terraform-sqs.zip | n/a |
## Outputs

No outputs.
<!-- vale on -->
<!-- markdownlint-enable -->
<!-- END_TF_DOCS -->
