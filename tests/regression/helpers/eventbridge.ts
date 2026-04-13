import {
  DescribeEventBusCommand,
  EventBridgeClient,
  ListRulesCommand,
  PutEventsCommand,
  type PutEventsRequestEntry,
  type Rule,
} from "@aws-sdk/client-eventbridge";

export async function describeEventBus(
  client: EventBridgeClient,
  eventBusName: string,
): Promise<{ arn: string | undefined; name: string | undefined }> {
  const response = await client.send(
    new DescribeEventBusCommand({ Name: eventBusName }),
  );
  return { arn: response.Arn, name: response.Name };
}

export async function listRules(
  client: EventBridgeClient,
  eventBusName: string,
  namePrefix?: string,
): Promise<Rule[]> {
  const response = await client.send(
    new ListRulesCommand({
      EventBusName: eventBusName,
      NamePrefix: namePrefix,
    }),
  );
  return response.Rules ?? [];
}

export async function putEvent(
  client: EventBridgeClient,
  entry: PutEventsRequestEntry,
): Promise<void> {
  const response = await client.send(
    new PutEventsCommand({ Entries: [entry] }),
  );

  if (response.FailedEntryCount && response.FailedEntryCount > 0) {
    const failedEntry = response.Entries?.[0];
    throw new Error(
      `EventBridge PutEvents failed: ${failedEntry?.ErrorCode} - ${failedEntry?.ErrorMessage}`,
    );
  }
}
