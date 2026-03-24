import * as helper from "src/entrypoint/cli/helper";
import { wrapCli } from "src/entrypoint/cli/helper";

type CliConsoleState = {
  error: typeof console.error;
  exitCode: typeof process.exitCode;
  log: typeof console.log;
};

export const captureCliConsoleState = (): CliConsoleState => ({
  error: console.error,
  exitCode: process.exitCode,
  log: console.log,
});

export const resetCliConsoleState = (): void => {
  console.log = jest.fn();
  console.error = jest.fn();
  delete process.exitCode;
};

export const restoreCliConsoleState = (state: CliConsoleState): void => {
  console.log = state.log;
  console.error = state.error;
  process.exitCode = state.exitCode;
};

export const expectWrappedCliError = async (
  mainFn: (args?: string[]) => Promise<void>,
  args: string[],
  message = "Boom",
): Promise<void> => {
  await wrapCli(mainFn)(args);

  expect(console.error).toHaveBeenCalledWith(message);
  expect(process.exitCode).toBe(1);
};

export const getMockCreateRepository = (): jest.Mock =>
  helper.createRepository as jest.Mock;

export const resetMockCreateRepository = (
  repository: Record<string, unknown>,
): jest.Mock => {
  const mockCreateRepository = getMockCreateRepository();
  mockCreateRepository.mockReset();
  mockCreateRepository.mockResolvedValue(repository);
  return mockCreateRepository;
};
