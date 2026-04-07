# Integration Tests

This folder contains integration tests for the callbacks service.

These instructions are for running integration tests locally against a remotely deployed environment.
In normal delivery flow, integration tests are triggered via the CI workflow.

## Prerequisites

- AWS CLI installed and authenticated
- Valid AWS SSO session for your chosen profile (the script will prompt for login if needed)
- Environment variables:
  - `ENVIRONMENT` (required)
  - `AWS_PROFILE` (required)
  - `AWS_REGION` (optional, defaults to `eu-west-2`)

## Run Integration Tests Locally

Run all integration tests against a deployed environment:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-local
```

Run a single test file:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-local TEST_FILE=metrics
```

Run a single test name:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-local TEST_NAME="should emit processing metrics when a valid event is fully processed"
```

Combine file + test name:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-local TEST_FILE=metrics TEST_NAME="should emit processing metrics when a valid event is fully processed"
```

## Debug an Environment

The following debug tools are available for inspecting a deployed environment.
All are run via `make test-integration-debug ACTION=<action>`.

**Available actions:**

- [`queue-status`](#queue-status) – SQS queue message counts
- [`queue-peek`](#queue-peek) – Peek at one message from each SQS queue
- [`tail-transform`](#tail-transform) – Tail the transform/filter Lambda logs
- [`tail-webhook`](#tail-webhook) – Tail the mock-webhook Lambda logs
- [`tail-pipe`](#tail-pipe) – Tail the EventBridge pipe logs
- [`pipe-state`](#pipe-state) – Show EventBridge pipe state and recent metrics

All log-tailing actions (`tail-transform`, `tail-webhook`, `tail-pipe`) accept an optional `LOG_FILTER` to narrow output to a specific message ID or pattern.

---

### `queue-status`

Shows approximate message counts for the inbound event queue, inbound event DLQ, and mock target DLQ.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status
```

---

### `queue-peek`

Reads one message (without deleting it) from each of the same three queues, printing body, attributes, and message attributes.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-peek
```

---

### `tail-transform`

Tails CloudWatch logs for the `client-transform-filter` Lambda, following from the last 30 minutes.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-transform
```

Filter to a specific message ID:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> LOG_FILTER=SOME-MESSAGE-ID make test-integration-debug ACTION=tail-transform
```

---

### `tail-webhook`

Tails CloudWatch logs for the `mock-webhook` Lambda, following from the last 30 minutes.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-webhook
```

Filter to a specific message ID:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> LOG_FILTER=SOME-MESSAGE-ID make test-integration-debug ACTION=tail-webhook
```

---

### `tail-pipe`

Tails the CloudWatch log group attached to the EventBridge pipe, following from the last 30 minutes.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-pipe
```

Filter to a specific message ID:

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> LOG_FILTER=SOME-MESSAGE-ID make test-integration-debug ACTION=tail-pipe
```

---

### `pipe-state`

Shows the current state (running/stopped), desired state, and last state reason for the EventBridge pipe, plus execution metrics (succeeded, failed, dead-lettered) for the last 30 minutes.

```sh
ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=pipe-state
```
