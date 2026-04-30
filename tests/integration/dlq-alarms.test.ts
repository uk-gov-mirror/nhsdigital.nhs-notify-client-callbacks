import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  type MetricAlarm,
} from "@aws-sdk/client-cloudwatch";
import type { DeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers";
import { getDeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  CLIENT_FIXTURES,
  type ClientFixtureKey,
  getClientConfig,
} from "./helpers/mock-client-config";
import { buildMockClientDlqQueueUrl } from "./helpers/sqs";

function buildDlqDepthAlarmName(
  { clientComponent, environment, project }: DeploymentDetails,
  clientId: string,
): string {
  return `${project}-${environment}-${clientComponent}-${clientId}-dlq-depth`;
}

function getQueueNameFromUrl(queueUrl: string): string {
  const queueName = /\/([^/]+)$/.exec(queueUrl)?.[1];
  if (!queueName) {
    throw new Error(`Unable to derive queue name from URL: ${queueUrl}`);
  }

  return queueName;
}

describe("DLQ alarms", () => {
  let cloudWatchClient: CloudWatchClient;
  let deploymentDetails: DeploymentDetails;
  let clientIds: string[];

  beforeAll(() => {
    deploymentDetails = getDeploymentDetails();
    cloudWatchClient = new CloudWatchClient({
      region: deploymentDetails.region,
    });

    clientIds = (Object.keys(CLIENT_FIXTURES) as ClientFixtureKey[]).map(
      (key) => getClientConfig(key).clientId,
    );
  });

  afterAll(() => {
    cloudWatchClient.destroy();
  });

  it("should create a DLQ depth alarm for every client DLQ", async () => {
    expect(clientIds.length).toBeGreaterThan(0);

    for (const clientId of clientIds) {
      const alarmName = buildDlqDepthAlarmName(deploymentDetails, clientId);
      const clientDlqQueueUrl = buildMockClientDlqQueueUrl(
        deploymentDetails,
        clientId,
      );
      const clientDlqQueueName = getQueueNameFromUrl(clientDlqQueueUrl);
      const response = await cloudWatchClient.send(
        new DescribeAlarmsCommand({
          AlarmNames: [alarmName],
        }),
      );

      const alarm: MetricAlarm | undefined = response.MetricAlarms?.[0];

      expect(alarm?.AlarmName).toBe(alarmName);
      expect(alarm?.MetricName).toBe("ApproximateNumberOfMessagesVisible");
      expect(alarm?.Namespace).toBe("AWS/SQS");
      expect(alarm?.Threshold).toBe(0);
      expect(alarm?.Dimensions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Name: "QueueName",
            Value: clientDlqQueueName,
          }),
        ]),
      );
    }
  }, 120_000);
});
