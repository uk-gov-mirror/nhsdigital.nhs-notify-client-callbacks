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
  attributes: {
    messageId: string;
    [key: string]: unknown;
  };
  links: {
    message: string;
  };
  meta: {
    idempotencyKey: string;
  };
}

/**
 * Lambda response structure
 */
export interface LambdaResponse {
  message: string;
  receivedCount?: number;
}
