# devbox-cli

Personal devbox service for Proxmox. Manage isolated developer VMs with a single CLI.

## Structure

- `server/` — REST API (Fastify + TypeScript), runs in Docker on your Proxmox infra VM
- `cli/` — CLI tool (`devbox`), installed on your laptops

## Usage

```sh
devbox login http://devbox-server.local
devbox create my-box
devbox list
devbox open my-box
devbox expose my-box 3000
devbox ssh my-box
devbox destroy my-box
```

## Server setup

Copy `server/compose.yaml` and `server/Caddyfile` to your infra VM. Create a `.env`:

```env
PROXMOX_HOST=10.0.0.1
PROXMOX_TOKEN_ID=user@pve!devbox
PROXMOX_TOKEN_SECRET=your-secret
PROXMOX_TEMPLATE_VMID=200
API_TOKEN=choose-a-strong-token
```

Then:

```sh
docker compose up -d
```
