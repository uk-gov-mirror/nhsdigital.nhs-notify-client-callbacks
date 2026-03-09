import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  pino.destination({ sync: true }),
);

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

  const expectedApiKey = process.env.API_KEY;
  const providedApiKey = event.headers["x-api-key"];

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    logger.error({ msg: "Unauthorized: invalid or missing x-api-key" });
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

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

    if (parsed.data.length !== 1) {
      logger.error({
        msg: "Expected exactly 1 callback item in data array",
        receivedCount: parsed.data.length,
      });

      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Expected exactly 1 callback item, got ${parsed.data.length}`,
        }),
      };
    }

    const [item] = parsed.data;
    const correlationId = item.meta.idempotencyKey;
    logger.info({
      correlationId,
      messageType: item.type,
      msg: `CALLBACK ${correlationId} ${item.type} : ${JSON.stringify(item)}`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Callback received" }),
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
