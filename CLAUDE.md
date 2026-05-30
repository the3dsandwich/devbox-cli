# devbox-cli

Personal Proxmox devbox manager: REST API server + CLI client, both TypeScript.

## Structure

- `server/` — Fastify REST API, runs in Docker on the infra VM
- `cli/` — `devbox` CLI tool, installed on laptops

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x (ES2022, NodeNext modules) |
| Server framework | Fastify 5 + Zod validation |
| CLI framework | Commander 13 |
| Database | better-sqlite3 (WAL mode, in-process migration) |
| Proxmox | Axios to Proxmox API v2/json |
| Proxy | http-proxy (HTTP + WebSocket upgrades) |
| Testing | Vitest 3, coverage via v8 (80% threshold) |
| Deploy | Docker / compose.yaml + cloudflared tunnel |

## Code Style

- Arrow functions everywhere — no `function` declarations
- ESM (`"type": "module"`), import paths must include `.js` extension
- Strict TypeScript (`strict: true`)
- No comments unless the why is non-obvious

## Testing — TDD Workflow

- Write tests FIRST, then implement
- Test files in `src/__tests__/*.test.ts`
- Run from within the sub-package directory:
  ```sh
  cd server && npm test
  cd cli && npm test
  ```
- Coverage: `npm run test:coverage` (80% line/function/branch threshold enforced)
- Server tests: mock `proxmox.js`, `proxy.js`, and `db.js` — use in-memory Maps for db
- CLI tests: mock `axios` via `vi.mock("axios")`

## Build & Run

```sh
# CLI dev
cd cli && npm run dev

# Server dev
cd server && npm run dev

# Build CLI
cd cli && npm run build   # outputs to cli/dist/

# Build server Docker image
docker build -t devbox-server server/
```

## Key Env Vars (server)

See `server/.env.example`. Required: `PROXMOX_HOST`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, `API_TOKEN`.

## Git & PR Workflow

- Branch from `main`, use prefix: `feat/`, `fix/`, `chore/`, `refactor/`, `ci/`
- Every change goes through a PR — no direct commits to `main`
- Before creating a PR: verify `main` is up to date (fast-forward), pull if behind
- After pushing: monitor CI (runs tests on PR, builds image on merge to main)
- After merging: delete the remote branch; prune local merged branches with `git fetch --prune && git branch -d <branch>`
- Commit style: `type: short imperative message` (e.g. `feat: add ssh command`)

## CI

- `.github/workflows/ci.yml` — runs `npm test` in both `server/` and `cli/` on every PR to `main`
- `.github/workflows/release.yml` — on merge to `main`: runs tests, builds server Docker image to `ghcr.io`, uploads CLI dist artifact
