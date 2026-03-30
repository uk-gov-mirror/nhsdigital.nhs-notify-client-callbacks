import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from "@nhs-notify-client-callbacks/logger";
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
  const eventWithFunctionUrlFields = event as APIGatewayProxyEvent & {
    rawPath?: string;
    requestContext?: { http?: { method?: string } };
  };
  const headers = Object.fromEntries(
    Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
  ) as Record<string, string | undefined>;

  const path = event.path ?? eventWithFunctionUrlFields.rawPath;

  logger.info("Mock webhook invoked", {
    path,
    method: event.httpMethod,
    hasBody: Boolean(event.body),
    "x-api-key": headers["x-api-key"],
    "x-hmac-sha256-signature": headers["x-hmac-sha256-signature"],
    payload: event.body,
  });

  const expectedApiKey = process.env.API_KEY;
  const providedApiKey = headers["x-api-key"];

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    logger.error("Unauthorized: invalid or missing x-api-key");
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
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

    logger.info("Mock webhook parsed payload", { parsedPayload: parsed });

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

    logger.info("Callback received", {
      correlationId,
      messageId,
      callbackType: item.type,
      path,
      apiKey: providedApiKey,
      signature: headers["x-hmac-sha256-signature"] ?? "",
      payload: JSON.stringify(item),
    });

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
  return buildResponse(event);
}
