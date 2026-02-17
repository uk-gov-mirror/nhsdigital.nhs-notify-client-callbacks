# Mock Webhook Lambda

**Purpose**: Test infrastructure lambda that simulates a client webhook endpoint for integration testing.

## Overview

This Lambda acts as a mock webhook receiver for testing the callback delivery pipeline. It:

1. Receives POST requests containing JSON:API formatted callbacks (MessageStatus or ChannelStatus)
2. Logs each received callback to CloudWatch in a structured, queryable format
3. Returns HTTP 200 OK to acknowledge receipt

## Usage in Tests

Integration tests can:

1. Configure this Lambda's URL as the webhook endpoint in client subscription configuration
2. Trigger callback events through the delivery pipeline
3. Query CloudWatch Logs to verify callbacks were received with correct payloads

## Log Format

Each callback is logged with the pattern:

`CALLBACK {messageId} {messageType} : {JSON payload}`

Example:

`CALLBACK msg-123-456 MessageStatus : {"type":"MessageStatus","id":"msg-123-456","attributes":{...}}`

This format enables tests to:

- Filter logs by message ID
- Parse payloads for validation
- Verify callback counts and content

## Deployment

This Lambda is deployed only in test/development environments as part of the integration test infrastructure.

Quick deployment:

```bash
# 1. Build the lambda
npm install
npm run lambda-build

# 2. Enable in environment tfvars
# Set deploy_mock_webhook = true in your environment's .tfvars file

# 3. Apply Terraform
cd infrastructure/terraform/components/callbacks
terraform apply -var-file=etc/dev.tfvars
```

**Configuration**:

- **Runtime**: Node.js 22
- **Handler**: `index.handler`
- **Memory**: 256 MB
- **Timeout**: 10 seconds
- **Trigger**: Function URL or API Gateway
- **Environment**: dev/test only (controlled via `deploy_mock_webhook` variable)

## Scripts

- `npm run lambda-build` - Bundle Lambda for deployment
- `npm test` - Run unit tests
- `npm run typecheck` - Type check without emit
- `npm run lint` - Lint code
