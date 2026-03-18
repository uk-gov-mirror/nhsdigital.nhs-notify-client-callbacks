import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { logger } from "@nhs-notify-client-callbacks/logger";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";
import { TimeoutError, waitUntil } from "async-wait-until";

const CALLBACK_WAIT_TIMEOUT_MS = 60_000;

type DebugLogEntry = {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
};

async function listDebugLogEntriesByEventId(
  client: S3Client,
  bucketName: string,
  eventId: string,
): Promise<DebugLogEntry[]> {
  const listResponse = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: `${eventId}/` }),
  );

  const keys = (listResponse.Contents ?? [])
    .map((obj) => obj.Key)
    .filter((key): key is string => key !== undefined);

  const entries = await Promise.all(
    keys.map(async (key) => {
      const obj = await client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
      );
      const body = await obj.Body?.transformToString();
      if (!body) return null;
      try {
        return JSON.parse(body) as DebugLogEntry;
      } catch {
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is DebugLogEntry => entry !== null);
}

function parseCallbackFromMessage(message: string): CallbackItem | null {
  const match = /CALLBACK .+ : (.+)$/.exec(message);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as CallbackItem;
  } catch {
    return null;
  }
}

function buildCallbackItemFromGeneratedEntry(
  entry: DebugLogEntry,
): CallbackItem {
  return {
    type: entry.callbackType as CallbackItem["type"],
    attributes: {
      messageId: entry.messageId as string,
      messageReference: entry.messageReference as string,
      ...(entry.callbackType === "MessageStatus"
        ? {
            messageStatus: entry.messageStatus,
            messageStatusDescription: entry.messageStatusDescription,
            channels: entry.channels,
            timestamp: entry.timestamp,
            routingPlan: entry.routingPlan ?? {},
          }
        : {
            channel: entry.channel,
            channelStatus: entry.channelStatus,
            channelStatusDescription: entry.channelStatusDescription,
            supplierStatus: entry.supplierStatus,
            cascadeType: entry.cascadeType,
            cascadeOrder: entry.cascadeOrder,
            timestamp: entry.timestamp,
            retryCount: entry.retryCount ?? 0,
          }),
    } as unknown as CallbackItem["attributes"],
    links: { message: entry.messageId as string },
    meta: { idempotencyKey: (entry.correlationId as string) ?? "" },
  };
}

function filterCallbackEntries(
  entries: DebugLogEntry[],
  callbackType: CallbackItem["type"],
  id: string,
): CallbackItem[] {
  return entries
    .filter((entry) => {
      if (
        entry.message.startsWith("CALLBACK") &&
        entry.message.includes(callbackType)
      ) {
        return entry.message.includes(id);
      }
      if (entry.message === "Callback generated") {
        return (
          entry.callbackType === callbackType &&
          (entry.correlationId as string) === id
        );
      }
      return false;
    })
    .map((entry): CallbackItem | null => {
      if (entry.message.startsWith("CALLBACK")) {
        return parseCallbackFromMessage(entry.message);
      }
      return buildCallbackItemFromGeneratedEntry(entry);
    })
    .filter((item): item is CallbackItem => item !== null);
}

async function getCallbacksFromBucketByKey(
  client: S3Client,
  bucketName: string,
  eventId: string,
  callbackType: CallbackItem["type"],
): Promise<CallbackItem[]> {
  const entries = await listDebugLogEntriesByEventId(
    client,
    bucketName,
    eventId,
  );

  return filterCallbackEntries(entries, callbackType, eventId);
}

export async function awaitCallbacksFromBucketByKey(
  client: S3Client,
  bucketName: string,
  eventId: string,
  callbackType: CallbackItem["type"],
): Promise<CallbackItem[]> {
  let callbacks: CallbackItem[] = [];
  logger.debug(`Waiting for callback in debug log bucket (eventId=${eventId})`);
  try {
    await waitUntil(
      async () => {
        callbacks = await getCallbacksFromBucketByKey(
          client,
          bucketName,
          eventId,
          callbackType,
        );

        return callbacks.length > 0;
      },
      {
        timeout: CALLBACK_WAIT_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn(
        `Timed out waiting for callback in debug log bucket (eventId=${eventId}, callbackType=${callbackType}, timeoutMs=${CALLBACK_WAIT_TIMEOUT_MS})`,
      );
    } else {
      throw error;
    }
  }

  return callbacks;
}

export async function deleteDebugLogEntries(
  client: S3Client,
  bucketName: string,
): Promise<void> {
  const listResponse = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName }),
  );

  const objects = listResponse.Contents ?? [];
  if (objects.length === 0) return;

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objects.map((obj) => ({ Key: obj.Key! })),
        Quiet: true,
      },
    }),
  );
}
