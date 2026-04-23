import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { awaitCallbacks } from "./helpers/cloudwatch";
import {
  createChannelStatusPublishEvent,
  createMessageStatusPublishEvent,
} from "./helpers/event-factories";
import {
  buildMockWebhookTargetPath,
  buildMockWebhookTargetPaths,
  getClientConfig,
} from "./helpers/mock-client-config";
import { assertCallbackHeaders } from "./helpers/signature";
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

describe("SQS to Webhook Integration", () => {
  let ctx: TestContext;
  let clientDlqUrl: string;
  let clientDeliveryUrl: string;

  beforeAll(async () => {
    ctx = createTestContext();
    const { clientId } = getClientConfig("clientSingleTarget");
    clientDlqUrl = ctx.clientDlqUrl(clientId);
    clientDeliveryUrl = ctx.clientDeliveryUrl(clientId);
    await purgeQueues(ctx.sqs, [
      ctx.inboundDlqUrl,
      clientDlqUrl,
      clientDeliveryUrl,
      ctx.inboundQueueUrl,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(ctx.sqs, [
      ctx.inboundDlqUrl,
      clientDlqUrl,
      clientDeliveryUrl,
      ctx.inboundQueueUrl,
    ]);
    destroyTestContext(ctx);
  });

  describe("Message Status Event Flow", () => {
    it("should process message status event from SQS to webhook", async () => {
      const event = createMessageStatusPublishEvent();

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const [callback] = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        1,
        ctx.startTime,
      );

      expect(callback.payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({ messageStatus: "delivered" }),
      });
      assertCallbackHeaders(callback);
    }, 120_000);

    it("should fan out a message status event to subscription with multiple target endpoints", async () => {
      const fanOutConfig = getClientConfig("clientFanOut");
      const expectedPaths = buildMockWebhookTargetPaths("clientFanOut");

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { clientId: fanOutConfig.clientId },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const callbacks = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        expectedPaths.length,
        ctx.startTime,
      );

      const sortedPaths = callbacks
        .map((cb) => cb.path)
        .toSorted((a, b) => String(a).localeCompare(String(b)));
      expect(sortedPaths).toEqual(
        expectedPaths.toSorted((a, b) => String(a).localeCompare(String(b))),
      );

      for (const callback of callbacks) {
        expect(callback.payload).toMatchObject({
          type: "MessageStatus",
          attributes: expect.objectContaining({
            messageId: event.data.messageId,
            messageStatus: "delivered",
          }),
        });
        assertCallbackHeaders(
          callback,
          fanOutConfig.apiKeyVar,
          fanOutConfig.applicationIdVar,
        );
      }
    }, 120_000);
  });

  describe("Channel Status Event Flow", () => {
    it("should process channel status event from SQS to webhook", async () => {
      const event: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent();

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const [callback] = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "ChannelStatus",
        1,
        ctx.startTime,
      );

      expect(callback.payload).toMatchObject({
        type: "ChannelStatus",
        attributes: expect.objectContaining({
          channel: "nhsapp",
          channelStatus: "delivered",
          supplierStatus: "delivered",
          messageId: event.data.messageId,
        }),
      });
      assertCallbackHeaders(callback);
    }, 120_000);
  });

  describe("Client Webhook DLQ", () => {
    it("should route a non-retriable (4xx) webhook response to the per-client DLQ", async () => {
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { messageId: `force-400-${crypto.randomUUID()}` },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(ctx.sqs, clientDlqUrl);

      expect(dlqMessage.Body).toBeDefined();
      expect(dlqMessage.MessageAttributes?.ERROR_CODE?.StringValue).toBe(
        "HTTP_CLIENT_ERROR",
      );
      expect(
        dlqMessage.MessageAttributes?.ERROR_MESSAGE?.StringValue,
      ).toContain("Forced status 400");

      await deleteMessage(ctx.sqs, clientDlqUrl, dlqMessage);
    }, 120_000);
  });

  describe("Inbound Event DLQ", () => {
    it("should move an invalid inbound event to the inbound-event DLQ when schema validation fails", async () => {
      const messageId = `invalid-schema-${crypto.randomUUID()}`;
      const invalidEvent = createMessageStatusPublishEvent({
        data: {
          messageId,
          // @ts-expect-error - intentionally invalid for schema-failure DLQ path
          channels: [{ channelStatus: "DELIVERED" }],
        },
      });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, invalidEvent);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const dlqMessage = await awaitQueueMessageByMessageId(
        ctx.sqs,
        ctx.inboundDlqUrl,
        messageId,
      );

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.data.messageId).toBe(messageId);

      await deleteMessage(ctx.sqs, ctx.inboundDlqUrl, dlqMessage);
    }, 120_000);
  });

  describe("mTLS Delivery", () => {
    it("should deliver a callback via mTLS to the mTLS-secured mock webhook", async () => {
      const mtlsConfig = getClientConfig("clientMtls");

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { clientId: mtlsConfig.clientId },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const [callback] = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        1,
        ctx.startTime,
      );

      expect(callback.path).toBe(buildMockWebhookTargetPath("clientMtls"));
      expect(callback.isMtls).toBe(true);
      expect(callback.payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageId: event.data.messageId,
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(
        callback,
        mtlsConfig.apiKeyVar,
        mtlsConfig.applicationIdVar,
      );
    }, 120_000);
  });
});
