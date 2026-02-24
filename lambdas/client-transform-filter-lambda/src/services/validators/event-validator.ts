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
  // profileversion
  if (!event.profileversion) {
    throw new Error("profileversion is required");
  }
  if (event.profileversion !== "1.0.0") {
    throw new Error("profileversion must be '1.0.0'");
  }

  // profilepublished
  if (!event.profilepublished) {
    throw new Error("profilepublished is required");
  }
  if (!/^\d{4}-\d{2}$/.test(event.profilepublished)) {
    throw new Error("profilepublished must be in format YYYY-MM");
  }

  // recordedtime (optional in CloudEvents, required in NHS Notify)
  if (!event.recordedtime) {
    throw new Error("recordedtime is required");
  }
  if (!isValidRFC3339(event.recordedtime)) {
    throw new Error("recordedtime must be a valid RFC 3339 timestamp");
  }
  if (new Date(event.recordedtime) < new Date(event.time)) {
    throw new Error("recordedtime must be >= time");
  }

  // severitynumber
  if (event.severitynumber === undefined || event.severitynumber === null) {
    throw new Error("severitynumber is required");
  }

  // severitytext
  if (!event.severitytext) {
    throw new Error("severitytext is required");
  }

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
 * Validates notify-payload wrapper structure
 */
function validateNotifyPayloadWrapper(data: any): void {
  if (!data) {
    throw new Error("data is required");
  }

  if (!data["notify-payload"]) {
    throw new Error("data.notify-payload is required");
  }

  if (!data["notify-payload"]["notify-data"]) {
    throw new Error("data.notify-payload.notify-data is required");
  }

  if (!data["notify-payload"]["notify-metadata"]) {
    throw new Error("data.notify-payload.notify-metadata is required");
  }
}

/**
 * Validates required fields in notify-data for filtering
 */
function validateNotifyDataRequiredFields(data: any): void {
  const notifyData = data["notify-payload"]["notify-data"];

  if (!notifyData.clientId) {
    throw new Error("notify-data.clientId is required");
  }

  if (!notifyData.messageId) {
    throw new Error("notify-data.messageId is required");
  }

  if (!notifyData.timestamp) {
    throw new Error("notify-data.timestamp is required");
  }

  if (!isValidRFC3339(notifyData.timestamp)) {
    throw new Error("notify-data.timestamp must be a valid RFC 3339 timestamp");
  }
}

/**
 * Validates message status specific fields
 */
function validateMessageStatusFields(data: any): void {
  const notifyData = data["notify-payload"]["notify-data"];

  if (!notifyData.messageStatus) {
    throw new Error(
      "notify-data.messageStatus is required for message status events",
    );
  }

  if (!notifyData.channels) {
    throw new Error(
      "notify-data.channels is required for message status events",
    );
  }

  if (!Array.isArray(notifyData.channels)) {
    throw new TypeError("notify-data.channels must be an array");
  }

  if (notifyData.channels.length === 0) {
    throw new Error("notify-data.channels must have at least one channel");
  }

  // Validate each channel in the array
  for (let index = 0; index < notifyData.channels.length; index++) {
    // eslint-disable-next-line security/detect-object-injection
    const channel = notifyData.channels[index];
    if (!channel?.type) {
      throw new Error(`notify-data.channels[${index}].type is required`);
    }
    if (!channel.channelStatus) {
      throw new Error(
        `notify-data.channels[${index}].channelStatus is required`,
      );
    }
  }
}

/**
 * Validates channel status specific fields
 */
function validateChannelStatusFields(data: any): void {
  const notifyData = data["notify-payload"]["notify-data"];

  if (!notifyData.channel) {
    throw new Error(
      "notify-data.channel is required for channel status events",
    );
  }

  if (!notifyData.channelStatus) {
    throw new Error(
      "notify-data.channelStatus is required for channel status events",
    );
  }

  if (!notifyData.supplierStatus) {
    throw new Error(
      "notify-data.supplierStatus is required for channel status events",
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
export function validateStatusTransitionEvent(event: any): void {
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

    // Validate notify-payload wrapper structure
    validateNotifyPayloadWrapper(ce.data);

    // Validate notify-data required fields
    validateNotifyDataRequiredFields(ce.data);

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
