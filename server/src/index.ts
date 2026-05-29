import Fastify from "fastify";
import cors from "@fastify/cors";
import { createServer } from "http";
import { createProxmoxClient } from "./proxmox.js";
import { devboxRoutes } from "./routes/devboxes.js";
import { portRoutes } from "./routes/ports.js";
import { createProxyRouter, type ProxyRoute } from "./proxy.js";
import { getDb } from "./db.js";

const requiredEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const buildApp = async () => {
  const app = Fastify({ logger: true, serverFactory: (handler) => createServer(handler) });

  await app.register(cors);

  const proxmox = createProxmoxClient({
    host: requiredEnv("PROXMOX_HOST"),
    tokenId: requiredEnv("PROXMOX_TOKEN_ID"),
    tokenSecret: requiredEnv("PROXMOX_TOKEN_SECRET"),
    node: process.env.PROXMOX_NODE ?? "pve",
    templateVmid: parseInt(process.env.PROXMOX_TEMPLATE_VMID ?? "200", 10),
    vmidRangeStart: parseInt(process.env.PROXMOX_VMID_RANGE_START ?? "300", 10),
  });

  const domain = process.env.DEVBOX_DOMAIN ?? "devbox.local";
  const token = requiredEnv("API_TOKEN");

  const getRoutes = (): Map<string, ProxyRoute> => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT d.name, d.ip, p.port, p.subdomain
         FROM exposed_ports p
         JOIN devboxes d ON d.id = p.devbox_id
         WHERE d.ip IS NOT NULL`
      )
      .all() as Array<{ name: string; ip: string; port: number; subdomain: string }>;

    const map = new Map<string, ProxyRoute>();
    // devbox root (code-server on 8080)
    const devboxes = db
      .prepare("SELECT name, ip FROM devboxes WHERE ip IS NOT NULL")
      .all() as Array<{ name: string; ip: string }>;
    for (const d of devboxes) map.set(d.name, { ip: d.ip, port: 8080 });
    // exposed ports
    for (const r of rows) map.set(r.subdomain, { ip: r.ip, port: r.port });
    return map;
  };

  const { handleHttp, handleUpgrade } = createProxyRouter(getRoutes, domain, app.log);

  // WebSocket upgrades never reach Fastify hooks — handle at the raw server level
  app.server.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket as import("net").Socket, head);
  });

  // proxy middleware runs before auth — unauthenticated devbox traffic passes through
  app.addHook("onRequest", async (req, reply) => {
    const handled = handleHttp(req.raw, reply.raw);
    if (handled) {
      // prevent Fastify from processing this request further
      reply.hijack();
    }
  });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) return reply.status(401).send({ error: "unauthorized" });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(devboxRoutes, { proxmox, domain });
  await app.register(portRoutes, { domain });

  return app;
};

if (process.env.NODE_ENV !== "test") {
  const app = await buildApp();
  await app.listen({ port: parseInt(process.env.PORT ?? "3000", 10), host: "0.0.0.0" });
}
