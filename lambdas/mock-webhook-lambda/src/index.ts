import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import type { CallbackMessage, CallbackPayload, LambdaResponse } from "types";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

function isValidCallbackPayload(payload: unknown): payload is CallbackPayload {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return false;
  }

  const candidate = payload as {
    type?: unknown;
    attributes?: unknown;
  };

  return (
    (candidate.type === "MessageStatus" ||
      candidate.type === "ChannelStatus") &&
    typeof candidate.attributes === "object" &&
    candidate.attributes !== null &&
    !Array.isArray(candidate.attributes) &&
    typeof (candidate.attributes as Record<string, unknown>).messageId ===
      "string"
  );
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  logger.info({ event }, "Received event");

  logger.info({
    msg: "Mock webhook invoked",
    path: event.path,
    method: event.httpMethod,
  });

  if (!event.body) {
    logger.error({
      msg: "No event body received",
    });

    const response: LambdaResponse = {
      message: "No body",
    };

    return {
      statusCode: 400,
      body: JSON.stringify(response),
    };
  }

  try {
    const messages = JSON.parse(event.body) as CallbackMessage<CallbackPayload>;

    if (!messages.data || !Array.isArray(messages.data)) {
      logger.error({
        msg: "Invalid message structure - missing or invalid data array",
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      };
    }

    if (!messages.data.every((payload) => isValidCallbackPayload(payload))) {
      logger.error({
        msg: "Invalid message structure - invalid callback payload",
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      };
    }

    // Log each callback in a format that can be queried from CloudWatch
    for (const message of messages.data) {
      const messageType = message.type;
      const correlationId = message.attributes.messageId as string | undefined;
      logger.info({
        correlationId,
        messageType,
        msg: `CALLBACK ${correlationId} ${messageType} : ${JSON.stringify(message)}`,
      });
    }

    const response: LambdaResponse = {
      message: "Callback received",
      receivedCount: messages.data.length,
    };

    logger.info({
      receivedCount: messages.data.length,
      msg: "Callbacks logged successfully",
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error({
        error: error.message,
        msg: "Invalid JSON body",
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid JSON body" }),
      };
    }

    logger.error({
      error: error instanceof Error ? error.message : String(error),
      msg: "Failed to process callback",
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
}
