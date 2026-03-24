import type { Argv } from "yargs";
import {
  CHANNEL_STATUSES,
  MESSAGE_STATUSES,
  SUPPLIER_STATUSES,
} from "@nhs-notify-client-callbacks/models";
import type {
  ChannelStatus,
  MessageStatus,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
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

type SubscriptionsSetStatesArgs = ClientCliArgs &
  WriteCliArgs & {
    "channel-statuses"?: ChannelStatus[];
    "message-statuses"?: MessageStatus[];
    "subscription-id": string;
    "supplier-statuses"?: SupplierStatus[];
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    "subscription-id": {
      type: "string",
      demandOption: true,
      description: "Subscription ID to update",
    },
    "message-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: MESSAGE_STATUSES,
      description: "New message statuses (for MessageStatus subscriptions)",
    },
    "channel-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: CHANNEL_STATUSES,
      description: "New channel statuses (for ChannelStatus subscriptions)",
    },
    "supplier-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: SUPPLIER_STATUSES,
      description: "New supplier statuses (for ChannelStatus subscriptions)",
    },
  });

export const handler: CliCommand<SubscriptionsSetStatesArgs>["handler"] =
  async (argv) => {
    const messageStatuses = argv["message-statuses"];
    const channelStatuses = argv["channel-statuses"];
    const supplierStatuses = argv["supplier-statuses"];

    if (
      !messageStatuses?.length &&
      !channelStatuses?.length &&
      !supplierStatuses?.length
    ) {
      console.error(
        "Error: at least one of --message-statuses, --channel-statuses, or --supplier-statuses must be provided",
      );
      process.exitCode = 1;
      return;
    }

    const repository = await createRepository(argv);

    const result = await repository.setSubscriptionStates(
      argv["client-id"],
      argv["subscription-id"],
      { messageStatuses, channelStatuses, supplierStatuses },
      argv["dry-run"],
    );

    console.log(formatClientConfig(result));
  };

export const command: CliCommand<SubscriptionsSetStatesArgs> = {
  command: "subscriptions-set-states",
  describe: "Update the states on an existing subscription",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
