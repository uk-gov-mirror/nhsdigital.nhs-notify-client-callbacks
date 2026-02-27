/**
 * Message-level statuses
 */
export type MessageStatus =
  | "FAILED"
  | "PENDING_ENRICHMENT"
  | "DELIVERED"
  | "ENRICHED"
  | "SENDING";

/**
 * Channel-level statuses
 */
export type ChannelStatus =
  | "ASSIGNING_BATCH"
  | "CREATED"
  | "SENDING"
  | "DELIVERED"
  | "FAILED"
  | "RETRY"
  | "SKIPPED"
  | "STALE_PDS";

/**
 * Supplier-reported statuses
 */
export type SupplierStatus =
  | "accepted"
  | "cancelled"
  | "created"
  | "delivered"
  | "dispatched"
  | "enclosed"
  | "failed"
  | "forwarded"
  | "pending"
  | "printed"
  | "read"
  | "notification_attempted"
  | "notified"
  | "rejected"
  | "returned"
  | "sending"
  | "sent"
  | "received"
  | "permanent_failure"
  | "temporary_failure"
  | "technical_failure"
  | "unnotified"
  | "unknown";
