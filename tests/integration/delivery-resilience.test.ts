import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  awaitCallback,
  awaitCallbacks,
  countLogEntries,
} from "./helpers/cloudwatch";
import { createMessageStatusPublishEvent } from "./helpers/event-factories";
import {
  buildMockWebhookTargetPath,
  getClientConfig,
} from "./helpers/mock-client-config";
import { assertCallbackHeaders } from "./helpers/signature";
import {
  awaitQueueMessage,
  deleteMessage,
  getQueueDepth,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";
import {
  type TestContext,
  createTestContext,
  destroyTestContext,
} from "./helpers/test-context";

describe("Delivery Resilience", () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    destroyTestContext(ctx);
  });

  describe("Retry & Window Exhaustion", () => {
    let dlqUrl: string;
    let deliveryUrl: string;

    beforeAll(async () => {
      const { clientId } = getClientConfig("clientShortRetry");
      dlqUrl = ctx.clientDlqUrl(clientId);
      deliveryUrl = ctx.clientDeliveryUrl(clientId);
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    afterAll(async () => {
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    it("should exhaust the retry window on persistent 5xx and route to DLQ", async () => {
      const { clientId } = getClientConfig("clientShortRetry");
      const messageId = `force-500-${crypto.randomUUID()}`;

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({ data: { clientId, messageId } });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(ctx.sqs, dlqUrl, 90_000);

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.payload.data[0].attributes.messageId).toBe(messageId);

      const attemptCount = await countLogEntries(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        `{ $.msg = "Forced status code response" && $.messageId = "${messageId}" }`,
        ctx.startTime,
        2,
      );
      expect(attemptCount).toBeGreaterThan(1);

      await deleteMessage(ctx.sqs, dlqUrl, dlqMessage);
    }, 180_000);

    it("should exhaust the retry window on persistent 429 and route to DLQ", async () => {
      const { clientId } = getClientConfig("clientShortRetry");
      const messageId = `force-429-${crypto.randomUUID()}`;

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({ data: { clientId, messageId } });

      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(ctx.sqs, dlqUrl, 90_000);

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.payload.data[0].attributes.messageId).toBe(messageId);

      const attemptCount = await countLogEntries(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        `{ $.msg = "Forced status code response" && $.messageId = "${messageId}" }`,
        ctx.startTime,
        2,
      );
      expect(attemptCount).toBeGreaterThan(1);

      await deleteMessage(ctx.sqs, dlqUrl, dlqMessage);
    }, 180_000);
  });

  describe("Rate Limiting", () => {
    const BURST_SIZE = 15;
    let dlqUrl: string;
    let deliveryUrl: string;
    let httpsClientLogGroup: string;

    beforeAll(async () => {
      const { clientId } = getClientConfig("clientRateLimit");
      dlqUrl = ctx.clientDlqUrl(clientId);
      deliveryUrl = ctx.clientDeliveryUrl(clientId);
      httpsClientLogGroup = ctx.logGroup(`https-client-${clientId}`);
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    afterAll(async () => {
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    it("should eventually deliver all events in a burst without dropping any to the DLQ", async () => {
      const rateLimitConfig = getClientConfig("clientRateLimit");
      const targetPath = buildMockWebhookTargetPath("clientRateLimit");

      const events = Array.from({ length: BURST_SIZE }, () =>
        createMessageStatusPublishEvent({
          data: {
            clientId: rateLimitConfig.clientId,
            messageId: `rate-limit-burst-${crypto.randomUUID()}`,
          },
        }),
      );

      await Promise.all(
        events.map((event) =>
          sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event),
        ),
      );

      const callbackMap = await awaitCallbacks(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        events.map((e) => e.data.messageId),
        "MessageStatus",
        1,
        ctx.startTime,
      );

      const deliveredIds = [...callbackMap.keys()];
      const expectedIds = events.map((e) => e.data.messageId);
      expect(deliveredIds).toHaveLength(expectedIds.length);
      expect(deliveredIds).toEqual(expect.arrayContaining(expectedIds));

      for (const [, [callback]] of callbackMap) {
        expect(callback.path).toBe(targetPath);
        assertCallbackHeaders(
          callback,
          rateLimitConfig.apiKeyVar,
          rateLimitConfig.applicationIdVar,
        );
      }

      expect(await getQueueDepth(ctx.sqs, dlqUrl)).toBe(0);

      const rateLimitedCount = await countLogEntries(
        ctx.cwLogs,
        httpsClientLogGroup,
        `{ $.msg = "Admission denied" && $.reason = "rate_limited" }`,
        ctx.startTime,
        1,
      );
      expect(rateLimitedCount).toBeGreaterThanOrEqual(1);
    }, 180_000);
  });

  describe("Circuit Breaker", () => {
    const CB_BURST_SIZE = 15;
    let dlqUrl: string;
    let deliveryUrl: string;
    let httpsClientLogGroup: string;

    beforeAll(async () => {
      const { clientId } = getClientConfig("clientCircuitBreaker");
      dlqUrl = ctx.clientDlqUrl(clientId);
      deliveryUrl = ctx.clientDeliveryUrl(clientId);
      httpsClientLogGroup = ctx.logGroup(`https-client-${clientId}`);
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    afterAll(async () => {
      await purgeQueues(ctx.sqs, [dlqUrl, deliveryUrl]);
    });

    it("should open the circuit breaker after repeated failures and not affect other clients", async () => {
      const cbConfig = getClientConfig("clientCircuitBreaker");
      const cbTargetPath = buildMockWebhookTargetPath("clientCircuitBreaker");
      const singleTargetConfig = getClientConfig("clientSingleTarget");
      const singleTargetPath = buildMockWebhookTargetPath("clientSingleTarget");

      // Send a successful message first so the circuit is confirmed closed (it starts half-open)
      const warmupEvent = createMessageStatusPublishEvent({
        data: {
          clientId: cbConfig.clientId,
          messageId: `cb-warmup-${crypto.randomUUID()}`,
        },
      });
      await sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, warmupEvent);
      const warmupCallback = await awaitCallback(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        warmupEvent.data.messageId,
        "MessageStatus",
        ctx.startTime,
      );
      expect(warmupCallback.path).toBe(cbTargetPath);

      const cbEvents = Array.from({ length: CB_BURST_SIZE }, () =>
        createMessageStatusPublishEvent({
          data: {
            clientId: cbConfig.clientId,
            messageId: `force-500-cb-${crypto.randomUUID()}`,
          },
        }),
      );

      const normalEvent = createMessageStatusPublishEvent({
        data: {
          clientId: singleTargetConfig.clientId,
          messageId: `cb-isolation-${crypto.randomUUID()}`,
        },
      });

      await Promise.all([
        ...cbEvents.map((event) =>
          sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, event),
        ),
        sendSqsEvent(ctx.sqs, ctx.inboundQueueUrl, normalEvent),
      ]);

      const normalCallback = await awaitCallback(
        ctx.cwLogs,
        ctx.webhookLogGroup,
        normalEvent.data.messageId,
        "MessageStatus",
        ctx.startTime,
      );

      expect(normalCallback.path).toBe(singleTargetPath);
      assertCallbackHeaders(
        normalCallback,
        singleTargetConfig.apiKeyVar,
        singleTargetConfig.applicationIdVar,
      );

      const circuitOpenCount = await countLogEntries(
        ctx.cwLogs,
        httpsClientLogGroup,
        `{ $.msg = "Admission denied" && $.reason = "circuit_open" }`,
        ctx.startTime,
        1,
      );
      expect(circuitOpenCount).toBeGreaterThanOrEqual(1);
    }, 180_000);
  });
});
