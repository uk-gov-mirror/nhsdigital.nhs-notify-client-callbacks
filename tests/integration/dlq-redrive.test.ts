import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { awaitCallbacks } from "./helpers/cloudwatch";
import { createMessageStatusPublishEvent } from "./helpers/event-factories";
import {
  CLIENT_FIXTURES,
  type ClientFixtureKey,
  getClientConfig,
} from "./helpers/mock-client-config";
import sendEventToDlqAndRedrive from "./helpers/redrive";
import { assertCallbackHeaders } from "./helpers/signature";
import {
  awaitQueueMessage,
  deleteMessage,
  ensureInboundQueueIsEmpty,
  getQueueDepth,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "./helpers/test-context";

describe("DLQ Redrive", () => {
  let ctx: TestContext;
  let dlqUrl: string;
  let deliveryUrl: string;
  let allDlqUrls: string[];

  beforeAll(async () => {
    ctx = createTestContext();
    const { clientId } = getClientConfig("clientSingleTarget");

    dlqUrl = ctx.clientDlqUrl(clientId);
    deliveryUrl = ctx.clientDeliveryUrl(clientId);
    allDlqUrls = (Object.keys(CLIENT_FIXTURES) as ClientFixtureKey[]).map(
      (key) => ctx.clientDlqUrl(getClientConfig(key).clientId),
    );

    await purgeQueues(ctx.sqs, [
      ctx.inboundQueueUrl,
      deliveryUrl,
      ...allDlqUrls,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(ctx.sqs, [
      ctx.inboundQueueUrl,
      deliveryUrl,
      ...allDlqUrls,
    ]);
    destroyTestContext(ctx);
  });

  describe("Infrastructure validation", () => {
    it("should confirm a DLQ is accessible for all configured clients", async () => {
      const depths = await Promise.all(
        allDlqUrls.map((url) => getQueueDepth(ctx.sqs, url)),
      );

      for (const depth of depths) {
        expect(depth).toBeGreaterThanOrEqual(0);
      }
    });

    it("should confirm the inbound event queue exists and is accessible", async () => {
      const depth = await getQueueDepth(ctx.sqs, ctx.inboundQueueUrl);
      expect(depth).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Redrive workflow", () => {
    it("should successfully reprocess an event moved from the DLQ back to the inbound queue", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      const { payload: redrivePayload } = await sendEventToDlqAndRedrive(
        ctx.sqs,
        dlqUrl,
        ctx.inboundQueueUrl,
        event,
      );

      expect(redrivePayload.id).toBe(event.id);
      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      const [callback] = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        event.data.messageId,
        "MessageStatus",
        1,
        startTime,
      );

      expect(callback.payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(callback);
    }, 120_000);

    it("should apply the same transformation logic to redriven events as original deliveries", async () => {
      const startTime = Date.now();
      const directEventId = `direct-${crypto.randomUUID()}`;
      const redriveEventId = `redriven-${crypto.randomUUID()}`;

      const directEvent = createMessageStatusPublishEvent({
        event: { id: directEventId },
        data: {
          messageId: `msg-${directEventId}`,
          messageReference: `ref-${directEventId}`,
          messageStatusDescription: "Transformation consistency test",
        },
      });

      const redriveEvent = createMessageStatusPublishEvent({
        event: { id: redriveEventId },
        data: {
          messageId: `msg-${redriveEventId}`,
          messageReference: `ref-${redriveEventId}`,
          messageStatusDescription: "Transformation consistency test",
        },
      });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, directEvent);

      const { payload: dlqPayload } = await sendEventToDlqAndRedrive(
        ctx.sqs,
        dlqUrl,
        ctx.inboundQueueUrl,
        redriveEvent,
      );

      expect(dlqPayload.data.messageId).toBe(redriveEvent.data.messageId);

      const [directCallback, redriveCallback] = await Promise.all([
        awaitCallbacks(
          ctx.cwLogs,
          ctx.webhookLogGroup,
          directEvent.data.messageId,
          "MessageStatus",
          1,
          startTime,
        ),
        awaitCallbacks(
          ctx.cwLogs,
          ctx.webhookLogGroup,
          redriveEvent.data.messageId,
          "MessageStatus",
          1,
          startTime,
        ),
      ]).then(([d, r]) => [d[0], r[0]]);

      await ensureInboundQueueIsEmpty(ctx.sqs, ctx.inboundQueueUrl);

      expect(redriveCallback.payload).toMatchObject({
        type: directCallback.payload.type,
        attributes: expect.objectContaining({
          messageStatus: (
            directCallback.payload.attributes as { messageStatus?: string }
          ).messageStatus,
        }),
      });
      assertCallbackHeaders(redriveCallback);
    }, 120_000);
  });

  describe("Delivery DLQ redrive", () => {
    it("should redrive a 4xx-failed message from the delivery DLQ back through the delivery queue", async () => {
      const redriveStartTime = Date.now();
      const forceMessageId = `force-400-redrive-${crypto.randomUUID()}`;

      const failingEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { messageId: forceMessageId },
        });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, failingEvent);

      const dlqMessage = await awaitQueueMessage(ctx.sqs, dlqUrl, 90_000);

      expect(dlqMessage.Body).toBeDefined();
      expect(dlqMessage.MessageAttributes?.ERROR_CODE?.StringValue).toBe(
        "HTTP_CLIENT_ERROR",
      );

      const dlqBody = JSON.parse(dlqMessage.Body as string) as {
        payload: { data: { attributes: { messageId: string } }[] };
        subscriptionId: string;
        targetId: string;
      };

      const redriveMessageId = `redriven-dlq-${crypto.randomUUID()}`;
      dlqBody.payload.data[0].attributes.messageId = redriveMessageId;

      await sendSqsEvent(ctx.sqs, deliveryUrl, dlqBody);
      await deleteMessage(ctx.sqs, dlqUrl, dlqMessage);

      const [callback] = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        redriveMessageId,
        "MessageStatus",
        1,
        redriveStartTime,
      );

      expect(callback.payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageId: redriveMessageId,
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(callback);
    }, 180_000);
  });
});
