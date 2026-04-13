import {
  type DeploymentDetails,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import { logger } from "@nhs-notify-client-callbacks/logger";
import {
  type CliResult,
  execCliCommand,
  getRegressionClientConfig,
} from "./helpers";

describe("CLI management", () => {
  let deploymentDetails: DeploymentDetails;
  let clientId: string;
  let originalConfig: string | undefined;

  function cliArgs(): string[] {
    return [
      "--environment",
      deploymentDetails.environment,
      "--region",
      deploymentDetails.region,
    ];
  }

  beforeAll(async () => {
    deploymentDetails = getDeploymentDetails();
    clientId = getRegressionClientConfig().clientId;

    const getResult = await execCliCommand("clients-get", [
      "--client-id",
      clientId,
      ...cliArgs(),
    ]);
    if (getResult.exitCode === 0) {
      originalConfig = getResult.stdout;
    }
  });

  afterAll(async () => {
    if (originalConfig) {
      logger.info(
        `Restoring original config for client '${clientId}' after CLI tests`,
      );
      await execCliCommand("clients-put", [
        "--client-id",
        clientId,
        "--config",
        originalConfig,
        ...cliArgs(),
      ]);
    }
  });

  describe("Test 6.1: clients-list", () => {
    it("should list clients including the regression mock client", async () => {
      const result: CliResult = await execCliCommand("clients-list", [
        ...cliArgs(),
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(clientId);
    }, 30_000);
  });

  describe("Test 6.2: clients-get", () => {
    it("should return JSON config matching the uploaded fixture", async () => {
      const result: CliResult = await execCliCommand("clients-get", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      expect(result.exitCode).toBe(0);
      const config = JSON.parse(result.stdout);
      expect(config.clientId).toBe(clientId);
      expect(config.subscriptions).toBeDefined();
      expect(config.targets).toBeDefined();
    }, 30_000);
  });

  describe("Test 6.3: subscriptions-add", () => {
    const testSubscriptionId = "sub-regression-letter-test";

    afterEach(async () => {
      await execCliCommand("subscriptions-del", [
        "--client-id",
        clientId,
        "--subscription-id",
        testSubscriptionId,
        ...cliArgs(),
      ]).catch(() => undefined);
    });

    it("should add a LETTER channel subscription", async () => {
      const addResult = await execCliCommand("subscriptions-add", [
        "--client-id",
        clientId,
        "--subscription-id",
        testSubscriptionId,
        "--subscription-type",
        "ChannelStatus",
        "--channel-type",
        "LETTER",
        "--channel-statuses",
        "DELIVERED",
        "--supplier-statuses",
        "delivered",
        "--target-ids",
        getRegressionClientConfig().targets[0].targetId,
        ...cliArgs(),
      ]);

      expect(addResult.exitCode).toBe(0);

      const listResult = await execCliCommand("subscriptions-list", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      expect(listResult.exitCode).toBe(0);
      expect(listResult.stdout).toContain(testSubscriptionId);
    }, 30_000);
  });

  describe("Test 6.4: subscriptions-del", () => {
    const testSubscriptionId = "sub-regression-delete-test";

    it("should delete a previously added subscription", async () => {
      await execCliCommand("subscriptions-add", [
        "--client-id",
        clientId,
        "--subscription-id",
        testSubscriptionId,
        "--subscription-type",
        "ChannelStatus",
        "--channel-type",
        "LETTER",
        "--channel-statuses",
        "DELIVERED",
        "--supplier-statuses",
        "delivered",
        "--target-ids",
        getRegressionClientConfig().targets[0].targetId,
        ...cliArgs(),
      ]);

      const delResult = await execCliCommand("subscriptions-del", [
        "--client-id",
        clientId,
        "--subscription-id",
        testSubscriptionId,
        ...cliArgs(),
      ]);

      expect(delResult.exitCode).toBe(0);

      const listResult = await execCliCommand("subscriptions-list", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      expect(listResult.stdout).not.toContain(testSubscriptionId);
    }, 30_000);
  });

  describe("Test 6.5: subscriptions-set-states", () => {
    it("should update message statuses for a subscription", async () => {
      const setResult = await execCliCommand("subscriptions-set-states", [
        "--client-id",
        clientId,
        "--subscription-id",
        getRegressionClientConfig().subscriptions[0].subscriptionId,
        "--message-statuses",
        "DELIVERED,FAILED,SENDING",
        ...cliArgs(),
      ]);

      expect(setResult.exitCode).toBe(0);

      const getResult = await execCliCommand("clients-get", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      expect(getResult.exitCode).toBe(0);
    }, 30_000);
  });

  describe("Test 6.6: Dry run mode", () => {
    it("should not modify S3 when --dry-run true is passed", async () => {
      const beforeResult = await execCliCommand("clients-get", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      const addResult = await execCliCommand("subscriptions-add", [
        "--client-id",
        clientId,
        "--subscription-id",
        "sub-regression-dryrun-test",
        "--subscription-type",
        "ChannelStatus",
        "--channel-type",
        "LETTER",
        "--channel-statuses",
        "DELIVERED",
        "--supplier-statuses",
        "delivered",
        "--target-ids",
        getRegressionClientConfig().targets[0].targetId,
        "--dry-run",
        "true",
        ...cliArgs(),
      ]);

      expect(addResult.exitCode).toBe(0);

      const afterResult = await execCliCommand("clients-get", [
        "--client-id",
        clientId,
        ...cliArgs(),
      ]);

      expect(afterResult.exitCode).toBe(0);
      expect(afterResult.stdout).toBe(beforeResult.stdout);
    }, 30_000);
  });
});
