import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { awaitCallback, awaitEmfMetrics } from "./helpers/cloudwatch";
import { createMessageStatusPublishEvent } from "./helpers/event-factories";
import { getClientConfig } from "./helpers/mock-client-config";
import {
  awaitQueueMessage,
  awaitQueueMessageByMessageId,
  deleteMessage,
  ensureInboundQueueIsEmpty,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "./helpers/test-context";

describe("Metrics", () => {
  let ctx: TestContext;
  let clientDlqUrl: string;
  let transformFilterLogGroup: string;

  beforeAll(async () => {
    ctx = createTestContext();
    const { clientId } = getClientConfig("clientSingleTarget");

    clientDlqUrl = ctx.clientDlqUrl(clientId);
    transformFilterLogGroup = ctx.logGroup("client-transform-filter");

    await purgeQueues(ctx.sqs, [
      ctx.inboundDlqUrl,
      clientDlqUrl,
      ctx.inboundQueueUrl,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(ctx.sqs, [
      ctx.inboundDlqUrl,
      clientDlqUrl,
      ctx.inboundQueueUrl,
    ]);
    destroyTestContext(ctx);
  });

  describe("Successful event processing", () => {
    it("should emit processing metrics when a valid event is fully processed", async () => {
      const startTime = Date.now();
      const event = createMessageStatusPublishEvent();

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      await awaitCallback(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        startTime,
      );

      await expect(
        awaitEmfMetrics(
          ctx.cwLogs,
          transformFilterLogGroup,
          [
            "EventsReceived",
            "TransformationsSuccessful",
            "FilteringStarted",
            "FilteringMatched",
            "CallbacksInitiated",
          ],
          startTime,
        ),
      ).resolves.toBeUndefined();
    }, 120_000);
  });

  describe("Validation error", () => {
    it("should emit ValidationErrors metric when an invalid event fails schema validation", async () => {
      const startTime = Date.now();
      const messageId = `invalid-schema-metrics-${crypto.randomUUID()}`;
      const invalidEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            messageId,
            // @ts-expect-error - intentionally invalid: missing required channel type field
            channels: [{ channelStatus: "DELIVERED" }],
          },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, invalidEvent);

      const dlqMessage = await awaitQueueMessageByMessageId(
        ctx.sqs,
        ctx.inboundDlqUrl,
        messageId,
      );

      expect(dlqMessage.Body).toBeDefined();
      await deleteMessage(ctx.sqs, ctx.inboundDlqUrl, dlqMessage);

      await awaitEmfMetrics(
        ctx.cwLogs,
        transformFilterLogGroup,
        ["EventsReceived", "ValidationErrors"],
        startTime,
      );
    }, 120_000);
  });

  describe("HTTPS Client Lambda metrics", () => {
    let httpsClientLogGroup: string;

    beforeAll(() => {
      const { clientId } = getClientConfig("clientSingleTarget");
      httpsClientLogGroup = ctx.clientLogGroup(`https-client-${clientId}`);
    });

    it("should emit DeliveryAttempt, DeliverySuccess and DeliveryDurationMs on successful delivery", async () => {
      const startTime = Date.now();
      const event = createMessageStatusPublishEvent();

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      await awaitCallback(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        startTime,
      );

      await expect(
        awaitEmfMetrics(
          ctx.cwLogs,
          httpsClientLogGroup,
          ["DeliveryAttempt", "DeliverySuccess", "DeliveryDurationMs"],
          startTime,
        ),
      ).resolves.toBeUndefined();
    }, 120_000);

    it("should emit DeliveryAttempt, DeliveryPermanentFailure and DeliveryDurationMs on 4xx response", async () => {
      const startTime = Date.now();
      const messageId = `force-400-metrics-${crypto.randomUUID()}`;

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { messageId },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(ctx.sqs, clientDlqUrl, 90_000);

      expect(dlqMessage.Body).toBeDefined();
      await deleteMessage(ctx.sqs, clientDlqUrl, dlqMessage);

      await expect(
        awaitEmfMetrics(
          ctx.cwLogs,
          httpsClientLogGroup,
          ["DeliveryAttempt", "DeliveryPermanentFailure", "DeliveryDurationMs"],
          startTime,
        ),
      ).resolves.toBeUndefined();
    }, 120_000);
  });
});
