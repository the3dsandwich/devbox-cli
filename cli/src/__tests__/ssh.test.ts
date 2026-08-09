import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { resolveSshTarget } from "../ssh.js";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

const originalLang = process.env.LANG;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalLang === undefined) delete process.env.LANG;
  else process.env.LANG = originalLang;
});

describe("resolveSshTarget", () => {
  it("uses mosh when installed locally and available on the remote, forcing a UTF-8 locale", () => {
    process.env.LANG = "C";
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target.bin).toBe("mosh");
    expect(target.args).toEqual(["weiwei@10.0.0.1"]);
    expect(target.env?.LC_ALL).toBe("C.UTF-8");
    expect(mockExecFileSync).toHaveBeenCalledWith("which", ["mosh"], { stdio: "ignore" });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "ssh",
      ["weiwei@10.0.0.1", "command -v mosh-server"],
      { stdio: "ignore", timeout: 5000 },
    );
  });

  it("preserves an already-UTF-8 LANG instead of overriding it", () => {
    process.env.LANG = "en_US.UTF-8";
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const target = resolveSshTarget("weiwei", "10.0.0.1");

    expect(target.env?.LC_ALL).toBe("en_US.UTF-8");
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
