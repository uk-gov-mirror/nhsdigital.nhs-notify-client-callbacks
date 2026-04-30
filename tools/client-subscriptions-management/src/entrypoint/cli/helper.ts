import type {
  CallbackTarget,
  ClientSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import {
  createRepository as createRepositoryFromOptions,
  createS3ApplicationsMapRepository as createS3ApplicationsMapRepositoryFromOptions,
  resolveApplicationsMapLocation,
  resolveBucketName,
  resolveProfile,
  resolveRegion,
} from "src/aws";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import type { Argv, CommandModule } from "yargs";

export const wrapCli =
  (mainFn: (args: string[]) => Promise<void>) =>
  async (args: string[] = process.argv): Promise<void> => {
    try {
      await mainFn(args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  };

export type CommonCliArgs = {
  "bucket-name"?: string;
  environment?: string;
  profile?: string;
  region?: string;
};

export type ClientCliArgs = CommonCliArgs & {
  "client-id": string;
};

export type WriteCliArgs = {
  "dry-run": boolean;
};

export const createRepository = async (argv: CommonCliArgs) => {
  const region = resolveRegion(argv.region);
  const profile = resolveProfile(argv.profile);
  const bucketName = await resolveBucketName({
    bucketName: argv["bucket-name"],
    environment: argv.environment,
    region,
    profile,
  });
  return createRepositoryFromOptions({ bucketName, region, profile });
};

type BaseArgs = Record<string, never>;

export type CliCommand<TArgs> = CommandModule<BaseArgs, TArgs>;

export type AnyCliCommand = CliCommand<any>;

const configureParser = (parser: Argv) =>
  parser
    .strict()
    .recommendCommands()
    .demandCommand(1)
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new Error(message);
    })
    .help();

export const runCommand = async <TArgs>(
  command: CliCommand<TArgs>,
  args: string[] = process.argv,
): Promise<void> => {
  const commandArgs = [
    args[0] ?? "node",
    args[1] ?? "script",
    String(command.command).split(/\s+/)[0],
    ...args.slice(2),
  ];

  await configureParser(yargs(hideBin(commandArgs)))
    .command(command)
    .parseAsync();
};

export const runCommands = async (
  commands: AnyCliCommand[],
  args: string[] = process.argv,
): Promise<void> => {
  let parser = configureParser(yargs(hideBin(args)));
  for (const command of commands) {
    parser = parser.command(command);
  }
  await parser.parseAsync();
};

export const commonOptions = {
  "bucket-name": {
    type: "string" as const,
    demandOption: false as const,
    description: "Explicit S3 bucket name (overrides derived name)",
  },
  environment: {
    type: "string" as const,
    demandOption: false as const,
    description:
      "Environment name, used to derive infrastructure resource names when not explicitly provided",
  },
  region: {
    type: "string" as const,
    demandOption: false as const,
    description: "AWS region (defaults to AWS_REGION or eu-west-2)",
  },
  profile: {
    type: "string" as const,
    demandOption: false as const,
    description: "AWS profile to use (overrides AWS_PROFILE)",
  },
};

export const clientIdOption = {
  "client-id": {
    type: "string" as const,
    demandOption: true as const,
    description: "Client identifier",
  },
};

export const targetIdOption = {
  "target-id": {
    type: "string" as const,
    demandOption: true as const,
    description: "Target identifier",
  },
};

export const writeOptions = {
  "dry-run": {
    type: "boolean" as const,
    default: false,
    demandOption: false as const,
    description: "Validate config without writing to S3",
  },
};

export type ApplicationsMapCliArgs = CommonCliArgs & {
  "applications-map-bucket"?: string;
  "applications-map-key"?: string;
};

export const applicationsMapOptions = {
  "applications-map-bucket": {
    type: "string" as const,
    demandOption: false as const,
    description:
      "Explicit S3 bucket for the applications map (overrides derived name)",
  },
  "applications-map-key": {
    type: "string" as const,
    demandOption: false as const,
    description:
      "Explicit S3 key for the applications map (overrides derived key)",
  },
};

export const createS3ApplicationsMapRepository = async (
  argv: ApplicationsMapCliArgs,
) => {
  const region = resolveRegion(argv.region);
  const profile = resolveProfile(argv.profile);
  const { bucket, key } = await resolveApplicationsMapLocation({
    bucket: argv["applications-map-bucket"],
    key: argv["applications-map-key"],
    environment: argv.environment,
    region,
    profile,
  });
  return createS3ApplicationsMapRepositoryFromOptions({
    bucket,
    key,
    region,
    profile,
  });
};

export async function requireClientConfig(
  repository: {
    getClientConfig: (
      clientId: string,
    ) => Promise<ClientSubscriptionConfiguration | undefined>;
  },
  clientId: string,
): Promise<ClientSubscriptionConfiguration> {
  const config = await repository.getClientConfig(clientId);
  if (!config) {
    throw new Error(`No configuration found for client: ${clientId}`);
  }
  return config;
}

export function requireTargetConfig(
  config: ClientSubscriptionConfiguration,
  clientId: string,
  targetId: string,
): CallbackTarget {
  const target = config.targets.find((t) => t.targetId === targetId);
  if (!target) {
    throw new Error(`Target '${targetId}' not found for client '${clientId}'`);
  }
  return target;
}
