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

Configuration:

- **Runtime**: Node.js 22
- **Handler**: `index.handler`
- **Trigger**: API Gateway (or configured as EventBridge API Destination target)
- **Environment**: dev/test only

## Scripts

- `npm run lambda-build` - Bundle Lambda for deployment
- `npm test` - Run unit tests
- `npm run typecheck` - Type check without emit
- `npm run lint` - Lint code

## Based On

This implementation follows the pattern from `comms-mgr/comms/components/nhs-notify-callbacks/message-status-subscription-mock`, adapted for the nhs-notify-client-callbacks architecture.
