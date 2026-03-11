import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
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
      "client-id": {
        type: "string",
        demandOption: true,
        description: "Client identifier",
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

  const result = await clientSubscriptionRepository.getClientSubscriptions(
    argv["client-id"],
  );

  if (result) {
    console.log(formatSubscriptionFileResponse(result));
  } else {
    console.log(`No configuration exists for client: ${argv["client-id"]}`);
  }
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
