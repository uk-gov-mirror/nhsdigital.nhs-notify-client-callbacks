import { spawnSync } from "node:child_process";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  MESSAGE_STATUSES,
  SUPPLIER_STATUSES,
} from "@nhs-notify-client-callbacks/models";
import { createClientSubscriptionRepository } from "src/container";
import {
  formatSubscriptionFileResponse,
  resolveBucketName,
  resolveProfile,
  resolveRegion,
} from "src/entrypoint/cli/helper";

const sharedOptions = {
  "bucket-name": {
    type: "string" as const,
    demandOption: false,
    description: "Explicit S3 bucket name (overrides derived name)",
  },
  "client-name": {
    type: "string" as const,
    demandOption: false,
    description: "Display name for the client (defaults to client-id)",
  },
  "client-id": {
    type: "string" as const,
    demandOption: true,
    description: "Client identifier",
  },
  "api-endpoint": {
    type: "string" as const,
    demandOption: true,
    description: "Webhook endpoint URL (must start with https://)",
  },
  "api-key": {
    type: "string" as const,
    demandOption: true,
    description: "API key value for authenticating webhook calls",
  },
  "api-key-header-name": {
    type: "string" as const,
    default: "x-api-key",
    demandOption: false,
    description: "HTTP header name for the API key",
  },
  "rate-limit": {
    type: "number" as const,
    demandOption: true,
    description: "Maximum number of webhook calls per second",
  },
  "dry-run": {
    type: "boolean" as const,
    demandOption: true,
    description: "Validate config without writing to S3",
  },
  region: {
    type: "string" as const,
    demandOption: false,
    description: "AWS region (defaults to AWS_REGION or eu-west-2)",
  },
  "terraform-apply": {
    type: "boolean" as const,
    default: false,
    demandOption: false,
    description: "Run terraform apply after uploading config",
  },
  environment: {
    type: "string" as const,
    demandOption: false,
    description:
      "Environment name, used to derive infrastructure resource names when not explicitly provided",
  },
  group: {
    type: "string" as const,
    demandOption: false,
    description: "Group name (required when --terraform-apply is set)",
  },
  project: {
    type: "string" as const,
    default: "nhs",
    demandOption: false,
    description: "Project name prefix for derived resource names",
  },
  "tf-region": {
    type: "string" as const,
    demandOption: false,
    description: "AWS region override for terraform",
  },
  profile: {
    type: "string" as const,
    demandOption: false,
    description: "AWS profile to use (overrides AWS_PROFILE)",
  },
} as const;

function runTerraformApply(argv: {
  environment?: string;
  group?: string;
  project?: string;
  "tf-region"?: string;
}) {
  const { environment, group, project = "nhs", "tf-region": tfRegion } = argv;
  if (!environment || !group) {
    console.error(
      "Error: --environment and --group are required when --terraform-apply is set",
    );
    process.exitCode = 1;
    return false;
  }

  console.log(
    "[deploy-client-subscriptions] Running terraform apply for callbacks component...",
  );

  const makeArgs = [
    "terraform-apply",
    `component=callbacks`,
    `environment=${environment}`,
    `group=${group}`,
    `project=${project}`,
  ];
  if (tfRegion) {
    makeArgs.push(`region=${tfRegion}`);
  }

  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const result = spawnSync("make", makeArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `Error: terraform apply failed with exit code ${result.status}`,
    );
    process.exitCode = result.status ?? 1;
    return false;
  }
  return true;
}

export async function main(args: string[] = process.argv) {
  await yargs(hideBin(args))
    .command(
      "message",
      "Deploy a message status subscription",
      {
        ...sharedOptions,
        "message-statuses": {
          string: true,
          type: "array" as const,
          demandOption: true,
          choices: MESSAGE_STATUSES,
        },
      },
      async (argv) => {
        const apiEndpoint = argv["api-endpoint"];
        if (!/^https:\/\//.test(apiEndpoint)) {
          console.error("Error: api-endpoint must start with https://");
          process.exitCode = 1;
          return;
        }

        console.log(
          "[deploy-client-subscriptions] Uploading message status subscription config...",
        );

        const region = resolveRegion(argv.region);
        const profile = resolveProfile(argv.profile);
        const bucketName = await resolveBucketName(
          argv["bucket-name"],
          argv.environment,
          region,
          profile,
          argv.project,
        );
        const clientSubscriptionRepository = createClientSubscriptionRepository(
          {
            bucketName,
            region,
            profile,
          },
        );

        const result =
          await clientSubscriptionRepository.putMessageStatusSubscription({
            clientName: argv["client-name"] ?? argv["client-id"],
            clientId: argv["client-id"],
            apiEndpoint,
            apiKeyHeaderName: argv["api-key-header-name"],
            apiKey: argv["api-key"],
            statuses: argv["message-statuses"],
            rateLimit: argv["rate-limit"],
            dryRun: argv["dry-run"],
          });

        console.log(formatSubscriptionFileResponse(result));

        if (argv["terraform-apply"]) {
          runTerraformApply(argv);
        }
      },
    )
    .command(
      "channel",
      "Deploy a channel status subscription",
      {
        ...sharedOptions,
        "channel-type": {
          type: "string" as const,
          demandOption: true,
          choices: CHANNEL_TYPES,
        },
        "channel-statuses": {
          string: true,
          type: "array" as const,
          demandOption: false,
          choices: CHANNEL_STATUSES,
        },
        "supplier-statuses": {
          string: true,
          type: "array" as const,
          demandOption: false,
          choices: SUPPLIER_STATUSES,
        },
      },
      async (argv) => {
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

        console.log(
          "[deploy-client-subscriptions] Uploading channel status subscription config...",
        );

        const region = resolveRegion(argv.region);
        const profile = resolveProfile(argv.profile);
        const bucketName = await resolveBucketName(
          argv["bucket-name"],
          argv.environment,
          region,
          profile,
          argv.project,
        );
        const clientSubscriptionRepository = createClientSubscriptionRepository(
          {
            bucketName,
            region,
            profile,
          },
        );

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

        if (argv["terraform-apply"]) {
          runTerraformApply(argv);
        }
      },
    )
    .demandCommand(1, "Please specify a command: message or channel")
    .strict()
    .parseAsync();
}

export const runCli = async (args: string[] = process.argv) => {
  try {
    await main(args);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
};

(async () => {
  if (require.main === module) {
    await runCli();
  }
})();
