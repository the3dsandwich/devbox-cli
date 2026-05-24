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

const mockCaddy = {
  addRoute: vi.fn().mockResolvedValue(undefined),
  removeRoute: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../proxmox.js", () => ({ createProxmoxClient: () => mockProxmox }));
vi.mock("../caddy.js", () => ({ createCaddyClient: () => mockCaddy }));
vi.mock("../db.js", () => {
  const devboxes = new Map<string, { id: string; name: string; ip: string | null; proxmox_vmid: number }>();
  const ports = new Map<string, { devbox_id: string; port: number; subdomain: string }>();

  const db = {
    prepare: (sql: string) => ({
      all: () => [...devboxes.values()],
      get: (val: string | number) => {
        if (sql.includes("devboxes WHERE name")) return devboxes.get(val as string);
        if (sql.includes("devboxes WHERE id")) return [...devboxes.values()].find((d) => d.id === val);
        return null;
      },
      run: (...args: unknown[]) => {
        if (sql.includes("INSERT INTO devboxes")) {
          const [id, name, vmid] = args as [string, string, number];
          devboxes.set(name, { id, name, proxmox_vmid: vmid, ip: "10.0.0.100" });
        }
        if (sql.includes("INSERT OR REPLACE INTO exposed_ports")) {
          const [devbox_id, port, subdomain] = args as [string, number, string];
          ports.set(subdomain, { devbox_id, port, subdomain });
        }
        if (sql.includes("DELETE FROM exposed_ports") && sql.includes("AND port")) {
          const [devbox_id, port] = args as [string, number];
          const key = [...ports.entries()].find(([, v]) => v.devbox_id === devbox_id && v.port === port)?.[0];
          if (key) ports.delete(key);
        }
        if (sql.includes("DELETE FROM exposed_ports WHERE devbox_id")) {
          const [devbox_id] = args as [string];
          for (const [k, v] of ports.entries()) {
            if (v.devbox_id === devbox_id) ports.delete(k);
          }
        }
        if (sql.includes("DELETE FROM devboxes")) {
          const [id] = args as [string];
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

describe("port routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.PROXMOX_HOST = "proxmox.local";
    process.env.PROXMOX_TOKEN_ID = "user@pve!token";
    process.env.PROXMOX_TOKEN_SECRET = "secret";
    process.env.API_TOKEN = TOKEN;
    vi.clearAllMocks();
    app = await buildApp();

    // seed a running devbox
    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "my-box", ssh_key: "ssh-ed25519 AAAA..." },
    });
  });

  it("POST /devboxes/:name/ports exposes a port and returns URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/devboxes/my-box/ports",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { port: 3000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.subdomain).toBe("my-box-3000");
    expect(body.url).toMatch(/my-box-3000/);
    expect(mockCaddy.addRoute).toHaveBeenCalledWith("my-box-3000", "10.0.0.100", 3000, expect.any(String));
  });

  it("POST /devboxes/:name/ports returns 404 for unknown devbox", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/devboxes/ghost/ports",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { port: 3000 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /devboxes/:name/ports returns 400 for invalid port", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/devboxes/my-box/ports",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { port: 99999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /devboxes/:name/ports/:port unexposes a port", async () => {
    await app.inject({
      method: "POST",
      url: "/devboxes/my-box/ports",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { port: 3000 },
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/devboxes/my-box/ports/3000",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(204);
    expect(mockCaddy.removeRoute).toHaveBeenCalledWith("my-box-3000");
  });

  it("DELETE /devboxes/:name/ports/:port returns 404 for unknown devbox", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/devboxes/ghost/ports/3000",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("URL uses configured DEVBOX_DOMAIN", async () => {
    process.env.DEVBOX_DOMAIN = "mycompany.com";
    app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/devboxes",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: "domain-box", ssh_key: "ssh-ed25519 AAAA..." },
    });

    const res = await app.inject({
      method: "POST",
      url: "/devboxes/domain-box/ports",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { port: 4000 },
    });
    expect(res.json().url).toBe("http://domain-box-4000.mycompany.com");
    delete process.env.DEVBOX_DOMAIN;
  });
});
