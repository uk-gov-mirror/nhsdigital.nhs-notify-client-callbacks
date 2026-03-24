import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  runCommand,
} from "src/entrypoint/cli/helper";
import { formatSubscriptionsTable } from "src/format";

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
  });

export const handler: CliCommand<ClientCliArgs>["handler"] = async (argv) => {
  const repository = await createRepository(argv);

  const config = await repository.getClientConfig(argv["client-id"]);

  if (!config) {
    console.log(`No configuration exists for client: ${argv["client-id"]}`);
    return;
  }

  if (config.subscriptions.length === 0) {
    console.log(`No subscriptions found for client: ${argv["client-id"]}`);
    return;
  }

  console.log(formatSubscriptionsTable(config.subscriptions));
};

export const command: CliCommand<ClientCliArgs> = {
  command: "subscriptions-list",
  describe: "List a client's subscriptions",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
