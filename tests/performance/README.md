# performance

Load tests for the client-callbacks service. These tests run against a real deployed AWS environment — they are not unit tests and cannot run locally without a live stack.

## Prerequisites

- AWS credentials configured for the target environment
- The service deployed to the target environment

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ENVIRONMENT` | Yes | — | Target environment name (e.g. `dev`) |
| `AWS_ACCOUNT_ID` | Yes | — | AWS account ID for the target environment |
| `AWS_REGION` | No | `eu-west-2` | AWS region |
| `PROJECT` | No | `nhs` | Project name prefix used in resource naming |
| `COMPONENT` | No | `callbacks` | Component name used in resource naming |

## Running

From the repository root:

```bash
ENVIRONMENT=dev AWS_ACCOUNT_ID=123456789012 pnpm run test:performance --filter tests/performance
```

## What the Tests Do

The load test sends ~3,000 events/s to the SQS inbound queue for 30 seconds, then reads CloudWatch Logs to assert that the p95 Lambda processing time is below 500ms.

The global teardown removes the test client subscription config from S3.
