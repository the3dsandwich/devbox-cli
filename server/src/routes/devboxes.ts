import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import type { ProxmoxClient } from "../proxmox.js";
import type { CaddyClient } from "../caddy.js";
import { getDb } from "../db.js";

const createSchema = z.object({
  name: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
  ssh_key: z.string().min(1),
});

const devboxUrl = (name: string, ip: string | null, domain: string) =>
  ip ? `http://${name}.${domain}` : null;

export const devboxRoutes = async (
  app: FastifyInstance,
  { proxmox, caddy, domain }: { proxmox: ProxmoxClient; caddy: CaddyClient; domain: string }
) => {
  app.get("/devboxes", async () => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM devboxes ORDER BY created_at DESC").all() as Array<{
      name: string; ip: string | null; [key: string]: unknown;
    }>;
    return rows.map((d) => ({ ...d, url: devboxUrl(d.name, d.ip, domain) }));
  });

  app.post("/devboxes", async (req, reply) => {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { name, ssh_key } = body.data;
    const db = getDb();

    const existing = db.prepare("SELECT id FROM devboxes WHERE name = ?").get(name);
    if (existing) return reply.status(409).send({ error: "name already taken" });

    const vmid = await proxmox.nextVmid();
    const id = randomUUID();

    db.prepare(
      "INSERT INTO devboxes (id, name, proxmox_vmid, status) VALUES (?, ?, ?, 'provisioning')"
    ).run(id, name, vmid);

    // provision async
    (async () => {
      try {
        await proxmox.cloneVm(name, vmid);
        await proxmox.setCloudInit(vmid, ssh_key);
        await proxmox.startVm(vmid);

        // poll for IP (up to 2 min)
        let ip: string | null = null;
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          ip = await proxmox.getVmIp(vmid);
          if (ip) break;
        }

        if (ip) {
          db.prepare("UPDATE devboxes SET ip = ?, status = 'running' WHERE id = ?").run(ip, id);
          await caddy.addRoute(name, ip, 8080, domain);
        } else {
          db.prepare("UPDATE devboxes SET status = 'running' WHERE id = ?").run(id);
        }
      } catch (err) {
        db.prepare("UPDATE devboxes SET status = 'stopped' WHERE id = ?").run(id);
        app.log.error(err, `Failed to provision devbox ${name}`);
      }
    })();

    return reply.status(202).send({ id, name, vmid, status: "provisioning" });
  });

  app.get("/devboxes/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const db = getDb();
    const devbox = db.prepare("SELECT * FROM devboxes WHERE name = ?").get(name) as
      | { name: string; ip: string | null; [key: string]: unknown }
      | undefined;
    if (!devbox) return reply.status(404).send({ error: "not found" });
    return { ...devbox, url: devboxUrl(devbox.name, devbox.ip, domain) };
  });

  app.delete("/devboxes/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const db = getDb();
    const devbox = db.prepare("SELECT * FROM devboxes WHERE name = ?").get(name) as
      | { id: string; proxmox_vmid: number }
      | undefined;
    if (!devbox) return reply.status(404).send({ error: "not found" });

    await proxmox.stopVm(devbox.proxmox_vmid).catch(() => {});
    await proxmox.destroyVm(devbox.proxmox_vmid);
    await caddy.removeRoute(name).catch(() => {});

    db.prepare("DELETE FROM exposed_ports WHERE devbox_id = ?").run(devbox.id);
    db.prepare("DELETE FROM devboxes WHERE id = ?").run(devbox.id);

    return reply.status(204).send();
  });
};
