import { command as clientsGetCommand } from "src/entrypoint/cli/clients-get";
import { command as clientsListCommand } from "src/entrypoint/cli/clients-list";
import { command as clientsPutCommand } from "src/entrypoint/cli/clients-put";
import type { AnyCliCommand } from "src/entrypoint/cli/helper";
import { runCommands, wrapCli } from "src/entrypoint/cli/helper";
import { command as subscriptionsAddCommand } from "src/entrypoint/cli/subscriptions-add";
import { command as subscriptionsDelCommand } from "src/entrypoint/cli/subscriptions-del";
import { command as subscriptionsListCommand } from "src/entrypoint/cli/subscriptions-list";
import { command as subscriptionsSetStatesCommand } from "src/entrypoint/cli/subscriptions-set-states";
import { command as targetsAddCommand } from "src/entrypoint/cli/targets-add";
import { command as targetsDelCommand } from "src/entrypoint/cli/targets-del";
import { command as targetsListCommand } from "src/entrypoint/cli/targets-list";

export const commands: AnyCliCommand[] = [
  clientsListCommand,
  clientsGetCommand,
  clientsPutCommand,
  subscriptionsListCommand,
  subscriptionsAddCommand,
  subscriptionsDelCommand,
  subscriptionsSetStatesCommand,
  targetsListCommand,
  targetsAddCommand,
  targetsDelCommand,
];

export async function main(args: string[] = process.argv) {
  await runCommands(commands, args);
}

export const runCli = wrapCli(main);

runCli();
