import type { Argv } from "yargs";
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  MESSAGE_STATUSES,
  SUPPLIER_STATUSES,
} from "@nhs-notify-client-callbacks/models";
import type {
  ChannelStatus,
  MessageStatus,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import {
  buildChannelStatusSubscription,
  buildMessageStatusSubscription,
} from "src/domain/client-subscription-builder";
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

type SubscriptionsAddArgs = ClientCliArgs &
  WriteCliArgs & {
    "channel-statuses"?: ChannelStatus[];
    "channel-type"?: (typeof CHANNEL_TYPES)[number];
    "message-statuses"?: MessageStatus[];
    "subscription-id"?: string;
    "subscription-type": "MessageStatus" | "ChannelStatus";
    "supplier-statuses"?: SupplierStatus[];
    "target-id": string[];
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    "subscription-type": {
      type: "string",
      demandOption: true,
      choices: ["MessageStatus", "ChannelStatus"] as const,
      description: "Subscription type",
    },
    "target-id": {
      string: true,
      type: "array",
      demandOption: true,
      description: "Target ID(s) to link this subscription to",
    },
    "message-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: MESSAGE_STATUSES,
      description: "Message statuses (required for MessageStatus type)",
    },
    "channel-type": {
      type: "string",
      demandOption: false,
      choices: CHANNEL_TYPES,
      description: "Channel type (required for ChannelStatus type)",
    },
    "channel-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: CHANNEL_STATUSES,
      description: "Channel statuses (for ChannelStatus type)",
    },
    "supplier-statuses": {
      string: true,
      type: "array",
      demandOption: false,
      choices: SUPPLIER_STATUSES,
      description: "Supplier statuses (for ChannelStatus type)",
    },
    "subscription-id": {
      type: "string",
      demandOption: false,
      description: "Explicit subscription ID (defaults to a generated UUID v4)",
    },
  });

export const handler: CliCommand<SubscriptionsAddArgs>["handler"] = async (
  argv,
) => {
  const subscriptionType = argv["subscription-type"];
  const subscriptionId = argv["subscription-id"] ?? crypto.randomUUID();
  const targetIds = argv["target-id"];

  let subscription;

  if (subscriptionType === "MessageStatus") {
    const messageStatuses = argv["message-statuses"];
    if (!messageStatuses?.length) {
      console.error(
        "Error: --message-statuses is required for MessageStatus subscriptions",
      );
      process.exitCode = 1;
      return;
    }
    subscription = buildMessageStatusSubscription({
      subscriptionId,
      targetIds,
      messageStatuses,
    });
  } else {
    const channelType = argv["channel-type"];
    if (!channelType) {
      console.error(
        "Error: --channel-type is required for ChannelStatus subscriptions",
      );
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
    subscription = buildChannelStatusSubscription({
      subscriptionId,
      targetIds,
      channelType,
      channelStatuses,
      supplierStatuses,
    });
  }

  const repository = await createRepository(argv);

  const result = await repository.addSubscription(
    argv["client-id"],
    subscription,
    argv["dry-run"],
  );

  console.log(formatClientConfig(result));
};

export const command: CliCommand<SubscriptionsAddArgs> = {
  command: "subscriptions-add",
  describe: "Add a subscription to a client",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
