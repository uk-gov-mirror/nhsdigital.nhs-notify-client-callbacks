#!/bin/bash

set -euo pipefail

# Debug a live environment: inspect queues, tail logs, check pipe state.
#
# Usage (via make):
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-transform
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-transform LOG_FILTER=<value>
#
# Actions:
#   queue-status    Show SQS queue message counts
#   queue-peek      Peek one message from each SQS queue
#   tail-transform  Tail client-transform-filter lambda logs
#   tail-webhook    Tail mock-webhook lambda logs
#   tail-pipe       Tail EventBridge pipe log group
#   pipe-state      Show EventBridge pipe state and recent metrics
#
# Required:
#   ENVIRONMENT
#   AWS_PROFILE
#   ACTION
#
# Optional:
#   LOG_FILTER      CloudWatch Logs filter pattern / text
#   AWS_REGION      (default: eu-west-2)

if [[ -z "${ENVIRONMENT:-}" ]]; then
  echo "Error: ENVIRONMENT must be set before running this target." >&2
  echo "Example: ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status" >&2
  exit 1
fi

if [[ -z "${AWS_PROFILE:-}" ]]; then
  echo "Error: AWS_PROFILE must be set before running this target." >&2
  exit 1
fi

if [[ -z "${ACTION:-}" ]]; then
  echo "Error: ACTION must be set before running this target." >&2
  echo "Actions: queue-status, queue-peek, tail-transform, tail-webhook, tail-pipe, pipe-state" >&2
  exit 1
fi

REGION="${AWS_REGION:-eu-west-2}"
LOG_FILTER="${LOG_FILTER:-}"
SUBSCRIPTION_FIXTURE_PATH="${SUBSCRIPTION_FIXTURE_PATH:-tests/integration/fixtures/subscriptions/mock-client-1.json}"

if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
  echo "No active AWS SSO session for profile '$AWS_PROFILE'. Running aws sso login..."
  aws sso login --profile "$AWS_PROFILE"
fi

ACCOUNT_ID="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"

PREFIX="nhs-${ENVIRONMENT}-callbacks"
PIPE_NAME="${PREFIX}-main"

print_section() {
  echo ""
  echo "========================================"
  echo "$1"
  echo "========================================"
  return 0
}

queue_url() {
  local queue_name="$1"
  echo "https://sqs.${REGION}.amazonaws.com/${ACCOUNT_ID}/${queue_name}"
  return 0
}

target_dlq_queue_name() {
  local target_id

  if [[ ! -f "$SUBSCRIPTION_FIXTURE_PATH" ]]; then
    echo "Error: subscription fixture not found: $SUBSCRIPTION_FIXTURE_PATH" >&2
    exit 1
  fi

  target_id="$(jq -r '.targets[0].targetId // empty' "$SUBSCRIPTION_FIXTURE_PATH")"
  if [[ -z "$target_id" ]]; then
    echo "Error: unable to read targets[0].targetId from $SUBSCRIPTION_FIXTURE_PATH" >&2
    exit 1
  fi

  echo "${PREFIX}-${target_id}-dlq-queue"
  return 0
}

show_queue_counts() {
  local title="$1"
  local name="$2"

  print_section "$title"
  aws sqs get-queue-attributes \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --no-cli-pager \
    --queue-url "$(queue_url "$name")" \
    --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
    --query '{ApproximateNumberOfMessages: Attributes.ApproximateNumberOfMessages, ApproximateNumberOfMessagesNotVisible: Attributes.ApproximateNumberOfMessagesNotVisible}'
  return 0
}

action_queue_status() {
  show_queue_counts "Mock Target DLQ - Queue Message Counts" "$(target_dlq_queue_name)"
  show_queue_counts "Inbound Event Queue - Queue Message Counts" "${PREFIX}-inbound-event-queue"
  show_queue_counts "Inbound Event DLQ - Queue Message Counts" "${PREFIX}-inbound-event-dlq"
  return 0
}

peek_queue_message() {
  local title="$1"
  local name="$2"

  print_section "$title"
  aws sqs receive-message \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --no-cli-pager \
    --queue-url "$(queue_url "$name")" \
    --attribute-names All \
    --message-attribute-names All \
    --max-number-of-messages 1 \
    --visibility-timeout 0 \
    --output json \
    | jq 'if (.Messages // [] | length) == 0
      then {message: "No messages"}
      else .Messages[0] | {Body, Attributes, MessageAttributes}
      end'
  return 0
}

action_queue_peek() {
  peek_queue_message "Mock Target DLQ - Message Peek" "$(target_dlq_queue_name)"
  peek_queue_message "Inbound Event Queue - Message Peek" "${PREFIX}-inbound-event-queue"
  peek_queue_message "Inbound Event DLQ - Message Peek" "${PREFIX}-inbound-event-dlq"
  return 0
}

log_filter_args() {
  local -a args=()
  local escaped_log_filter
  if [[ -n "$LOG_FILTER" ]]; then
    escaped_log_filter="${LOG_FILTER//\"/\\\"}"
    # CloudWatch filter patterns treat quoted strings as exact phrases.
    args+=(--filter-pattern "\"$escaped_log_filter\"")
  fi

  printf '%s\n' "${args[@]}"
  return 0
}

action_tail_transform() {
  local -a filter_args=()
  mapfile -t filter_args < <(log_filter_args)

  print_section "Transform/Filter Lambda Logs"
  aws logs tail \
    "/aws/lambda/${PREFIX}-client-transform-filter" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since 30m \
    --follow \
    --format short \
    "${filter_args[@]}"
  return 0
}

action_tail_webhook() {
  local -a filter_args=()
  mapfile -t filter_args < <(log_filter_args)

  print_section "Mock Webhook Lambda Logs"
  aws logs tail \
    "/aws/lambda/${PREFIX}-mock-webhook" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since 30m \
    --follow \
    --format short \
    "${filter_args[@]}"
  return 0
}

action_tail_pipe() {
  local pipe_log_group_arn
  local pipe_log_group_name
  local -a filter_args=()

  mapfile -t filter_args < <(log_filter_args)

  pipe_log_group_arn=$(aws pipes describe-pipe \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --name "$PIPE_NAME" \
    --no-cli-pager \
    --query "LogConfiguration.CloudwatchLogsLogDestination.LogGroupArn" \
    --output text)

  if [[ -z "$pipe_log_group_arn" || "$pipe_log_group_arn" == "None" ]]; then
    echo "No CloudWatch log group configured for pipe: $PIPE_NAME"
    return 1
  fi

  pipe_log_group_name="${pipe_log_group_arn#*:log-group:}"

  print_section "EventBridge Pipe Logs"
  aws logs tail \
    "$pipe_log_group_name" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since 30m \
    --follow \
    --format short \
    "${filter_args[@]}"
  return 0
}

pipe_metric_sum() {
  local metric_name="$1"
  local start_time="$2"
  local end_time="$3"

  aws cloudwatch get-metric-statistics \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --namespace "AWS/Pipes" \
    --metric-name "$metric_name" \
    --dimensions "Name=PipeName,Value=$PIPE_NAME" \
    --start-time "$start_time" \
    --end-time "$end_time" \
    --period 60 \
    --statistics Sum \
    --query "sum(Datapoints[].Sum)" \
    --output text \
    --no-cli-pager
  return 0
}

action_pipe_state() {
  local start_time
  local end_time
  local execution_succeeded
  local execution_failed
  local dead_lettered_events

  start_time="$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
  end_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  print_section "EventBridge Pipe State"
  aws pipes describe-pipe \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --name "$PIPE_NAME" \
    --no-cli-pager \
    --query '{Name:Name,CurrentState:CurrentState,DesiredState:DesiredState,StateReason:StateReason,LogConfiguration:LogConfiguration}'

  execution_succeeded="$(pipe_metric_sum "ExecutionSucceeded" "$start_time" "$end_time")"
  execution_failed="$(pipe_metric_sum "ExecutionFailed" "$start_time" "$end_time")"
  dead_lettered_events="$(pipe_metric_sum "DeadLetteredEvents" "$start_time" "$end_time")"

  print_section "EventBridge Pipe Metrics (last 30 minutes)"
  echo "ExecutionSucceeded: ${execution_succeeded}"
  echo "ExecutionFailed: ${execution_failed}"
  echo "DeadLetteredEvents: ${dead_lettered_events}"
  return 0
}

case "$ACTION" in
  queue-status)
    action_queue_status
    ;;
  queue-peek)
    action_queue_peek
    ;;
  tail-transform)
    action_tail_transform
    ;;
  tail-webhook)
    action_tail_webhook
    ;;
  tail-pipe)
    action_tail_pipe
    ;;
  pipe-state)
    action_pipe_state
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    echo "Actions: queue-status, queue-peek, tail-transform, tail-webhook, tail-pipe, pipe-state" >&2
    exit 1
    ;;
esac
