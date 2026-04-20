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

type TargetsSetPinningArgs = ClientCliArgs &
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
        "Enable or disable certificate pinning for this target (use --no-enable to disable)",
    },
  });

export const handler: CliCommand<TargetsSetPinningArgs>["handler"] = async (
  argv,
) => {
  const enabled = argv.enable;

  if (!enabled) {
    console.warn(pc.bold(pc.red("WARNING: Disabling certificate pinning")));
  }

  const repository = await createRepository(argv);
  const config = await requireClientConfig(repository, argv["client-id"]);
  const target = requireTargetConfig(
    config,
    argv["client-id"],
    argv["target-id"],
  );

  if (enabled && !target.delivery?.mtls?.certPinning?.spkiHash) {
    throw new Error(
      `Target '${argv["target-id"]}' has no SPKI hash stored. Run 'targets-set-certificate' first to configure a certificate hash before enabling pinning.`,
    );
  }

  const mtls = target.delivery?.mtls ?? { enabled: false };
  const certPinning = mtls.certPinning ?? { enabled: false };
  target.delivery = {
    ...target.delivery,
    mtls: {
      ...mtls,
      certPinning: {
        ...certPinning,
        enabled,
      },
    },
  };

  const result = await repository.putClientConfig(
    argv["client-id"],
    config,
    argv["dry-run"],
  );
  console.log(
    `Certificate pinning ${enabled ? "enabled" : "disabled"} for target ${argv["target-id"]}`,
  );
  console.log(formatClientConfig(result));
};

export const command: CliCommand<TargetsSetPinningArgs> = {
  command: "targets-set-pinning",
  describe: "Enable or disable certificate pinning for a callback target",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
