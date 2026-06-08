# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Dialogsys is a local-first Astro + Svelte 5 web app for authoring branching dialogue for Godot games. A single Node dev server serves both pages and `/api/*` REST endpoints. Project data is stored as JSON/markdown files on disk (default `./projects`).

### Requirements

- **Node.js** `>=22.12.0` (see `package.json` `engines`)
- **npm** (lockfile: `package-lock.json`)
- **Sync server** (optional): run `sync-server/` for multi-device cloud storage

### Standard commands

See `README.md` for full documentation. Common commands:

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at http://localhost:4321 (`predev` seeds `projects/demo` from `seed/projects/demo`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run tauri:dev` | Tauri native shell + Astro dev server |
| `npm run tauri:build` | Desktop release bundle (spawns bundled Node + Astro server) |

| `npm run test` | Vitest unit tests |
| `npm run lint` | Biome lint + format check |
| `npm run check` | Astro TypeScript check (`astro check`) |
| `npm run seed:translations` | Build `i18n/translations.sqlite` from `src/lib/i18n/catalog/*.json` |

### Tauri shell

- Config: `src-tauri/tauri.conf.json` (+ `tauri.ios.conf.json`, `tauri.android.conf.json`)
- Release builds run `scripts/prepare-tauri.mjs` (Astro build → `src-tauri/resources/web/`, Node runtime → `src-tauri/binaries/`)
- Desktop prod URL: `http://127.0.0.1:4310` (local Node sidecar). Dev uses `devUrl` `http://127.0.0.1:4321`.
- Remote storage: `storageMode: remote` routes project I/O through sync server origin threads (`clientId` per device).
- Rust toolchain: `rust-toolchain.toml` (stable)

### Running the dev server

Run `npm run dev` in a tmux session (e.g. `dialogsys-dev`). The server binds to `localhost:4321`.

After startup, verify with:

```bash
curl -s http://localhost:4321/api/projects
```

### Hello-world verification

1. Open http://localhost:4321 — home page lists projects.
2. Open the seeded **Demo Tavern** project (`/projects/demo`, redirects to `/projects/demo/characters`).
3. Open the **Tavern Intro** scene graph editor at `/projects/demo/scenes/tavern_intro` (or `/projects/demo/dialogs/tavern_intro`, which redirects there).

The graph editor should show Entry, Direction, Line, Condition, Set var, and End nodes.

### Configuration

- Default projects root: `./projects`
- Override via **Settings** (`/settings`) or env var `DIALOGSYS_PROJECTS_ROOT` (see `.env.example`)

### Localization

- Client: `@jwrunge/transmut` `TranslationObserver` with `requireExplicitOptIn: true` (mark app UI with `data-transmut="include"`).
- User/project content: `data-transmut-skip` on names, dialogue, notes, validation messages with dynamic IDs.
- Locale preference: `locale` in `dialogsys.config.json` / Settings; catalogs in `src/lib/i18n/catalog/` (seeded to `i18n/translations.sqlite`).

### Gotchas

- If the Scenes list hangs on "Loading scenes..." or the browser console shows Astro module 404s, stop the dev server, run `npm run build`, then restart `npm run dev`.
- Svelte dev warnings (e.g. `state_referenced_locally`) are expected and do not block the app.
