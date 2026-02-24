/**
 * JSON:API message wrapper containing callback data
 */
export interface CallbackMessage<T> {
  data: T[];
}

/**
 * JSON:API callback payload (MessageStatus or ChannelStatus)
 */
export interface CallbackPayload {
  type: "MessageStatus" | "ChannelStatus";
  id: string;
  attributes: Record<string, unknown>;
}

/**
 * Lambda response structure
 */
export interface LambdaResponse {
  message: string;
  receivedCount?: number;
}
