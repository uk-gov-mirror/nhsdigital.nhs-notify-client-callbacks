import type { Argv } from "yargs";
import pc from "picocolors";
import {
  type CliCommand,
  type ClientCliArgs,
  type WriteCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  requireClientConfig,
  requireTargetConfig,
  runCommand,
  targetIdOption,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatClientConfig } from "src/format";

type TargetsSetMtlsArgs = ClientCliArgs &
  WriteCliArgs & {
    "target-id": string;
    enable: boolean;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...targetIdOption,
    ...writeOptions,
    enable: {
      type: "boolean",
      demandOption: true,
      description:
        "Enable or disable mTLS for this target (use --no-enable to disable)",
    },
  });

export const handler: CliCommand<TargetsSetMtlsArgs>["handler"] = async (
  argv,
) => {
  const enabled = argv.enable;

  if (!enabled) {
    console.warn(
      pc.bold(
        pc.red("WARNING: Disabling mTLS — callbacks will not use mutual TLS"),
      ),
    );
  }

  const repository = await createRepository(argv);
  const config = await requireClientConfig(repository, argv["client-id"]);
  const target = requireTargetConfig(
    config,
    argv["client-id"],
    argv["target-id"],
  );

  target.delivery = {
    ...target.delivery,
    mtls: {
      ...target.delivery?.mtls,
      enabled,
    },
  };

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
