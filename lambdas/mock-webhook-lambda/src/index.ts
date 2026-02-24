import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import pino from "pino";
import type { CallbackMessage, CallbackPayload, LambdaResponse } from "types";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || "unknown";

  logger.info({
    correlationId,
    msg: "Mock webhook invoked",
    path: event.path,
    method: event.httpMethod,
  });

  if (!event.body) {
    logger.error({
      correlationId,
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
        correlationId,
        msg: "Invalid message structure - missing or invalid data array",
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid message structure" }),
      };
    }

    // Log each callback in a format that can be queried from CloudWatch
    for (const message of messages.data) {
      const messageId = message.attributes.messageId as string | undefined;
      const messageType = message.type;

      logger.info({
        correlationId,
        messageId,
        messageType,
        msg: `CALLBACK ${messageId} ${messageType} : ${JSON.stringify(message)}`,
      });
    }

    const response: LambdaResponse = {
      message: "Callback received",
      receivedCount: messages.data.length,
    };

    logger.info({
      correlationId,
      receivedCount: messages.data.length,
      msg: "Callbacks logged successfully",
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error({
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      msg: "Failed to process callback",
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
}
