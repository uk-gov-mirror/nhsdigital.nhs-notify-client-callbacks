import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  type MetricAlarm,
} from "@aws-sdk/client-cloudwatch";
import type { DeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers";
import { getDeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers";
import { getAllSubscriptionTargetIds } from "./helpers/mock-client-config";
import { buildMockClientDlqQueueUrl } from "./helpers/sqs";

function buildDlqDepthAlarmName(
  { component, environment, project }: DeploymentDetails,
  targetId: string,
): string {
  return `${project}-${environment}-${component}-${targetId}-dlq-depth`;
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
  let targetIds: string[];

  beforeAll(() => {
    deploymentDetails = getDeploymentDetails();
    cloudWatchClient = new CloudWatchClient({
      region: deploymentDetails.region,
    });

    targetIds = getAllSubscriptionTargetIds();
  });

  afterAll(() => {
    cloudWatchClient.destroy();
  });

  it("should create a DLQ depth alarm for every target DLQ", async () => {
    expect(targetIds.length).toBeGreaterThan(0);

    for (const targetId of targetIds) {
      const alarmName = buildDlqDepthAlarmName(deploymentDetails, targetId);
      const targetDlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails, [
        { targetId },
      ]);
      const targetDlqQueueName = getQueueNameFromUrl(targetDlqQueueUrl);
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
            Value: targetDlqQueueName,
          }),
        ]),
      );
    }
  }, 120_000);
});
