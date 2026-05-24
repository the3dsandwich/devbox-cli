import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockList = vi.fn().mockResolvedValue([]);
const mockConfigSet = vi.fn();

vi.mock("../api.js", () => ({
  createApiClient: () => ({ list: mockList }),
}));

vi.mock("../config.js", () => ({
  config: { set: mockConfigSet },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("readline", () => ({
  createInterface: () => ({
    question: (_q: string, cb: (a: string) => void) => cb(""),
    close: vi.fn(),
  }),
}));

import { readFileSync } from "fs";
const mockReadFileSync = vi.mocked(readFileSync);

// import after mocks are set up
const { login } = await import("../commands/login.js");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEVBOX_TOKEN;
  delete process.env.DEVBOX_SSH_KEY;
});

afterEach(() => {
  delete process.env.DEVBOX_TOKEN;
  delete process.env.DEVBOX_SSH_KEY;
});

describe("login", () => {
  it("uses DEVBOX_TOKEN and DEVBOX_SSH_KEY env vars without prompting", async () => {
    process.env.DEVBOX_TOKEN = "my-token";
    process.env.DEVBOX_SSH_KEY = "ssh-ed25519 AAAA... laptop";
    mockReadFileSync.mockImplementation(() => { throw new Error("no file"); });

    await login("http://server.local");

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockConfigSet).toHaveBeenCalledWith("token", "my-token");
    expect(mockConfigSet).toHaveBeenCalledWith("sshKey", "ssh-ed25519 AAAA... laptop");
    expect(mockConfigSet).toHaveBeenCalledWith("serverUrl", "http://server.local");
  });

  it("strips trailing slash from server URL", async () => {
    process.env.DEVBOX_TOKEN = "tok";
    process.env.DEVBOX_SSH_KEY = "ssh-ed25519 AAAA...";

    await login("http://server.local/");

    expect(mockConfigSet).toHaveBeenCalledWith("serverUrl", "http://server.local");
  });

  it("prefers DEVBOX_SSH_KEY over auto-detected key", async () => {
    process.env.DEVBOX_TOKEN = "tok";
    process.env.DEVBOX_SSH_KEY = "ssh-ed25519 OVERRIDE...";
    mockReadFileSync.mockReturnValue("ssh-ed25519 DETECTED..." as unknown as ReturnType<typeof readFileSync>);

    await login("http://server.local");

    expect(mockConfigSet).toHaveBeenCalledWith("sshKey", "ssh-ed25519 OVERRIDE...");
  });

  it("falls back to auto-detected SSH key when no env var set", async () => {
    process.env.DEVBOX_TOKEN = "tok";
    mockReadFileSync.mockReturnValue("ssh-ed25519 AUTODETECT key@host\n" as unknown as ReturnType<typeof readFileSync>);

    await login("http://server.local");

    expect(mockConfigSet).toHaveBeenCalledWith("sshKey", "ssh-ed25519 AUTODETECT key@host");
  });

  it("throws when token is empty", async () => {
    process.env.DEVBOX_TOKEN = "";
    process.env.DEVBOX_SSH_KEY = "ssh-ed25519 AAAA...";

    await expect(login("http://server.local")).rejects.toThrow("API token is required");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("throws when ssh key is empty and none detected", async () => {
    process.env.DEVBOX_TOKEN = "tok";
    process.env.DEVBOX_SSH_KEY = "";
    mockReadFileSync.mockImplementation(() => { throw new Error("no file"); });

    await expect(login("http://server.local")).rejects.toThrow("SSH public key is required");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("throws when server returns 401", async () => {
    process.env.DEVBOX_TOKEN = "bad-token";
    process.env.DEVBOX_SSH_KEY = "ssh-ed25519 AAAA...";
    mockList.mockRejectedValueOnce(new Error("Request failed with status code 401"));

    await expect(login("http://server.local")).rejects.toThrow("401");
    expect(mockConfigSet).not.toHaveBeenCalled();
  });
});
