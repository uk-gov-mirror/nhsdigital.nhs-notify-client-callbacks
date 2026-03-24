import type { Argv } from "yargs";
import { buildTarget } from "src/domain/client-subscription-builder";
import {
  type CliCommand,
  type ClientCliArgs,
  type WriteCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  runCommand,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatClientConfig } from "src/format";

type TargetsAddArgs = ClientCliArgs &
  WriteCliArgs & {
    "api-endpoint": string;
    "api-key": string;
    "api-key-header-name": string;
    "rate-limit": number;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    "api-endpoint": {
      type: "string",
      demandOption: true,
      description: "Webhook endpoint URL (must start with https://)",
    },
    "api-key": {
      type: "string",
      demandOption: true,
      description: "API key value for authenticating webhook calls",
    },
    "api-key-header-name": {
      type: "string",
      default: "x-api-key",
      demandOption: false,
      description: "HTTP header name for the API key",
    },
    "rate-limit": {
      type: "number",
      demandOption: true,
      description: "Maximum number of webhook calls per second",
    },
  });

export const handler: CliCommand<TargetsAddArgs>["handler"] = async (argv) => {
  const apiEndpoint = argv["api-endpoint"];

  const target = buildTarget({
    apiEndpoint,
    apiKey: argv["api-key"],
    apiKeyHeaderName: argv["api-key-header-name"],
    rateLimit: argv["rate-limit"],
  });

  const repository = await createRepository(argv);

  const result = await repository.addTarget(
    argv["client-id"],
    target,
    argv["dry-run"],
  );
  console.log(`Target added with ID: ${target.targetId}`);
  console.log(formatClientConfig(result));
};

export const command: CliCommand<TargetsAddArgs> = {
  command: "targets-add",
  describe: "Add a callback target to a client",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
