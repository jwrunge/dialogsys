# Dialogsys Server

Self-hosted HTTP sync server for Dialogsys projects.

The server stores the same project folder format used by the local app:

- `project.json`
- `characters.json`
- `gameState.json`
- `notes/*.md`
- `dialogs/*.graph.json`
- `sequences/*.graph.json`

It intentionally serves plain HTTP. Put HTTPS behind nginx, Caddy, Traefik, or another reverse proxy.

## Run

```bash
cargo run -- --root ./projects --bind 127.0.0.1:3210
```

With config:

```bash
cargo run -- --config dialogsys-server.example.json
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Create a project |
| `GET` | `/projects/:slug` | Read project metadata |
| `GET` | `/projects/:slug/files` | List project files and hashes |
| `GET` | `/projects/:slug/files/*path` | Read a UTF-8 project file |
| `PUT` | `/projects/:slug/files/*path` | Write a UTF-8 project file |
| `POST` | `/projects/:slug/snapshot` | Run snapshot hooks and optional Git commit |

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

Payload:

```json
{
  "event": "beforeWrite",
  "project": "demo",
  "path": "notes/overview.md",
  "content": "# Overview\n",
  "timestamp": "2026-06-08T00:00:00Z",
  "contentHash": "sha256",
  "previousContentHash": null,
  "requestId": "server-generated-id"
}
```

Supported hook events:

- `beforeRead`
- `afterRead`
- `beforeWrite`
- `afterWrite`
- `beforeSnapshot`
- `afterSnapshot`

`before*` hooks may reject by exiting non-zero or printing:

```json
{ "reject": "reason" }
```

`beforeWrite` may transform content by printing:

```json
{ "content": "replacement content" }
```

`after*` hook failures are ignored by the request path.

JavaScript hooks work as normal subprocesses:

```json
{
  "hooks": {
    "beforeWrite": ["node", "./hooks/before-write.js"]
  }
}
```

## Git

Git is optional and runs as an external command. Enable auto-commits on write:

```json
{
  "git": {
    "enabled": true,
    "autoCommit": true,
    "branch": "main",
    "remote": "origin",
    "push": false
  }
}
```

Set `push` to `true` only after configuring the project repository remote yourself.
