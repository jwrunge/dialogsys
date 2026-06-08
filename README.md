# Dialogsys

Local-first scene authoring for Godot games. Edit branching conversations in a visual graph editor, manage characters and game state, add direction in scene graphs, and export JSON plus a reference `DialogueRunner.gd`.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) and open the **demo** project at `/projects/demo`.

## Configuration

Projects are saved as folders on disk (default: `./projects` in the app directory). Open **Settings** (`/settings`) to change the path, or set `DIALOGSYS_PROJECTS_ROOT` in the environment to override.

## Project structure

Each project is a folder:

- `project.json` — metadata
- `characters.json` — character definitions
- `notes/` — markdown project overview
- `dialogs/*.graph.json` — scene source graphs (editor format); use **Condition** and **Set var** nodes for branching state
- `export/godot/` — generated Godot runtime files

## Character display states

Each character can have multiple **display states** (e.g. `curious`, `panicked`), each with its own portrait path. One state is the **default**. Line nodes pick a `characterState` id; export resolves the portrait from the character definition.

Open **Issues** (`/projects/<slug>/issues`) to see warnings such as:

- **Undefined character state** — a line uses `panicked` for Jane but Jane has no `panicked` state defined
- **Unused character state** — a state is defined but never used (opt out per state on the character)
- **Unused scene branch** — condition/choice paths not wired (opt out with “Just use this branch” on an edge)

On condition and choice nodes, use **Force branch** or per-edge **Just use this branch** to always follow one path at export and suppress alternate-branch warnings.

## History and autosave (Git)

Each project folder is a **local Git repository** (not pushed to GitHub). Snapshots are created when you:

- Save characters (immediate), create/delete scenes (immediate)
- Save scenes or notes (debounced, default 60s)
- Use **Save snapshot now** on the History page
- Keep a project page open (interval autosave, default 5 minutes)

Snapshots are stored as `autosave/*` branches and pruned after **7 days** (configurable via `SNAPSHOT_RETENTION_DAYS`). Restore replaces project files with a past snapshot and records a new autosave afterward.

**Git must be installed** (`git` on your PATH). If it is missing, the app still saves project files normally; the **History** page shows an install prompt and autosave is skipped.

## Self-hosted sync server

Dialogsys includes a simple Rust sync server in `sync-server/`. It stores the same project folder format, exposes HTTP endpoints for listing projects and reading/writing files, and can run optional command hooks such as JavaScript scripts or Git automation on reads, writes, and snapshots.

```bash
cd sync-server
cargo run -- --root ./projects --bind 127.0.0.1:3210
```

The server intentionally serves HTTP only; put HTTPS behind nginx, Caddy, Traefik, or another reverse proxy. See `sync-server/README.md` for the API and hook contract.

## Godot integration

1. In Dialogsys, open **Export** and click **Export to Godot**.
2. Copy `projects/<slug>/export/godot/` into your game as `res://dialogue/`.
3. Autoload `DialogueRunner.gd`.
4. Call `start("tavern_intro")` and wire UI to `line_shown`, `choices_shown`, `dialogue_ended`, and `run_command`.

## Desktop and mobile app (Tauri)

Dialogsys ships as a [Tauri](https://v2.tauri.app) shell around the same Astro app. One shared codebase — no per-OS UI logic.

### Prerequisites

- **Rust** (stable toolchain; see `rust-toolchain.toml`)
- **Tauri prerequisites** for your platform: [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/)
- **iOS builds:** Xcode, CocoaPods (`pod`), and `npm run tauri ios init` (already run once in this repo)
- **Android builds:** Android Studio / SDK / NDK, and `npm run tauri android init`

### Development

```bash
npm install
npm run tauri:dev
```

This starts the Astro dev server and opens the native window at `http://localhost:4321`.

### Desktop release builds

`npm run tauri:build` bundles the Astro server, a Node runtime for the target platform, and opens the app at `http://127.0.0.1:4310`. Project data is stored under the OS app data directory (with the demo project seeded on first launch).

| Command | Output |
|---------|--------|
| `npm run tauri:build` | Native bundle for the current machine |
| `npm run tauri:build:mac` | macOS Apple Silicon `.app` / `.dmg` |
| `npm run tauri:build:mac-intel` | macOS Intel |
| `npm run tauri:build:win` | Windows `.msi` / `.exe` (cross-compile from macOS/Linux requires extra tooling) |
| `npm run tauri:build:linux` | Linux `.deb` / `.AppImage` |

Prepare bundled assets manually with `npm run tauri:prepare` (also runs automatically before `tauri build`).

### Mobile

| Command | Description |
|---------|-------------|
| `npm run tauri:ios:dev` | iOS Simulator + Astro dev server on your Mac |
| `npm run tauri:ios:build` | iOS release build (requires Apple signing setup) |
| `npm run tauri:android:dev` | Android emulator/device + Astro dev server |
| `npm run tauri:android:build` | Android APK/AAB |

Mobile **release** builds are a thin shell today: offline editing requires the desktop app. Use `tauri ios dev` / `tauri android dev` during development, or the desktop app for full local authoring.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (browser) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run tauri:dev` | Native app + dev server |
| `npm run tauri:build` | Native desktop release build |

## Stack

- [Astro](https://astro.build) + Node adapter (API + pages)
- [Svelte](https://svelte.dev) islands (graph editor, forms)
- [@xyflow/svelte](https://svelteflow.dev) (scene graph)
- [Zod](https://zod.dev) (validation)
- [Tauri](https://v2.tauri.app) (desktop + mobile shell)
