# Dialogsys Server

Self-hosted HTTP sync server for Dialogsys projects.

Each connected device writes to its own **origin thread** under `projects/{slug}/origins/{originId}/`. The server keeps the latest saved version per origin. Devices can switch threads in the app to continue from another machine's state.

Project metadata lives at `projects/{slug}/project.json`. Origin indexes are stored in `projects/{slug}/.dialogsys/origins.json`.

User-managed `.git` folders inside an origin are allowed and sync like any other files.

## Run

**Local dev** (loopback, authentication optional):

```bash
cargo run -- --root ./projects --bind 127.0.0.1:3210
```

**Remote / LAN access** (requires a shared secret):

```bash
TOKEN="$(openssl rand -hex 32)"
cargo run -- --root ./projects --bind 0.0.0.0:3210 --auth-token "$TOKEN"
```

Paste the same token into Dialogsys **Settings → Access token** when using remote storage.

With config:

```bash
cargo run -- --config dialogsys-server.example.json
```

Set `authToken` in `dialogsys-server.example.json`. The server refuses to bind to non-loopback addresses without a token.

## Authentication

When `authToken` is configured (or `--auth-token` is passed), all routes except `GET /health` require:

```http
Authorization: Bearer <authToken>
```

Optional **read-only** tokens (`readAuthToken` or `readAuthTokens` in config) can list and download project files but cannot create projects or write/delete files. Use them for reviewers or hosted subscription viewers.

Example hook script: `hooks/example.mjs` (reject writes under `.git/`).

`GET /auth/capabilities` (authenticated) returns `{ "role": "read" | "write" }`.

### Realtime coauthoring (SSE)

- `GET /projects/:slug/realtime/events?token=<bearer>` — Server-Sent Events stream
- `POST /projects/:slug/realtime/presence?token=<bearer>` — register/update presence (`deviceId`, `displayName`, `originId`, `focusPath`)
- `POST /projects/:slug/realtime/leave?token=<bearer>` — `{ "deviceId": "…" }`
- `POST /projects/:slug/realtime/publish?token=<bearer>` — broadcast a JSON realtime event (write token only; used for `graphPatch`)

SSE event payloads (JSON `data:`):

- `{ "type": "presence", "peers": [ … ] }` — who is connected and what file they are editing
- `{ "type": "fileUpdated", "originId": "…", "path": "…", "contentHash": "…" }` — after a file write or delete on any origin thread

The app connects when **remote storage** is enabled; async file sync and thread switching remain the source of truth for saved data.

Use HTTPS behind a reverse proxy when the server is reachable outside your LAN.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Create a project |
| `GET` | `/projects/:slug` | Read project metadata |
| `GET` | `/projects/:slug/origins` | List origin threads |
| `POST` | `/projects/:slug/origins/:originId` | Ensure origin exists (scaffold if new) |
| `GET` | `/projects/:slug/origins/:originId/files` | List files and hashes for an origin |
| `GET` | `/projects/:slug/origins/:originId/files/*path` | Read a UTF-8 file |
| `PUT` | `/projects/:slug/origins/:originId/files/*path` | Write a UTF-8 file |
| `DELETE` | `/projects/:slug/origins/:originId/files/*path` | Delete a file |

Write request:

```json
{
  "content": "# Overview\n",
  "previousContentHash": "optional-sha256",
  "timestamp": "optional-client-timestamp"
}
```

When `previousContentHash` is present, the server rejects the write with `409 Conflict` if the file changed.

## Hooks

Hooks are external commands. The server sends one JSON object on stdin.

Supported hook events:

- `beforeRead`
- `afterRead`
- `beforeWrite`
- `afterWrite`

`before*` hooks may reject by exiting non-zero or printing:

```json
{ "reject": "reason" }
```

`beforeWrite` may transform content by printing:

```json
{ "content": "replacement content" }
```

`after*` hook failures are ignored by the request path.
