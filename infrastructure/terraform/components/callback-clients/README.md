<!-- BEGIN_TF_DOCS -->
<!-- markdownlint-disable -->
<!-- vale off -->

## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10.1 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | 6.13 |
| <a name="requirement_external"></a> [external](#requirement\_external) | ~> 2.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |
| <a name="requirement_tls"></a> [tls](#requirement\_tls) | ~> 4.0 |
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_applications_map_s3_bucket"></a> [applications\_map\_s3\_bucket](#input\_applications\_map\_s3\_bucket) | S3 bucket for the applications map | `string` | n/a | yes |
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | The AWS Account ID (numeric) | `string` | n/a | yes |
| <a name="input_client_config_s3_bucket"></a> [client\_config\_s3\_bucket](#input\_client\_config\_s3\_bucket) | S3 bucket for client subscription configuration | `string` | n/a | yes |
| <a name="input_default_tags"></a> [default\_tags](#input\_default\_tags) | A map of default tags to apply to all taggable resources within the component | `map(string)` | `{}` | no |
| <a name="input_deploy_mock_clients"></a> [deploy\_mock\_clients](#input\_deploy\_mock\_clients) | Flag to deploy mock webhook lambda for integration testing | `bool` | `false` | no |
| <a name="input_enable_xray_tracing"></a> [enable\_xray\_tracing](#input\_enable\_xray\_tracing) | Enable AWS X-Ray active tracing for Lambda functions | `bool` | `false` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The name of the tfscaffold environment | `string` | n/a | yes |
| <a name="input_force_lambda_code_deploy"></a> [force\_lambda\_code\_deploy](#input\_force\_lambda\_code\_deploy) | If the lambda package in s3 has the same commit id tag as the terraform build branch, the lambda will not update automatically. Set to True if making changes to Lambda code from on the same commit for example during development | `bool` | `false` | no |
| <a name="input_group"></a> [group](#input\_group) | The group variables are being inherited from (often synonmous with account short-name) | `string` | n/a | yes |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | The log level to be used in lambda functions within the component | `string` | `"INFO"` | no |
| <a name="input_log_retention_in_days"></a> [log\_retention\_in\_days](#input\_log\_retention\_in\_days) | The retention period in days for the Cloudwatch Logs events to be retained, default of 0 is indefinite | `number` | `0` | no |
| <a name="input_mtls_ca_s3_key"></a> [mtls\_ca\_s3\_key](#input\_mtls\_ca\_s3\_key) | S3 key for the CA certificate PEM bundle used for server verification | `string` | `""` | no |
| <a name="input_mtls_cert_s3_bucket"></a> [mtls\_cert\_s3\_bucket](#input\_mtls\_cert\_s3\_bucket) | S3 bucket containing the mTLS client certificate bundle | `string` | `""` | no |
| <a name="input_mtls_cert_s3_key"></a> [mtls\_cert\_s3\_key](#input\_mtls\_cert\_s3\_key) | S3 key for the mTLS client certificate PEM bundle | `string` | `""` | no |
| <a name="input_parent_acct_environment"></a> [parent\_acct\_environment](#input\_parent\_acct\_environment) | Name of the environment responsible for the acct resources used, affects things like DNS zone. Useful for named dev environments | `string` | `"main"` | no |
| <a name="input_parent_callbacks_environment"></a> [parent\_callbacks\_environment](#input\_parent\_callbacks\_environment) | The name of the environment which deployed the parent callbacks component. Used to identify the appropriate state file. | `string` | `"main"` | no |
| <a name="input_project"></a> [project](#input\_project) | The name of the tfscaffold project | `string` | n/a | yes |
| <a name="input_region"></a> [region](#input\_region) | The AWS Region | `string` | n/a | yes |
| <a name="input_s3_enable_force_destroy"></a> [s3\_enable\_force\_destroy](#input\_s3\_enable\_force\_destroy) | Whether to enable force destroy for the S3 buckets created in this module | `bool` | `false` | no |
| <a name="input_token_bucket_burst_capacity"></a> [token\_bucket\_burst\_capacity](#input\_token\_bucket\_burst\_capacity) | Token bucket burst capacity used by the rate limiter | `number` | `2250` | no |
## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_client_delivery"></a> [client\_delivery](#module\_client\_delivery) | ../../modules/client-delivery | n/a |
| <a name="module_mock_webhook_lambda"></a> [mock\_webhook\_lambda](#module\_mock\_webhook\_lambda) | https://github.com/NHSDigital/nhs-notify-shared-modules/releases/download/3.0.7/terraform-lambda.zip | n/a |
## Outputs

| Name | Description |
|------|-------------|
| <a name="output_applications_map_s3"></a> [applications\_map\_s3](#output\_applications\_map\_s3) | S3 location of the client-to-application map |
| <a name="output_mock_webhook_alb_dns"></a> [mock\_webhook\_alb\_dns](#output\_mock\_webhook\_alb\_dns) | DNS name of the mock webhook ALB |
<!-- vale on -->
<!-- markdownlint-enable -->
<!-- END_TF_DOCS -->
