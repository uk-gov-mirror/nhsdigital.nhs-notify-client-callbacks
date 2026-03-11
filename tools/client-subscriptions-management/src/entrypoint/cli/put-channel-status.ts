import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  SUPPLIER_STATUSES,
} from "@nhs-notify-client-callbacks/models";
import { createClientSubscriptionRepository } from "src/container";
import {
  formatSubscriptionFileResponse,
  resolveBucketName,
  resolveProfile,
  resolveRegion,
} from "src/entrypoint/cli/helper";

export const parseArgs = (args: string[]) =>
  yargs(hideBin(args))
    .options({
      "bucket-name": {
        type: "string",
        demandOption: false,
        description: "Explicit S3 bucket name (overrides derived name)",
      },
      environment: {
        type: "string",
        demandOption: false,
        description:
          "Environment name, used to derive infrastructure resource names when not explicitly provided",
      },
      "client-name": {
        type: "string",
        demandOption: false,
        description: "Display name for the client (defaults to client-id)",
      },
      "client-id": {
        type: "string",
        demandOption: true,
        description: "Client identifier",
      },
      "api-endpoint": {
        type: "string",
        demandOption: true,
        description: "Webhook endpoint URL (must start with https://)",
      },
      "api-key-header-name": {
        type: "string",
        default: "x-api-key",
        demandOption: false,
        description: "HTTP header name for the API key",
      },
      "api-key": {
        type: "string",
        demandOption: true,
        description: "API key value for authenticating webhook calls",
      },
      "channel-statuses": {
        string: true,
        type: "array",
        demandOption: false,
        choices: CHANNEL_STATUSES,
        description: "Channel statuses to subscribe to",
      },
      "supplier-statuses": {
        string: true,
        type: "array",
        demandOption: false,
        choices: SUPPLIER_STATUSES,
        description: "Supplier statuses to subscribe to",
      },
      "channel-type": {
        type: "string",
        demandOption: true,
        choices: CHANNEL_TYPES,
        description: "Channel type",
      },
      "rate-limit": {
        type: "number",
        demandOption: true,
        description: "Maximum number of webhook calls per second",
      },
      "dry-run": {
        type: "boolean",
        demandOption: true,
        description: "Validate config without writing to S3",
      },
      region: {
        type: "string",
        demandOption: false,
        description: "AWS region (defaults to AWS_REGION or eu-west-2)",
      },
      profile: {
        type: "string",
        demandOption: false,
        description: "AWS profile to use (overrides AWS_PROFILE)",
      },
    })
    .parseSync();

export async function main(args: string[] = process.argv) {
  const argv = parseArgs(args);
  const apiEndpoint = argv["api-endpoint"];
  if (!/^https:\/\//.test(apiEndpoint)) {
    console.error("Error: api-endpoint must start with https://");
    process.exitCode = 1;
    return;
  }

  const channelStatuses = argv["channel-statuses"];
  const supplierStatuses = argv["supplier-statuses"];
  if (!channelStatuses?.length && !supplierStatuses?.length) {
    console.error(
      "Error: at least one of --channel-statuses or --supplier-statuses must be provided",
    );
    process.exitCode = 1;
    return;
  }

  const region = resolveRegion(argv.region);
  const profile = resolveProfile(argv.profile);
  const bucketName = await resolveBucketName(
    argv["bucket-name"],
    argv.environment,
    region,
    profile,
  );
  const clientSubscriptionRepository = createClientSubscriptionRepository({
    bucketName,
    region,
    profile,
  });

  const result =
    await clientSubscriptionRepository.putChannelStatusSubscription({
      clientName: argv["client-name"] ?? argv["client-id"],
      clientId: argv["client-id"],
      apiEndpoint,
      apiKeyHeaderName: argv["api-key-header-name"],
      apiKey: argv["api-key"],
      channelType: argv["channel-type"],
      channelStatuses,
      supplierStatuses,
      rateLimit: argv["rate-limit"],
      dryRun: argv["dry-run"],
    });

  console.log(formatSubscriptionFileResponse(result));
}

export const runCli = async (args: string[] = process.argv) => {
  try {
    await main(args);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
};

export const runIfMain = async (
  args: string[] = process.argv,
  isMain: boolean = require.main === module,
) => {
  if (isMain) {
    await runCli(args);
  }
};

(async () => {
  await runIfMain();
})();
