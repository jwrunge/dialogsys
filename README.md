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
- `portraits/` — character portrait images (uploaded in the character editor)

## Character display states

Each character can have multiple **display states** (e.g. `curious`, `panicked`), each with its own portrait. Upload images in the character editor (stored as `portraits/<characterId>_<stateId>.png`) or paste an `https://` URL. One state is the **default**. Line nodes pick a `characterState` id; export resolves the portrait from the character definition and bundles image files in the download zip.

Open **Issues** (`/projects/<slug>/issues`) to see warnings such as:

- **Undefined character state** — a line uses `panicked` for Jane but Jane has no `panicked` state defined
- **Unused character state** — a state is defined but never used (opt out per state on the character)
- **Unused scene branch** — condition/choice paths not wired (opt out with “Just use this branch” on an edge)

On condition and choice nodes, use **Force branch** or per-edge **Just use this branch** to always follow one path at export and suppress alternate-branch warnings.

## Cloud sync (self-hosted server)

Dialogsys includes a Rust sync server in `sync-server/`. In **Settings**, choose **Remote sync server** and enter its URL.

Each app install gets a **device ID** (UUID). Saves go to that device's **origin thread** on the server. Inside a project, use **Working thread** to switch to another device's latest saved version.

Local mode keeps projects on disk only. Remote mode reads and writes through the sync server (with a local cache for performance). You can add your own Git repo inside a project if you want; `.git` files sync like any other project files.

```bash
cd sync-server
cargo run -- --root ./projects --bind 127.0.0.1:3210
```

For access from other devices, bind to your LAN or VPN interface and set a shared token:

```bash
cargo run -- --bind 0.0.0.0:3210 --auth-token "$(openssl rand -hex 32)"
```

Enter that token in Dialogsys **Settings** alongside the sync server URL.

The server intentionally serves HTTP only; put HTTPS behind nginx, Caddy, Traefik, or another reverse proxy. See `sync-server/README.md` for the API, authentication, and hook contract.

## Export

Open **Export** in a project to validate and download a zip bundle.

- **Godot** — `godot/` folder with `DialogueRunner.gd`, dialog JSON (`res://dialogue/portraits/…` paths), and bundled portraits. Unzip and copy into your game as `res://dialogue/`.
- **Generic** — portable `generic/` folder with dialog JSON (relative `portraits/…` paths), `characters.json`, `manifest.json`, and portrait images for custom engines.

## Godot integration

1. In Dialogsys, open **Export** and click **Export Godot (.zip)**.
2. Unzip and copy the `godot/` folder into your game as `res://dialogue/`.
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
