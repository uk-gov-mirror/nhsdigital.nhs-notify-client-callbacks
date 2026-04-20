import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  type WriteCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  runCommand,
  targetIdOption,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatClientConfig } from "src/format";

type TargetsDelArgs = ClientCliArgs &
  WriteCliArgs & {
    "target-id": string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...targetIdOption,
    ...writeOptions,
  });

export const handler: CliCommand<TargetsDelArgs>["handler"] = async (argv) => {
  const repository = await createRepository(argv);

  const result = await repository.deleteTarget(
    argv["client-id"],
    argv["target-id"],
    argv["dry-run"],
  );

  console.log(formatClientConfig(result));
};

export const command: CliCommand<TargetsDelArgs> = {
  command: "targets-del",
  describe: "Delete a callback target from a client",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
