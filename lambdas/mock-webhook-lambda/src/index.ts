import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger, flushLogs } from "@nhs-notify-client-callbacks/logger";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

const logger = new Logger();

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

async function buildResponse(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  logger.info("Mock webhook invoked", {
    path: event.path,
    method: event.httpMethod,
  });

  const expectedApiKey = process.env.API_KEY;
  const providedApiKey = event.headers["x-api-key"];

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    logger.error("Unauthorized: invalid or missing x-api-key");
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  if (!event.headers["x-hmac-sha256-signature"]) {
    logger.error("Bad request: missing x-hmac-sha256-signature header");
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing x-hmac-sha256-signature" }),
    };
  }

  if (!event.body) {
    logger.error("No event body received");

    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No body" }),
    };
  }

  try {
    const parsed = JSON.parse(event.body) as unknown;

    if (!isClientCallbackPayload(parsed)) {
      logger.error("Invalid message structure - missing or invalid data array");

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      };
    }

    if (parsed.data.length !== 1) {
      logger.error("Expected exactly 1 callback item in data array", {
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
    const { messageId } = item.attributes;
    const forcedStatusMatch = /^force-(\d{3})-/.exec(messageId);
    if (forcedStatusMatch) {
      const statusCode = Number(forcedStatusMatch[1]);
      logger.info("Forced status code response", {
        correlationId,
        messageId,
        statusCode,
      });
      return {
        statusCode,
        body: JSON.stringify({ message: `Forced status ${statusCode}` }),
      };
    }

    logger.info(
      `CALLBACK ${correlationId} ${item.type} : ${JSON.stringify(item)}`,
      {
        correlationId,
        messageType: item.type,
      },
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Callback received" }),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error("Invalid JSON body", { error: error.message });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid JSON body" }),
      };
    }

    logger.error("Failed to process callback", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const response = await buildResponse(event);
  await flushLogs();
  return response;
}
