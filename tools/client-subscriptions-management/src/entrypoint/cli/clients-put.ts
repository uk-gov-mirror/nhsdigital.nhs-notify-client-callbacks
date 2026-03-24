import { readFileSync } from "node:fs";
import type { Argv } from "yargs";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
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

type ClientsPutArgs = ClientCliArgs &
  WriteCliArgs & {
    file?: string;
    json?: string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    json: {
      type: "string",
      demandOption: false,
      description:
        "JSON string of the full client config (mutually exclusive with --file)",
    },
    file: {
      type: "string",
      demandOption: false,
      description:
        "Path to a JSON file containing the full client config (mutually exclusive with --json)",
    },
  });

export const handler: CliCommand<ClientsPutArgs>["handler"] = async (argv) => {
  if (!argv.json && !argv.file) {
    console.error("Error: one of --json or --file is required");
    process.exitCode = 1;
    return;
  }

  if (argv.json && argv.file) {
    console.error("Error: --json and --file are mutually exclusive");
    process.exitCode = 1;
    return;
  }

  if (argv.file && !argv.file.trim().toLowerCase().endsWith(".json")) {
    console.error("Error: --file must be a .json path");
    process.exitCode = 1;
    return;
  }

  // Safe as this is an internal tool and this CLI option we are expecting the user will run locally and manually
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const rawJson = argv.json ?? readFileSync(argv.file!, "utf8");

  let config: ClientSubscriptionConfiguration;
  try {
    config = JSON.parse(rawJson) as ClientSubscriptionConfiguration;
  } catch {
    console.error("Error: failed to parse JSON input");
    process.exitCode = 1;
    return;
  }

  if (config.clientId !== argv["client-id"]) {
    console.error(
      `Error: clientId in config ("${config.clientId}") does not match --client-id ("${argv["client-id"]}")`,
    );
    process.exitCode = 1;
    return;
  }

  const repository = await createRepository(argv);

  const result = await repository.putClientConfig(
    argv["client-id"],
    config,
    argv["dry-run"],
  );

  console.log(`Config written for client: ${argv["client-id"]}`);

  if (argv["dry-run"]) {
    console.log("Dry run: config is valid");
    console.log(JSON.stringify(result, null, 2));
  }
};

export const command: CliCommand<ClientsPutArgs> = {
  command: "clients-put",
  describe: "Write a full client configuration",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
