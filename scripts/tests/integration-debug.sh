#!/bin/bash

set -euo pipefail

# Debug a live environment: inspect queues, tail logs, check pipe state.
#
# Usage (via make):
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-transform
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=tail-transform LOG_FILTER=<value>
#   ENVIRONMENT=<env> AWS_PROFILE=<profile> FOLLOW=false make test-integration-debug ACTION=tail-transform > out.log
#
# Actions:
#   queue-status    Show SQS queue message counts
#   queue-peek      Peek one message from each SQS queue
#   tail-transform      Tail client-transform-filter lambda logs
#   tail-https-client   Tail https-client lambda logs (requires CLIENT_ID)
#   tail-webhook        Tail mock-webhook lambda logs
#   tail-pipe           Tail EventBridge pipe log group
#   pipe-state          Show EventBridge pipe state and recent metrics
#
# Required:
#   ENVIRONMENT
#   AWS_PROFILE
#   ACTION
#
# Required for queue-status, queue-peek:
#   CLIENT_ID       Client ID (e.g. mock-client-1)
#
# Optional:
#   LOG_FILTER      CloudWatch Logs filter pattern / text
#   LOG_SINCE       How far back to start tailing logs (default: 30m, e.g. 1h, 2h, 30m)
#   FOLLOW          Follow logs continuously (default: true, set false to dump and exit)
#   AWS_REGION      (default: eu-west-2)

if [ -z "${ENVIRONMENT:-}" ]; then
  echo "Error: ENVIRONMENT must be set before running this target." >&2
  echo "Example: ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status" >&2
  exit 1
fi

if [ -z "${AWS_PROFILE:-}" ]; then
  echo "Error: AWS_PROFILE must be set before running this target." >&2
  exit 1
fi

if [ -z "${ACTION:-}" ]; then
  echo "Error: ACTION must be set before running this target." >&2
  echo "Actions: queue-status, queue-peek, tail-transform, tail-webhook, tail-pipe, pipe-state" >&2
  exit 1
fi

REGION="${AWS_REGION:-eu-west-2}"
LOG_FILTER="${LOG_FILTER:-}"
LOG_SINCE="${LOG_SINCE:-30m}"
CLIENT_ID="${CLIENT_ID:-}"
FOLLOW="${FOLLOW:-true}"

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
}

queue_url() {
  local queue_name="$1"
  echo "https://sqs.${REGION}.amazonaws.com/${ACCOUNT_ID}/${queue_name}"
}

require_client_id() {
  if [ -z "$CLIENT_ID" ]; then
    echo "Error: CLIENT_ID must be set for this action." >&2
    echo "Example: CLIENT_ID=mock-client-1 ENVIRONMENT=<env> AWS_PROFILE=<profile> make test-integration-debug ACTION=queue-status" >&2
    exit 1
  fi
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
}

action_queue_status() {
  require_client_id
  show_queue_counts "Client Delivery Queue - Message Counts" "${PREFIX}-${CLIENT_ID}-delivery-queue"
  show_queue_counts "Client Delivery DLQ - Message Counts" "${PREFIX}-${CLIENT_ID}-delivery-dlq-queue"
  show_queue_counts "Inbound Event Queue - Message Counts" "${PREFIX}-inbound-event-queue"
  show_queue_counts "Inbound Event DLQ - Message Counts" "${PREFIX}-inbound-event-dlq"
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
}

action_queue_peek() {
  require_client_id
  peek_queue_message "Client Delivery Queue - Message Peek" "${PREFIX}-${CLIENT_ID}-delivery-queue"
  peek_queue_message "Client Delivery DLQ - Message Peek" "${PREFIX}-${CLIENT_ID}-delivery-dlq-queue"
  peek_queue_message "Inbound Event Queue - Message Peek" "${PREFIX}-inbound-event-queue"
  peek_queue_message "Inbound Event DLQ - Message Peek" "${PREFIX}-inbound-event-dlq"
}

log_filter_args() {
  if [[ -n "$LOG_FILTER" ]]; then
    local escaped_log_filter="${LOG_FILTER//\"/\\\"}"
    # CloudWatch filter patterns treat quoted strings as exact phrases.
    printf '%s\n' --filter-pattern "\"$escaped_log_filter\""
  fi
}

follow_args() {
  if [[ "$FOLLOW" == "true" ]]; then
    printf '%s\n' --follow
  fi
}

action_tail_transform() {
  local -a filter_args=()
  local -a follow_arg=()
  mapfile -t filter_args < <(log_filter_args)
  mapfile -t follow_arg < <(follow_args)

  print_section "Transform/Filter Lambda Logs"
  aws logs tail \
    "/aws/lambda/${PREFIX}-client-transform-filter" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since "$LOG_SINCE" \
    --format short \
    "${follow_arg[@]}" \
    "${filter_args[@]}"
}

action_tail_https_client() {
  require_client_id
  local -a filter_args=()
  local -a follow_arg=()
  mapfile -t filter_args < <(log_filter_args)
  mapfile -t follow_arg < <(follow_args)

  print_section "HTTPS Client Lambda Logs"
  aws logs tail \
    "/aws/lambda/${PREFIX}-https-client-${CLIENT_ID}" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since "$LOG_SINCE" \
    --format short \
    "${follow_arg[@]}" \
    "${filter_args[@]}"
}

action_tail_webhook() {
  local -a filter_args=()
  local -a follow_arg=()
  mapfile -t filter_args < <(log_filter_args)
  mapfile -t follow_arg < <(follow_args)

  print_section "Mock Webhook Lambda Logs"
  aws logs tail \
    "/aws/lambda/${PREFIX}-mock-webhook" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since "$LOG_SINCE" \
    --format short \
    "${follow_arg[@]}" \
    "${filter_args[@]}"
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

  local -a follow_arg=()
  mapfile -t follow_arg < <(follow_args)

  print_section "EventBridge Pipe Logs"
  aws logs tail \
    "$pipe_log_group_name" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --since "$LOG_SINCE" \
    --format short \
    "${follow_arg[@]}" \
    "${filter_args[@]}"
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
  tail-https-client)
    action_tail_https_client
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
    echo "Actions: queue-status, queue-peek, tail-transform, tail-https-client, tail-webhook, tail-pipe, pipe-state" >&2
    exit 1
    ;;
esac
