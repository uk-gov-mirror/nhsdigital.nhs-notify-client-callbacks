import type { Argv } from "yargs";
import {
  type CliCommand,
  type CommonCliArgs,
  commonOptions,
  createRepository,
  runCommand,
} from "src/entrypoint/cli/helper";

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
  });

export const handler: CliCommand<CommonCliArgs>["handler"] = async (argv) => {
  const repository = await createRepository(argv);

  const clientIds = await repository.listClientIds();
  if (clientIds.length === 0) {
    console.log("No client IDs found");
    return;
  }

  for (const id of clientIds) {
    console.log(id);
  }
};

export const command: CliCommand<CommonCliArgs> = {
  command: "clients-list",
  describe: "List configured client IDs",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
