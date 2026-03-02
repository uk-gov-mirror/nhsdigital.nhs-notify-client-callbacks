import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

function isClientCallbackPayload(
  value: unknown,
): value is ClientCallbackPayload {
  if (
    typeof value !== "object" ||
    value === null ||
    !("data" in value) ||
    !Array.isArray((value as { data: unknown }).data)
  ) {
    return false;
  }

  const items = (value as { data: unknown[] }).data;
  return items.every((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return (
      (candidate.type === "MessageStatus" ||
        candidate.type === "ChannelStatus") &&
      typeof candidate.attributes === "object" &&
      candidate.attributes !== null &&
      typeof (candidate.attributes as Record<string, unknown>).messageId ===
        "string"
    );
  });
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

    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No body" }),
    };
  }

  try {
    const parsed = JSON.parse(event.body) as unknown;

    if (!isClientCallbackPayload(parsed)) {
      logger.error({
        msg: "Invalid message structure - missing or invalid data array",
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      };
    }

    // Log each callback in a format that can be queried from CloudWatch
    for (const item of parsed.data) {
      const { messageId } = item.attributes;
      logger.info({
        correlationId: messageId,
        messageType: item.type,
        msg: `CALLBACK ${messageId} ${item.type} : ${JSON.stringify(item)}`,
      });
    }

    logger.info({
      receivedCount: parsed.data.length,
      msg: "Callbacks logged successfully",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Callback received",
        receivedCount: parsed.data.length,
      }),
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
