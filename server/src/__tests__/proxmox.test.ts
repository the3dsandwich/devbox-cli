import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProxmoxClient } from "../proxmox.js";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost, delete: mockDelete }),
  },
}));

const config = {
  host: "proxmox.local",
  tokenId: "user@pve!token",
  tokenSecret: "secret",
  node: "pve",
  templateVmid: 200,
  vmidRangeStart: 300,
};

beforeEach(() => vi.clearAllMocks());

describe("cloneVm", () => {
  it("posts to the clone endpoint and waits for unlock", async () => {
    mockPost.mockResolvedValue({});
    // first poll: locked, second poll: unlocked
    mockGet
      .mockResolvedValueOnce({ data: { data: { lock: "clone" } } })
      .mockResolvedValueOnce({ data: { data: {} } });

    const client = createProxmoxClient(config);
    await client.cloneVm("my-box", 301);

    expect(mockPost).toHaveBeenCalledWith("/nodes/pve/qemu/200/clone", {
      newid: 301,
      name: "my-box",
      full: 1,
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledWith("/nodes/pve/qemu/301/config");
  });

  it("resolves immediately when VM is not locked after clone", async () => {
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValueOnce({ data: { data: {} } });

    const client = createProxmoxClient(config);
    await client.cloneVm("quick-box", 302);

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("throws if VM remains locked past timeout", async () => {
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValue({ data: { data: { lock: "clone" } } });

    const client = createProxmoxClient(config);
    await expect(client.cloneVm("stuck-box", 303, 100)).rejects.toThrow("still locked");
  }, 10000);
});

describe("setCloudInit", () => {
  it("posts ipconfig0 and URL-encoded sshkeys", async () => {
    mockPost.mockResolvedValue({});

    const client = createProxmoxClient(config);
    const key = "ssh-ed25519 AAAAC3Nz deck@laptop";
    await client.setCloudInit(301, key);

    expect(mockPost).toHaveBeenCalledWith("/nodes/pve/qemu/301/config", {
      ipconfig0: "ip=dhcp",
      sshkeys: encodeURIComponent(key),
    });
  });
});

describe("stopVm", () => {
  it("posts to status/stop and waits until stopped", async () => {
    mockPost.mockResolvedValue({});
    // first poll: running, second poll: stopped
    mockGet
      .mockResolvedValueOnce({ data: { data: { status: "running" } } })
      .mockResolvedValueOnce({ data: { data: { status: "stopped" } } });

    const client = createProxmoxClient(config);
    await client.stopVm(301);

    expect(mockPost).toHaveBeenCalledWith("/nodes/pve/qemu/301/status/stop");
    expect(mockGet).toHaveBeenCalledWith("/nodes/pve/qemu/301/status/current");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("resolves immediately when VM is already stopped", async () => {
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValueOnce({ data: { data: { status: "stopped" } } });

    const client = createProxmoxClient(config);
    await client.stopVm(301);

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("throws if VM does not stop before timeout", async () => {
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValue({ data: { data: { status: "running" } } });

    const client = createProxmoxClient(config);
    await expect(client.stopVm(301, 100)).rejects.toThrow("still running");
  }, 10000);
});

describe("destroyVm", () => {
  it("deletes the VM", async () => {
    mockDelete.mockResolvedValue({});
    const client = createProxmoxClient(config);
    await client.destroyVm(301);
    expect(mockDelete).toHaveBeenCalledWith("/nodes/pve/qemu/301");
  });
});

describe("nextVmid", () => {
  it("returns parsed integer from cluster/nextid", async () => {
    mockGet.mockResolvedValue({ data: { data: "305" } });

    const client = createProxmoxClient(config);
    const vmid = await client.nextVmid();

    expect(vmid).toBe(305);
    expect(mockGet).toHaveBeenCalledWith("/cluster/nextid");
  });
});

describe("getVmIp", () => {
  it("returns IPv4 from eth0", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          result: [
            {
              name: "eth0",
              "ip-addresses": [
                { "ip-address-type": "ipv4", "ip-address": "10.0.0.50" },
                { "ip-address-type": "ipv6", "ip-address": "fe80::1" },
              ],
            },
          ],
        },
      },
    });

    const client = createProxmoxClient(config);
    const ip = await client.getVmIp(301);
    expect(ip).toBe("10.0.0.50");
  });

  it("returns IPv4 from ens18", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          result: [
            {
              name: "ens18",
              "ip-addresses": [
                { "ip-address-type": "ipv4", "ip-address": "10.0.0.51" },
              ],
            },
          ],
        },
      },
    });

    const client = createProxmoxClient(config);
    const ip = await client.getVmIp(301);
    expect(ip).toBe("10.0.0.51");
  });

  it("returns null when agent call fails", async () => {
    mockGet.mockRejectedValue(new Error("agent not running"));

    const client = createProxmoxClient(config);
    const ip = await client.getVmIp(301);
    expect(ip).toBeNull();
  });

  it("returns null when no matching interface", async () => {
    mockGet.mockResolvedValue({
      data: { data: { result: [{ name: "lo", "ip-addresses": [] }] } },
    });

    const client = createProxmoxClient(config);
    const ip = await client.getVmIp(301);
    expect(ip).toBeNull();
  });
});
