import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../index.js";

const mockProxmox = {
  cloneVm: vi.fn().mockResolvedValue(undefined),
  setCloudInit: vi.fn().mockResolvedValue(undefined),
  startVm: vi.fn().mockResolvedValue(undefined),
  stopVm: vi.fn().mockResolvedValue(undefined),
  destroyVm: vi.fn().mockResolvedValue(undefined),
  getVmIp: vi.fn().mockResolvedValue("10.0.0.100"),
  nextVmid: vi.fn().mockResolvedValue(301),
};

vi.mock("../proxmox.js", () => ({ createProxmoxClient: () => mockProxmox }));
vi.mock("../proxy.js", () => ({
  createProxyRouter: () => ({ handleHttp: () => false, handleUpgrade: () => false }),
}));
vi.mock("../db.js", () => {
  const devboxes = new Map();
  const db = {
    prepare: (sql: string) => ({
      all: () => [...devboxes.values()],
      get: (val: string) => {
        if (sql.includes("WHERE name")) return devboxes.get(val);
        if (sql.includes("WHERE id")) return [...devboxes.values()].find((d) => d.id === val);
        return null;
      },
      run: (...args: unknown[]) => {
        if (sql.includes("INSERT INTO devboxes")) {
          const [id, name, vmid] = args as [string, string, number];
          devboxes.set(name, { id, name, proxmox_vmid: vmid, ip: null, status: "provisioning" });
        }
        if (sql.includes("UPDATE devboxes SET ip")) {
          const [ip, id] = args as [string, string];
          const devbox = [...devboxes.values()].find((d) => d.id === id);
          if (devbox) { devbox.ip = ip; devbox.status = "running"; }
        }
        if (sql.includes("DELETE FROM devboxes")) {
          const id = args[0] as string;
          const entry = [...devboxes.entries()].find(([, v]) => v.id === id);
          if (entry) devboxes.delete(entry[0]);
        }
      },
    }),
    exec: vi.fn(),
    pragma: vi.fn(),
  };
  return { getDb: () => db };
});

const TOKEN = "test-token";

describe("devbox routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.PROXMOX_HOST = "proxmox.local";
    process.env.PROXMOX_TOKEN_ID = "user@pve!token";
    process.env.PROXMOX_TOKEN_SECRET = "secret";
    process.env.API_TOKEN = TOKEN;
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("GET /health returns ok without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("GET /devboxes requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/devboxes" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /devboxes returns empty list initially", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /devboxes creates a devbox", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "my-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.name).toBe("my-box");
    expect(body.status).toBe("provisioning");
  });

  it("POST /devboxes rejects invalid name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "My Box!", ssh_key: "ssh-ed25519 AAAA..." },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /devboxes rejects duplicate name", async () => {
    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "dup-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    const res = await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "dup-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET /devboxes/:name returns 404 for unknown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/devboxes/ghost",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /devboxes/:name returns devbox with url field", async () => {
    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "url-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    const res = await app.inject({
      method: "GET",
      url: "/devboxes/url-box",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe("url-box");
    expect(body).toHaveProperty("url");
  });

  it("GET /devboxes includes url field in list", async () => {
    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "list-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    const res = await app.inject({
      method: "GET",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ url: unknown }>;
    expect(body.every((d) => "url" in d)).toBe(true);
  });

  it("DELETE /devboxes/:name returns 404 for unknown", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/devboxes/ghost",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /devboxes/:name destroys existing devbox", async () => {
    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "del-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
    const res = await app.inject({
      method: "DELETE",
      url: "/devboxes/del-box",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(204);
    expect(mockProxmox.destroyVm).toHaveBeenCalledOnce();
  });
});
