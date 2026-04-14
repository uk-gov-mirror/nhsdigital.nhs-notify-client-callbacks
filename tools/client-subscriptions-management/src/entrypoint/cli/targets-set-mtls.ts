import type { Argv } from "yargs";
import pc from "picocolors";
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

type TargetsSetMtlsArgs = ClientCliArgs &
  WriteCliArgs & {
    "target-id": string;
    enable?: boolean;
    disable?: boolean;
  };

export const builder = (yargs: Argv) =>
  yargs
    .options({
      ...commonOptions,
      ...clientIdOption,
      ...writeOptions,
      "target-id": {
        type: "string",
        demandOption: true,
        description: "Target identifier to update",
      },
      enable: {
        type: "boolean",
        description: "Enable mTLS for this target",
        conflicts: "disable",
      },
      disable: {
        type: "boolean",
        description: "Disable mTLS for this target",
        conflicts: "enable",
      },
    })
    .check((argv) => {
      if (!argv.enable && !argv.disable) {
        throw new Error("Specify either --enable or --disable");
      }
      return true;
    });

export const handler: CliCommand<TargetsSetMtlsArgs>["handler"] = async (
  argv,
) => {
  const enabled = argv.enable === true;

  if (!enabled) {
    console.warn(
      pc.bold(
        pc.red("WARNING: Disabling mTLS — callbacks will not use mutual TLS"),
      ),
    );
  }

  const repository = await createRepository(argv);
  const config = await repository.getClientConfig(argv["client-id"]);

  if (!config) {
    throw new Error(`No configuration found for client: ${argv["client-id"]}`);
  }

  const target = config.targets.find((t) => t.targetId === argv["target-id"]);

  if (!target) {
    throw new Error(
      `Target '${argv["target-id"]}' not found for client '${argv["client-id"]}'`,
    );
  }

  target.mtls = { enabled };

  const result = await repository.putClientConfig(
    argv["client-id"],
    config,
    argv["dry-run"],
  );
  console.log(
    `mTLS ${enabled ? "enabled" : "disabled"} for target ${argv["target-id"]}`,
  );
  console.log(formatClientConfig(result));
};

export const command: CliCommand<TargetsSetMtlsArgs> = {
  command: "targets-set-mtls",
  describe: "Enable or disable mTLS for a callback target",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
