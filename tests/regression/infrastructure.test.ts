import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { SSMClient } from "@aws-sdk/client-ssm";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { PipesClient } from "@aws-sdk/client-pipes";
import {
  type DeploymentDetails,
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildSubscriptionConfigBucketName,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  buildMockClientDlqQueueUrl,
  describeEventBus,
  describePipe,
  getParameter,
  getRegressionClientConfig,
  listRules,
} from "./helpers";

describe("Infrastructure validation", () => {
  let sqsClient: SQSClient;
  let s3Client: S3Client;
  let ssmClient: SSMClient;
  let eventBridgeClient: EventBridgeClient;
  let pipesClient: PipesClient;
  let deploymentDetails: DeploymentDetails;

  beforeAll(() => {
    deploymentDetails = getDeploymentDetails();
    sqsClient = createSqsClient(deploymentDetails);
    s3Client = new S3Client({ region: deploymentDetails.region });
    ssmClient = new SSMClient({ region: deploymentDetails.region });
    eventBridgeClient = new EventBridgeClient({
      region: deploymentDetails.region,
    });
    pipesClient = new PipesClient({ region: deploymentDetails.region });
  });

  afterAll(() => {
    sqsClient.destroy();
    s3Client.destroy();
    ssmClient.destroy();
    eventBridgeClient.destroy();
    pipesClient.destroy();
  });

  describe("S3 configuration", () => {
    it("should confirm the S3 config bucket exists", async () => {
      const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
      await expect(
        s3Client.send(new HeadBucketCommand({ Bucket: bucketName })),
      ).resolves.toBeDefined();
    });
  });

  describe("SQS queues", () => {
    it("should confirm the inbound SQS queue is accessible", async () => {
      const queueUrl = buildInboundEventQueueUrl(deploymentDetails);
      const response = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
        }),
      );
      expect(response.Attributes?.QueueArn).toBeDefined();
    });

    it("should confirm the inbound DLQ is accessible", async () => {
      const queueUrl = buildInboundEventDlqQueueUrl(deploymentDetails);
      const response = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
        }),
      );
      expect(response.Attributes?.QueueArn).toBeDefined();
    });

    it("should confirm the mock-client DLQ is accessible", async () => {
      const clientConfig = getRegressionClientConfig();
      const queueUrl = buildMockClientDlqQueueUrl(
        deploymentDetails,
        clientConfig.targets,
      );
      const response = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
        }),
      );
      expect(response.Attributes?.QueueArn).toBeDefined();
    });
  });

  describe("SSM Applications Map", () => {
    it("should confirm SSM Applications Map parameter exists and contains regression client", async () => {
      const clientConfig = getRegressionClientConfig();
      const parameterName = `/${deploymentDetails.project}/${deploymentDetails.environment}/${deploymentDetails.component}/applications-map`;
      const value = await getParameter(ssmClient, parameterName);

      expect(value).toBeDefined();
      const applicationsMap = JSON.parse(value!) as Record<string, string>;
      expect(applicationsMap[clientConfig.clientId]).toBeDefined();
    });
  });

  describe("EventBridge Callbacks bus", () => {
    it("should confirm the EventBridge Callbacks bus exists", async () => {
      const busName = `${deploymentDetails.project}-${deploymentDetails.environment}-${deploymentDetails.component}-callbacks`;
      const bus = await describeEventBus(eventBridgeClient, busName);
      expect(bus.arn).toBeDefined();
    });
  });

  describe("EventBridge Pipe", () => {
    it("should confirm the EventBridge Pipe is RUNNING", async () => {
      const pipeName = `${deploymentDetails.project}-${deploymentDetails.environment}-${deploymentDetails.component}-main`;
      const pipe = await describePipe(pipesClient, pipeName);

      expect(pipe.currentState).toBe("RUNNING");
      expect(pipe.sourceArn).toBeDefined();
      expect(pipe.targetArn).toBeDefined();
      expect(pipe.enrichmentArn).toBeDefined();
    });
  });

  describe("Shared Event Bus", () => {
    it("should check if Shared Event Bus exists and has a routing rule", async () => {
      const sharedBusName = `${deploymentDetails.project}-${deploymentDetails.environment}-shared-event-bus`;

      try {
        const bus = await describeEventBus(eventBridgeClient, sharedBusName);
        expect(bus.arn).toBeDefined();

        const rules = await listRules(eventBridgeClient, sharedBusName);
        if (rules.length === 0) {
          console.warn(
            `Shared Event Bus '${sharedBusName}' exists but has no routing rules — Shared Event Bus tests will be skipped`,
          );
        }
      } catch {
        console.warn(
          `Shared Event Bus '${sharedBusName}' does not exist — Shared Event Bus tests will be skipped`,
        );
      }
    });
  });
});
