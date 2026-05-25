import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withSpinner } from "../spinner.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("withSpinner", () => {
  it("resolves with the return value of the task", async () => {
    const result = await withSpinner("loading", async () => {
      vi.advanceTimersByTime(200);
      return 42;
    });
    expect(result).toBe(42);
  });

  it("writes spinner frames to stdout while task runs", async () => {
    const task = new Promise<void>((resolve) => setTimeout(resolve, 300));
    const promise = withSpinner("loading", () => task);
    vi.advanceTimersByTime(300);
    await promise;
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining("loading"));
  });

  it("clears the spinner line when task completes", async () => {
    await withSpinner("loading", async () => {});
    const calls = vi.mocked(process.stdout.write).mock.calls.map((c) => c[0] as string);
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toMatch(/^\r\s+\r$/);
  });

  it("clears the spinner and rethrows on error", async () => {
    await expect(
      withSpinner("loading", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");
    const calls = vi.mocked(process.stdout.write).mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => /^\r\s+\r$/.test(c))).toBe(true);
  });
});
