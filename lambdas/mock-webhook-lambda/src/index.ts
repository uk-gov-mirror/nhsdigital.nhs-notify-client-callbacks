import { X509Certificate } from "node:crypto";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from "@nhs-notify-client-callbacks/logger";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

const logger = new Logger();

function verifyClientCertificate(certHeader: string | undefined): {
  valid: boolean;
  reason?: string;
} {
  if (!certHeader) {
    return { valid: false, reason: "No client certificate provided" };
  }
  try {
    const pem = decodeURIComponent(certHeader);
    const cert = new X509Certificate(pem);
    const now = new Date();
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) {
      return {
        valid: false,
        reason: "Client certificate is not within its validity period",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "Failed to parse client certificate" };
  }
}

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

type EventWithContextFields = APIGatewayProxyEvent & {
  rawPath?: string;
  requestContext?: {
    http?: { method?: string };
    elb?: { targetGroupArn: string };
  };
};

function normalizeHeaders(
  event: APIGatewayProxyEvent,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(event.headers).map(([k, v]) => [String(k).toLowerCase(), v]),
  ) as Record<string, string | undefined>;
}

function resolveMtlsStatus(
  headers: Record<string, string | undefined>,
  isAlbInvocation: boolean,
): boolean {
  if (!isAlbInvocation) {
    return false;
  }

  const clientCertPresent = Boolean(headers["x-amzn-mtls-clientcert"]);
  const certResult = verifyClientCertificate(headers["x-amzn-mtls-clientcert"]);

  if (certResult.valid) {
    logger.info("mTLS client certificate verified", {
      fingerprint: headers["x-amzn-mtls-clientcert-fingerprint"] ?? "",
      isMtls: true,
    });
    return true;
  }

  logger.info("Mock webhook invoked without mTLS", {
    isMtls: false,
    clientCertPresent,
    reason: certResult.reason,
  });
  return false;
}

function authenticateApiKey(headers: Record<string, string | undefined>): {
  error: APIGatewayProxyResult | undefined;
} {
  const expectedApiKey = process.env.API_KEY;
  const providedApiKey = headers["x-api-key"];

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    logger.error("Unauthorized: invalid or missing x-api-key");
    return {
      error: {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" }),
      },
    };
  }

  return { error: undefined };
}

type ParseResult = {
  payload: ClientCallbackPayload | undefined;
  error: APIGatewayProxyResult | undefined;
};

function parseError(response: APIGatewayProxyResult): ParseResult {
  return { payload: undefined, error: response };
}

function parseAndValidateBody(body: string | null): ParseResult {
  if (!body) {
    logger.error("No event body received");
    return parseError({
      statusCode: 400,
      body: JSON.stringify({ message: "No body" }),
    });
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    logger.info("Mock webhook parsed payload", { parsedPayload: parsed });

    if (!isClientCallbackPayload(parsed)) {
      logger.error("Invalid message structure - missing or invalid data array");
      return parseError({
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      });
    }

    if (parsed.data.length !== 1) {
      logger.error("Expected exactly 1 callback item in data array", {
        receivedCount: parsed.data.length,
      });
      return parseError({
        statusCode: 400,
        body: JSON.stringify({
          message: `Expected exactly 1 callback item, got ${parsed.data.length}`,
        }),
      });
    }

    return { payload: parsed, error: undefined };
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error("Invalid JSON body", { error: error.message });
      return parseError({
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid JSON body" }),
      });
    }

    logger.error("Failed to process callback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return parseError({
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    });
  }
}

function checkForcedStatusResponse(
  messageId: string,
  correlationId: string,
): { response: APIGatewayProxyResult | undefined } {
  const timedMatch = /^force-(\d{3})-until-(\d+)-/.exec(messageId);
  if (timedMatch) {
    const statusCode = Number(timedMatch[1]);
    const until = Number(timedMatch[2]);
    if (Date.now() < until) {
      logger.info("Timed forced status code response", {
        correlationId,
        messageId,
        statusCode,
        until,
      });
      return {
        response: {
          statusCode,
          body: JSON.stringify({ message: `Forced status ${statusCode}` }),
        },
      };
    }
    return { response: undefined };
  }

  const permanentMatch = /^force-(\d{3})-/.exec(messageId);
  if (permanentMatch) {
    const statusCode = Number(permanentMatch[1]);
    logger.info("Forced status code response", {
      correlationId,
      messageId,
      statusCode,
    });
    return {
      response: {
        statusCode,
        body: JSON.stringify({ message: `Forced status ${statusCode}` }),
      },
    };
  }

  return { response: undefined };
}

async function buildResponse(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const eventWithContextFields = event as EventWithContextFields;
  const headers = normalizeHeaders(event);
  const path = event.path ?? eventWithContextFields.rawPath;
  const isAlbInvocation = Boolean(eventWithContextFields.requestContext?.elb);
  const clientCertPresent = Boolean(headers["x-amzn-mtls-clientcert"]);
  const isMtls = resolveMtlsStatus(headers, isAlbInvocation);

  logger.info("Mock webhook invoked", {
    path,
    method: event.httpMethod,
    hasBody: Boolean(event.body),
    isMtls,
    clientCertPresent,
    "x-api-key": headers["x-api-key"],
    "x-hmac-sha256-signature": headers["x-hmac-sha256-signature"],
    payload: event.body,
  });

  const authResult = authenticateApiKey(headers);
  if (authResult.error) {
    return authResult.error;
  }

  const bodyResult = parseAndValidateBody(event.body);
  if (bodyResult.error) {
    return bodyResult.error;
  }

  const [item] = bodyResult.payload!.data;
  const correlationId = item.meta.idempotencyKey;
  const { messageId } = item.attributes;

  const { response: forcedResponse } = checkForcedStatusResponse(
    messageId,
    correlationId,
  );
  if (forcedResponse) {
    return forcedResponse;
  }

  logger.info("Callback received", {
    correlationId,
    messageId,
    callbackType: item.type,
    path,
    isMtls,
    apiKey: headers["x-api-key"],
    signature: headers["x-hmac-sha256-signature"] ?? "",
    payload: JSON.stringify(item),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Callback received" }),
  };
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  return buildResponse(event);
}
