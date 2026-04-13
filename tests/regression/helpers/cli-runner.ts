import { execFile } from "node:child_process";
import path from "node:path";

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function execCliCommand(
  command: string,
  args: string[],
): Promise<CliResult> {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");

  return new Promise((resolve) => {
    /* eslint-disable sonarjs/no-os-command-from-path -- pnpm is resolved via the project's .tool-versions; the PATH is controlled by the development environment */
    execFile(
      "pnpm",
      [
        "--filter",
        "client-subscriptions-management",
        "--silent",
        "run",
        command,
        "--",
        ...args,
      ],
      { cwd: repoRoot },
      /* eslint-enable sonarjs/no-os-command-from-path */
      (error, stdout, stderr) => {
        resolve({
          stdout: (stdout ?? "").toString(),
          stderr: (stderr ?? "").toString(),
          exitCode: typeof error?.code === "number" ? error.code : 0,
        });
      },
    );
  });
}
