import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import { resolveSshTarget } from "../ssh.js";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveSshTarget", () => {
  it("uses mosh when installed locally and available on the remote", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target).toEqual({ bin: "mosh", args: ["weiwei@10.0.0.1"] });
    expect(mockExecFileSync).toHaveBeenCalledWith("which", ["mosh"], { stdio: "ignore" });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "ssh",
      ["weiwei@10.0.0.1", "command -v mosh-server"],
      { stdio: "ignore", timeout: 5000 },
    );
  });

  it("falls back to ssh when mosh is not installed locally", () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "which") throw new Error("not found");
      return Buffer.from("");
    });

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target).toEqual({ bin: "ssh", args: ["weiwei@10.0.0.1"] });
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });

  it("falls back to ssh when mosh is installed locally but not on the remote", () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "ssh") throw new Error("command not found: mosh-server");
      return Buffer.from("");
    });

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target).toEqual({ bin: "ssh", args: ["weiwei@10.0.0.1"] });
  });

  it("falls back to ssh when neither side has mosh", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target).toEqual({ bin: "ssh", args: ["weiwei@10.0.0.1"] });
  });
});
