import { CloudEvent, ValidationError } from "cloudevents";
import { EventTypes } from "models/status-transition-event";

/**
 * Validates if a string is a valid RFC 3339 timestamp
 * Used for custom NHS Notify extension attributes not validated by CloudEvents SDK
 */
function isValidRFC3339(timestamp: string): boolean {
  // Check basic format first with a safe pattern
  if (typeof timestamp !== "string" || timestamp.length < 20) {
    return false;
  }

  // Verify it's a valid date using native parser
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  // Basic format validation without potentially catastrophic regex
  const parts = timestamp.split("T");
  if (parts.length !== 2) {
    return false;
  }

  const datePart = parts[0];
  const timePart = parts[1];

  // Validate date part: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return false;
  }

  // Validate time part has required components
  const hasTimeZone =
    timePart.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(timePart);
  const hasTimeFormat = /^\d{2}:\d{2}:\d{2}/.test(timePart);

  return hasTimeZone && hasTimeFormat;
}

/**
 * Checks if event type is a message status event
 */
function isMessageStatusEvent(type: string): boolean {
  return type === EventTypes.MESSAGE_STATUS_TRANSITIONED;
}

/**
 * Checks if event type is a channel status event
 */
function isChannelStatusEvent(type: string): boolean {
  return type === EventTypes.CHANNEL_STATUS_TRANSITIONED;
}

/**
 * Validates NHS Notify-specific CloudEvents extension attributes
 */
function validateNHSNotifyExtensions(event: any): void {
  // traceparent
  if (!event.traceparent) {
    throw new Error("traceparent is required");
  }
}

/**
 * Validates event type matches NHS Notify namespace
 */
function validateEventTypeNamespace(type: string): void {
  if (!type.startsWith("uk.nhs.notify.client-callbacks.")) {
    throw new Error(
      "type must match namespace uk.nhs.notify.client-callbacks.*",
    );
  }
}

/**
 * Validates data exists
 */
function validateDataExists(data: any): void {
  if (!data) {
    throw new Error("data is required");
  }
}

/**
 * Validates required fields in data for filtering
 */
function validateDataRequiredFields(data: any): void {
  if (!data.clientId) {
    throw new Error("data.clientId is required");
  }

  if (!data.messageId) {
    throw new Error("data.messageId is required");
  }

  if (!data.timestamp) {
    throw new Error("data.timestamp is required");
  }

  if (!isValidRFC3339(data.timestamp)) {
    throw new Error("data.timestamp must be a valid RFC 3339 timestamp");
  }
}

/**
 * Validates message status specific fields
 */
function validateMessageStatusFields(data: any): void {
  if (!data.messageStatus) {
    throw new Error("data.messageStatus is required for message status events");
  }

  if (!data.channels) {
    throw new Error("data.channels is required for message status events");
  }

  if (!Array.isArray(data.channels)) {
    throw new TypeError("data.channels must be an array");
  }

  if (data.channels.length === 0) {
    throw new Error("data.channels must have at least one channel");
  }

  // Validate each channel in the array
  for (let index = 0; index < data.channels.length; index++) {
    // eslint-disable-next-line security/detect-object-injection
    const channel = data.channels[index];
    if (!channel?.type) {
      throw new Error(`data.channels[${index}].type is required`);
    }
    if (!channel.channelStatus) {
      throw new Error(`data.channels[${index}].channelStatus is required`);
    }
  }
}

/**
 * Validates channel status specific fields
 */
function validateChannelStatusFields(data: any): void {
  if (!data.channel) {
    throw new Error("data.channel is required for channel status events");
  }

  if (!data.channelStatus) {
    throw new Error("data.channelStatus is required for channel status events");
  }

  if (!data.supplierStatus) {
    throw new Error(
      "data.supplierStatus is required for channel status events",
    );
  }
}

/**
 * Validates a Status Transition Event against the CloudEvents schema
 * and NHS Notify notify-payload structure.
 *
 * Uses the official CloudEvents SDK for standard attribute validation,
 * with additional NHS Notify-specific extension and payload validation.
 *
 * @param event - The event to validate
 * @throws Error if validation fails with detailed error message
 */
export function validateStatusTransitionEvent(event: unknown): void {
  try {
    // CloudEvent constructor validates standard CloudEvents attributes:
    // - specversion (must be "1.0")
    // - id (required, must be valid format)
    // - source (required, must be valid URI-reference)
    // - type (required, must be valid format)
    // - time (if present, must be valid RFC 3339 timestamp)
    // - datacontenttype (if present, must be valid media type)
    const ce = new CloudEvent(event, /* strict validation */ true);

    // Validate NHS Notify-specific extension attributes
    validateNHSNotifyExtensions(event);

    // Validate event type namespace
    validateEventTypeNamespace(ce.type);

    // Validate datacontenttype is application/json
    if (ce.datacontenttype !== "application/json") {
      throw new Error("datacontenttype must be 'application/json'");
    }

    // Validate data exists
    validateDataExists(ce.data);

    // Validate data required fields
    validateDataRequiredFields(ce.data);

    // Validate event type-specific fields
    if (isMessageStatusEvent(ce.type)) {
      validateMessageStatusFields(ce.data);
    } else if (isChannelStatusEvent(ce.type)) {
      validateChannelStatusFields(ce.data);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new TypeError(`CloudEvents validation failed: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new TypeError(`CloudEvents validation failed: ${String(error)}`);
  }
}
