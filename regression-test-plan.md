# Plan: Automated Regression Test Suite for Client Callbacks

**Feature**: CCM-13912 — Externalise Callbacks Phase 1
**Repository**: `nhs-notify-client-callbacks`
**Date**: 9 April 2026
**Source**: Derived from `manual-testing-plan.md`

---

## TL;DR

Create a new `tests/regression/` workspace in `nhs-notify-client-callbacks` containing automated regression tests derived from the manual testing plan. Tests are organised into separate files per category, forking helpers from the existing `tests/integration/` suite. Triggered manually via npm scripts + env vars and via a GitHub Actions `workflow_dispatch`, with a new dedicated CI/CD stage after acceptance.

---

## Rationale for Key Decisions

### Why a separate suite, not extending `tests/integration/`?

1. **Different purposes**: The existing integration tests are lightweight smoke tests (~4 files) designed to run fast in the PR acceptance pipeline. The regression suite is comprehensive (26+ test cases across 10 categories) and includes long-running tests (up to 1 hour for retry scenarios).
2. **Independent lifecycle**: Regression tests may run on a schedule or on-demand against multiple environments, whereas integration tests are tightly coupled to the PR pipeline's dynamic environments.
3. **Selective execution**: Separate files per category enable running subsets (e.g. only filtering tests) without touching the fast integration suite.

### Why fork helpers rather than import cross-workspace?

1. **Workspace isolation**: Per AGENTS.md, each workspace must be independently buildable and testable. Cross-workspace runtime imports break this.
2. **Divergence safety**: The regression suite needs additional helpers (EventBridge, SSM, Pipes, CLI runner) that don't belong in the integration helpers. Forking allows both to evolve independently.
3. **Existing pattern**: The current `tests/integration/` workspace already has its own self-contained helpers directory.

### Why Jest?

The existing codebase uses Jest everywhere (unit + integration). Using Jest for regression maintains consistency, avoids new dependencies, and lets the team use familiar patterns (`describe`/`it`, `expect`, global setup/teardown, `--testNamePattern` filtering).

### Why separate files per category?

1. Maps 1:1 to the manual testing plan sections, making traceability clear.
2. Enables selective execution via `--testPathPattern` (e.g. `jest --testPathPattern=filtering` for just filtering tests).
3. Different categories have different timeout requirements (happy-path ~2 min, error-handling ~60 min).

---

## Steps

### Phase 1: Workspace Scaffolding

1. **Create `tests/regression/` workspace directory** with:
   - `package.json` (workspace scripts: `test:regression`, `lint`, `typecheck`)
   - `jest.config.ts` (extending `jest.config.base.ts`, `maxWorkers: 1`, `forceExit: true`, custom timeouts)
   - `tsconfig.json` (extending root base, path alias `"helpers": ["./helpers/index"]`)
   - `jest.global-setup.ts` — seeds S3 with regression-specific mock-client config (richer than integration: 5 message statuses, NHSAPP + SMS channel subscriptions)
   - `jest.global-teardown.ts` — removes test config, purges DLQs
   - `jest.setup.ts` — test start/finish logging (fork from integration)

2. **Register workspace** in root `package.json` workspaces array: add `"tests/regression"`. *Depends on 1.*

3. **Add root script** in root `package.json`: `"test:regression": "npm run test:regression --workspace tests/regression"`. *Depends on 2.*

4. **Add Make target**: Add `scripts/tests/regression.sh` (runs `npm ci && npm run test:regression`) and ensure `make test-regression` works via the existing `test.mk` pattern. *Depends on 3.*

### Phase 2: Helpers (fork + extend)

5. **Fork existing helpers** from `tests/integration/helpers/` into `tests/regression/helpers/`:
   - `deployment.ts` — as-is (env var-driven resource naming)
   - `clients.ts` — as-is (AWS client factories)
   - `sqs.ts` — as-is (queue operations, polling, purging)
   - `cloudwatch.ts` — as-is (log polling, EMF metric polling)
   - `event-factories.ts` — extended with additional factory overrides for filtering/edge case scenarios
   - `status-events.ts` — as-is (send + await callback flow)
   - `signature.ts` — as-is (HMAC computation)
   - `redrive.ts` — as-is (DLQ redrive flow)
   - `index.ts` — barrel export

6. **Create new helpers** in `tests/regression/helpers/`: *(parallel with 5)*
   - `eventbridge.ts` — `putEvent()` to publish to Shared Event Bus, `describeEventBus()`, `listRules()` (uses `@aws-sdk/client-eventbridge`)
   - `pipes.ts` — `describePipe()` wrapper (uses `@aws-sdk/client-pipes`)
   - `ssm.ts` — `getParameter()`, `putParameter()` for SSM Applications Map manipulation (uses `@aws-sdk/client-ssm`)
   - `cli-runner.ts` — `execCliCommand()` that runs npm workspace CLI commands via `child_process.execFile` and returns stdout/stderr/exit code
   - `cloudwatch-alarms.ts` — `describeAlarms()` wrapper (uses `@aws-sdk/client-cloudwatch`)
   - `s3.ts` — `putObject()`, `getObject()`, `deleteObject()` for direct S3 config manipulation (uses `@aws-sdk/client-s3`)

7. **Add new AWS SDK dependencies** to `tests/regression/package.json`: *(depends on 1)*
   - `@aws-sdk/client-eventbridge`
   - `@aws-sdk/client-pipes`
   - `@aws-sdk/client-ssm`
   - `@aws-sdk/client-cloudwatch`
   - `@aws-sdk/client-cloudwatch-logs`
   - `@aws-sdk/client-sqs`
   - `@aws-sdk/client-s3`
   - `async-wait-until`
   - `@nhs-notify-client-callbacks/models` (internal workspace dep)
   - `@nhs-notify-client-callbacks/logger` (internal workspace dep)

### Phase 3: Test Files

Tests are organised to mirror manual testing plan sections. Each file is independently runnable. All depend on Phase 2.

8. **`infrastructure.test.ts`** — Manual plan Section 0 + 8
   - Verify S3 config bucket exists (HeadBucket)
   - Verify inbound SQS queue accessible (GetQueueAttributes)
   - Verify inbound DLQ accessible
   - Verify mock-client DLQ accessible
   - Verify SSM Applications Map parameter exists and contains `mock-client`
   - Verify EventBridge Callbacks bus exists (describeEventBus)
   - Verify EventBridge Pipe is RUNNING (describePipe, check `CurrentState`)
   - Source/Target/Enrichment ARNs match expected resources
   - *Conditional*: Verify Shared Event Bus exists and has a routing rule targeting inbound SQS

9. **`happy-path.test.ts`** — Manual plan Section 2 (Tests 2.1, 2.2, 2.3)
   - **2.1**: Message Status E2E — send via SQS, verify callback payload structure, lowercased status, correct fields, HMAC signature
   - **2.2**: Channel Status E2E — verify ChannelStatus callback with `channel`, `channelStatus`, `supplierStatus`, `cascadeType`, `cascadeOrder`, `retryCount` attributes
   - **2.3**: SMS Channel Status — send SMS channel event, verify `ch-status-sub-sms` subscription matched, callback has `channel: "sms"`
   - Timeout: 120s per test

10. **`filtering.test.ts`** — Manual plan Section 3 (Tests 3.1, 3.2, 3.3, 3.4)
    - **3.1**: No status transition (`previousMessageStatus == messageStatus`) — send event, wait for queue drain, verify NO callback in webhook logs
    - **3.2**: Unsubscribed channel type (LETTER) — send channel status for LETTER, verify no callback
    - **3.3**: Unknown client — send event with `clientId: "nonexistent-client"`, verify silently discarded (no callback, no DLQ entry, queue drained)
    - **3.4**: SupplierStatus transition — send channel status where supplierStatus changed but channelStatus didn't, verify callback IS delivered
    - Timeout: 120s per test
    - **Note**: "No callback" assertions use a bounded wait (e.g. 30s) then confirm webhook logs don't contain the test messageId — this is inherently timing-dependent; document this limitation.

11. **`error-handling.test.ts`** — Manual plan Section 4 (Tests 4.1, 4.2, 4.3)
    - **4.1**: Malformed event (missing required fields) → schema validation failure → inbound DLQ after retries. Timeout: 300s (3 retries × ~60s visibility timeout)
    - **4.2**: Forced HTTP 500 → EventBridge retry → per-client DLQ. Uses `force-500-*` messageId pattern. Timeout: 3600s (1 hour max event age, 3 retries with backoff). Mark with `@slow` in describe block for filtering.
    - **4.3**: DLQ redrive — place message in mock-client DLQ, redrive to inbound queue, verify reprocessed successfully
    - Timeout: varies per test (see above)

12. **`hmac-signing.test.ts`** — Manual plan Section 5 (Tests 5.1, 5.2)
    - **5.1**: HMAC signature correctness — send event, extract signature from webhook log, compute expected HMAC locally, assert match (pattern already in integration suite)
    - **5.2**: Missing Applications Map entry — create temp S3 config for `unmapped-client` (no SSM entry), send event, verify silently filtered (no callback, no DLQ). Setup/teardown within the test (create + delete S3 object).

13. **`cli-management.test.ts`** — Manual plan Section 6 (Tests 6.1–6.6)
    - **6.1**: `clients-list` — run CLI, verify output contains `mock-client`
    - **6.2**: `clients-get` — run CLI for `mock-client`, verify JSON output matches uploaded config
    - **6.3**: `subscriptions-add` — add LETTER subscription, verify via `subscriptions-list`
    - **6.4**: `subscriptions-del` — delete the LETTER subscription added in 6.3
    - **6.5**: `subscriptions-set-states` — update message statuses, verify change
    - **6.6**: Dry run mode — add subscription with `--dry-run true`, verify S3 unchanged
    - **Teardown**: Restore original mock-client config from global setup after all CLI tests
    - Uses `cli-runner.ts` helper to spawn `npm --workspace tools/client-subscriptions-management run <command> -- <args>`
    - Timeout: 30s per test

14. **`observability.test.ts`** — Manual plan Section 7 (Tests 7.1–7.4)
    - **7.1**: Structured logging — after a happy-path event, query transform Lambda logs, verify each entry has `timestamp`, `level`, `correlationId`, `clientId`, `eventType`, `deliveryStatus`
    - **7.2**: No PII/PHI — scan recent logs for patterns matching phone numbers, emails, NHS numbers (regex-based assertion)
    - **7.3**: CloudWatch metrics — list metrics in `nhs-notify-client-callbacks` namespace, verify expected metric names exist
    - **7.4**: Anomaly detection alarm — describe alarms with prefix `nhs-{ENV}-callbacks`, verify `inbound-event-subscriber-anomaly` alarm exists and is `OK`
    - Timeout: 120s per test

15. **`resilience.test.ts`** — Manual plan Section 9 (Tests 9.1, 9.2)
    - **9.1**: Batch processing — send 10 events rapidly, verify all 10 callbacks appear in webhook logs, queue drained, no DLQ entries
    - **9.2**: Optional fields missing — send channel status event without `channelStatusDescription`, `channelFailureReasonCode`, `sequence`, verify processed successfully
    - Timeout: 180s per test

16. **`shared-event-bus.test.ts`** — Manual plan Section 10 (Tests 10.1, 10.2) *conditional*
    - Skip entire file if Shared Event Bus rule doesn't exist (checked in `beforeAll` via `listRules`)
    - **10.1**: Publish message status event to Shared Bus, verify full path: Shared Bus → SQS → Pipe → Lambda → Callbacks Bus → API Destination → Webhook
    - **10.2**: Publish non-matching namespace event (`com.example.other`), verify it does NOT enter inbound SQS queue
    - Timeout: 120s per test

### Phase 4: Global Setup Configuration

17. **Regression-specific mock-client config** for `jest.global-setup.ts`: *(depends on Phase 1)*
    - Must include richer subscriptions than integration setup:
      - MessageStatus subscription: statuses `DELIVERED`, `FAILED`, `SENDING`, `PENDING_ENRICHMENT`, `ENRICHED`
      - ChannelStatus subscription for NHSAPP: `channelStatuses: ["DELIVERED"]`, `supplierStatuses: ["delivered", "read"]`
      - ChannelStatus subscription for SMS: `channelStatuses: ["DELIVERED"]`
    - Single API target pointing at mock webhook URL
    - Mock webhook URL and API key sourced from env vars or Lambda config lookup
    - SSM Applications Map must contain `mock-client: mock-application-id` (verify in setup, fail fast if missing)

18. **`jest.global-teardown.ts`**: clean up S3 object, purge DLQs, remove any temp test configs (e.g. `unmapped-client.json`). *(depends on 17)*

### Phase 5: Manual + CI/CD Triggers

19. **Manual npm trigger** — already functional after Phase 1: *(depends on Phase 1)*

    ```bash
    ENVIRONMENT=dev AWS_ACCOUNT_ID=123456789012 npm run test:regression
    ```

    Optionally with Jest `--testPathPattern` for subset execution:

    ```bash
    ENVIRONMENT=dev AWS_ACCOUNT_ID=123456789012 npm run test:regression -- --testPathPattern=filtering
    ```

20. **GitHub Actions `workflow_dispatch`** — new workflow file `.github/workflows/manual-regression-tests.yaml`: *(depends on Phase 1)*
    - Inputs: `environment` (required, string), `test_filter` (optional, string — maps to `--testPathPattern`)
    - Assumes OIDC role for the target account
    - Runs `npm ci && npm run test:regression` with appropriate env vars
    - Uploads test report as artifact

21. **New CI/CD stage workflow** — `.github/workflows/stage-5-regression.yaml`: *(depends on 20)*
    - Called from `cicd-1-pull-request.yaml` after stage-4-acceptance
    - Same runner/setup as acceptance stage
    - Receives `target_environment` input
    - Runs regression suite (excluding `@slow` tests for PR pipelines)
    - Full suite runs only on `workflow_dispatch` or scheduled runs

22. **Update `cicd-1-pull-request.yaml`** to call stage-5-regression after stage-4-acceptance. *(depends on 21)*

---

## Test Traceability Matrix

| # | Test File | Manual Plan Test | Validates | Expected Outcome | Timeout |
|---|---|---|---|---|---|
| 2.1 | `happy-path.test.ts` | Test 2.1 | FR-001/002/003/007/016/017/021 | Callback delivered with correct format | 120s |
| 2.2 | `happy-path.test.ts` | Test 2.2 | FR-003/008/016 | ChannelStatus callback delivered | 120s |
| 2.3 | `happy-path.test.ts` | Test 2.3 | FR-010 | Correct channel subscription matched | 120s |
| 3.1 | `filtering.test.ts` | Test 3.1 | FR-009 | Event filtered, no callback | 120s |
| 3.2 | `filtering.test.ts` | Test 3.2 | FR-010 | Event filtered, no callback | 120s |
| 3.3 | `filtering.test.ts` | Test 3.3 | FR-004 | Silently discarded | 120s |
| 3.4 | `filtering.test.ts` | Test 3.4 | FR-010 | Callback delivered | 120s |
| 4.1 | `error-handling.test.ts` | Test 4.1 | FR-011a/018 | Validation error → inbound DLQ | 300s |
| 4.2 | `error-handling.test.ts` | Test 4.2 | FR-005/006 | Retries → per-client DLQ | 3600s |
| 4.3 | `error-handling.test.ts` | Test 4.3 | SC-008 | Successful redelivery | 120s |
| 5.1 | `hmac-signing.test.ts` | Test 5.1 | FR-021 | Signature matches computation | 120s |
| 5.2 | `hmac-signing.test.ts` | Test 5.2 | FR-020 | Silently filtered | 120s |
| 6.1–6.6 | `cli-management.test.ts` | Tests 6.1–6.6 | FR-013 | All CLI commands work correctly | 30s |
| 7.1–7.4 | `observability.test.ts` | Tests 7.1–7.4 | FR-017/022 | Structured logs, metrics, alarms | 120s |
| 8.1–8.2 | `infrastructure.test.ts` | Tests 8.1–8.2 | FR-002 | Pipe running, error logging | 30s |
| 9.1 | `resilience.test.ts` | Test 9.1 | SC-006 | All events processed | 180s |
| 9.2 | `resilience.test.ts` | Test 9.2 | FR-011b | Graceful handling | 180s |
| 10.1 | `shared-event-bus.test.ts` | Test 10.1 | FR-001/011 | Full E2E delivery | 120s |
| 10.2 | `shared-event-bus.test.ts` | Test 10.2 | FR-011/SC-009 | Event rejected at bus level | 120s |

---

## Relevant Files

### Existing (reference)

- `tests/integration/helpers/` — all 8 helper files to fork (deployment, clients, sqs, cloudwatch, event-factories, status-events, signature, redrive)
- `tests/integration/jest.config.ts` — reference for regression jest config
- `tests/integration/jest.global-setup.ts` — reference for S3 seeding pattern
- `tests/integration/jest.global-teardown.ts` — reference for S3 cleanup
- `tests/integration/jest.setup.ts` — reference for test logging
- `tests/integration/event-bus-to-webhook.test.ts` — reference for happy-path + DLQ + HMAC patterns
- `tests/integration/dlq-redrive.test.ts` — reference for redrive pattern
- `tests/integration/metrics.test.ts` — reference for EMF metric assertion pattern
- `jest.config.base.ts` — base Jest config to extend
- `tsconfig.base.json` — base TypeScript config to extend
- `package.json` — root workspace orchestration (add workspace + script)
- `.github/workflows/cicd-1-pull-request.yaml` — main pipeline to add regression stage call
- `.github/workflows/stage-4-acceptance.yaml` — reference for acceptance stage pattern
- `scripts/tests/test.mk` — Make target pattern
- `scripts/tests/integration.sh` — reference for test runner shell script pattern

### New (create)

- `tests/regression/package.json`
- `tests/regression/jest.config.ts`
- `tests/regression/tsconfig.json`
- `tests/regression/jest.global-setup.ts`
- `tests/regression/jest.global-teardown.ts`
- `tests/regression/jest.setup.ts`
- `tests/regression/helpers/` — `index.ts` + 14 helper files
- `tests/regression/infrastructure.test.ts`
- `tests/regression/happy-path.test.ts`
- `tests/regression/filtering.test.ts`
- `tests/regression/error-handling.test.ts`
- `tests/regression/hmac-signing.test.ts`
- `tests/regression/cli-management.test.ts`
- `tests/regression/observability.test.ts`
- `tests/regression/resilience.test.ts`
- `tests/regression/shared-event-bus.test.ts`
- `scripts/tests/regression.sh`
- `.github/workflows/manual-regression-tests.yaml`
- `.github/workflows/stage-5-regression.yaml`

### Modified

- `package.json` — add workspace + `test:regression` script
- `.github/workflows/cicd-1-pull-request.yaml` — add stage-5 call
- `eslint.config.mjs` — add exceptions for `tests/regression/` (same pattern as integration)

---

## Verification

1. **Lint**: `npm run lint --workspace tests/regression` passes
2. **Typecheck**: `npm run typecheck --workspace tests/regression` passes
3. **Pre-commit hooks**: `make githooks-run` passes
4. **Local dry run** (no AWS): `npm run test:regression` fails fast with `ENVIRONMENT environment variable must be set` — confirms wiring
5. **Full run against dev**: `ENVIRONMENT=dev AWS_ACCOUNT_ID=<id> npm run test:regression` — all tests pass (except conditional Shared Event Bus tests if no rule exists)
6. **Subset run**: `ENVIRONMENT=dev AWS_ACCOUNT_ID=<id> npm run test:regression -- --testPathPattern=happy-path` — runs only happy-path tests
7. **workflow_dispatch**: Trigger `manual-regression-tests.yaml` from GitHub Actions UI with `environment=dev` — passes and uploads report artifact
8. **CI pipeline**: Push a branch with a PR, verify stage-5-regression runs after acceptance

---

## Decisions

| Decision | Rationale |
|---|---|
| Separate `tests/regression/` workspace | Avoids impacting the fast integration test loop; enables independent evolution |
| Forked helpers | Workspace isolation per AGENTS.md; no cross-workspace runtime imports |
| CLI tests included as separate file | Uses `child_process.execFile` to spawn npm commands; keeps event pipeline tests separate |
| Shared Event Bus tests conditional | Skip gracefully if routing rule not found, log a warning |
| Forced 500 test with 1h timeout | Marked `@slow` so it can be excluded in fast CI runs |
| Jest (not Playwright/Vitest/etc.) | Matches entire existing codebase; no new framework dependencies |
| No SSM modification in tests | Too risky for shared environments; tests verify reads only (except test 5.2 which uses S3-only setup) |
| Scope: `nhs-notify-client-callbacks` only | No changes to other repos/submodules |

---

## Further Considerations

### 1. Negative Timing Assertions

Tests 3.1–3.3 assert "no callback delivered" by waiting a bounded period (~30s) then checking logs. This introduces a risk of false positives if processing is delayed beyond the wait window.

**Recommendation**: In addition to the bounded wait, check the transform Lambda logs for explicit "filtered" log entries as positive confirmation that the Lambda processed and discarded the event. This provides a stronger assertion than absence alone.

### 2. Environment Contention

Running regression tests on shared dev environments while other testing is happening could cause interference (e.g. purging queues that contain other teams' test messages).

**Mitigations**:
- Test-specific `messageId` prefixes via `crypto.randomUUID()` (already in the pattern)
- Consider scoped cleanup (delete by receipt handle) instead of full `PurgeQueueCommand` in setup/teardown
- Document that regression tests should not run concurrently with manual testing on the same environment

### 3. Test 4.2 in CI

A 1-hour test in the PR pipeline is impractical.

**Recommendation**: Run test 4.2 only on `workflow_dispatch` and scheduled runs, not in the PR stage-5. The PR pipeline should exclude `@slow`-tagged tests by passing `--testPathIgnorePatterns=error-handling` or using a Jest `--testNamePattern` that skips the forced-500 describe block.
