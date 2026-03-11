export const MESSAGE_STATUSES = [
  "FAILED",
  "PENDING_ENRICHMENT",
  "DELIVERED",
  "ENRICHED",
  "SENDING",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CHANNEL_STATUSES = [
  "ASSIGNING_BATCH",
  "CREATED",
  "SENDING",
  "DELIVERED",
  "FAILED",
  "RETRY",
  "SKIPPED",
  "STALE_PDS",
] as const;

export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const SUPPLIER_STATUSES = [
  "accepted",
  "cancelled",
  "created",
  "delivered",
  "dispatched",
  "enclosed",
  "failed",
  "forwarded",
  "pending",
  "printed",
  "read",
  "notification_attempted",
  "notified",
  "rejected",
  "returned",
  "sending",
  "sent",
  "received",
  "permanent_failure",
  "temporary_failure",
  "technical_failure",
  "unnotified",
  "unknown",
] as const;

export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];
