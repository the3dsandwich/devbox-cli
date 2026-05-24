import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CaddyClient } from "../caddy.js";
import { getDb } from "../db.js";

const exposeSchema = z.object({ port: z.number().int().min(1).max(65535) });

export const portRoutes = async (
  app: FastifyInstance,
  { caddy }: { caddy: CaddyClient }
) => {
  app.post("/devboxes/:name/ports", async (req, reply) => {
    const { name } = req.params as { name: string };
    const body = exposeSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const db = getDb();
    const devbox = db.prepare("SELECT * FROM devboxes WHERE name = ?").get(name) as
      | { id: string; ip: string | null }
      | undefined;
    if (!devbox) return reply.status(404).send({ error: "not found" });
    if (!devbox.ip) return reply.status(409).send({ error: "devbox has no IP yet" });

    const { port } = body.data;
    const subdomain = `${name}-${port}`;

    await caddy.addRoute(subdomain, devbox.ip, port);
    db.prepare(
      "INSERT OR REPLACE INTO exposed_ports (devbox_id, port, subdomain) VALUES (?, ?, ?)"
    ).run(devbox.id, port, subdomain);

    return { subdomain, url: `http://${subdomain}.devbox.local` };
  });

  app.delete("/devboxes/:name/ports/:port", async (req, reply) => {
    const { name, port } = req.params as { name: string; port: string };
    const db = getDb();
    const devbox = db.prepare("SELECT id FROM devboxes WHERE name = ?").get(name) as
      | { id: string }
      | undefined;
    if (!devbox) return reply.status(404).send({ error: "not found" });

    const subdomain = `${name}-${port}`;
    await caddy.removeRoute(subdomain).catch(() => {});
    db.prepare("DELETE FROM exposed_ports WHERE devbox_id = ? AND port = ?").run(
      devbox.id,
      parseInt(port, 10)
    );

    return reply.status(204).send();
  });
};
