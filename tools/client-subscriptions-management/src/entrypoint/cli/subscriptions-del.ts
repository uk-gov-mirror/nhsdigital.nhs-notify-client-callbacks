import type { Argv } from "yargs";
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

type SubscriptionsDelArgs = ClientCliArgs &
  WriteCliArgs & {
    "subscription-id": string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    "subscription-id": {
      type: "string",
      demandOption: true,
      description: "Subscription ID to delete",
    },
  });

export const handler: CliCommand<SubscriptionsDelArgs>["handler"] = async (
  argv,
) => {
  const repository = await createRepository(argv);

  const result = await repository.deleteSubscription(
    argv["client-id"],
    argv["subscription-id"],
    argv["dry-run"],
  );

  console.log(formatClientConfig(result));
};

export const command: CliCommand<SubscriptionsDelArgs> = {
  command: "subscriptions-del",
  describe: "Delete a subscription from a client",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
