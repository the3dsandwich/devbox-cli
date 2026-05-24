import Fastify from "fastify";
import cors from "@fastify/cors";
import { createProxmoxClient } from "./proxmox.js";
import { createCaddyClient } from "./caddy.js";
import { devboxRoutes } from "./routes/devboxes.js";
import { portRoutes } from "./routes/ports.js";

const requiredEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors);

  const proxmox = createProxmoxClient({
    host: requiredEnv("PROXMOX_HOST"),
    tokenId: requiredEnv("PROXMOX_TOKEN_ID"),
    tokenSecret: requiredEnv("PROXMOX_TOKEN_SECRET"),
    node: process.env.PROXMOX_NODE ?? "pve",
    templateVmid: parseInt(process.env.PROXMOX_TEMPLATE_VMID ?? "200", 10),
    vmidRangeStart: parseInt(process.env.PROXMOX_VMID_RANGE_START ?? "300", 10),
  });

  const caddy = createCaddyClient(process.env.CADDY_ADMIN_URL ?? "http://localhost:2019");
  const domain = process.env.DEVBOX_DOMAIN ?? "devbox.local";

  const token = requiredEnv("API_TOKEN");

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) return reply.status(401).send({ error: "unauthorized" });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(devboxRoutes, { proxmox, caddy, domain });
  await app.register(portRoutes, { caddy, domain });

  return app;
};

if (process.env.NODE_ENV !== "test") {
  const app = await buildApp();
  await app.listen({ port: parseInt(process.env.PORT ?? "3000", 10), host: "0.0.0.0" });
}
