# Dialogsys

Local-first dialog authoring for Godot games. Edit branching conversations in a visual graph editor, manage characters and game state, write direction notes, and export JSON plus a reference `DialogueRunner.gd`.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) and open the **demo** project at `/projects/demo`.

## Configuration

Set `DIALOGSYS_PROJECTS_ROOT` to change where projects are stored (default: `./projects`).

## Project structure

Each project is a folder:

- `project.json` — metadata
- `characters.json` — character definitions
- `variables.json` — global and per-character state
- `notes/` — markdown overview and direction notes
- `dialogs/*.graph.json` — source graph (editor format)
- `export/godot/` — generated Godot runtime files

## Character display states

Each character can have multiple **display states** (e.g. `curious`, `panicked`), each with its own portrait path. One state is the **default**. Line nodes pick a `characterState` id; export resolves the portrait from the character definition.

Open **Issues** (`/projects/<slug>/issues`) to see warnings such as:

- **Undefined character state** — a line uses `panicked` for Jane but Jane has no `panicked` state defined
- **Unused character state** — a state is defined but never used (opt out per state on the character)
- **Unused dialog branch** — condition/choice paths not wired (opt out with “Just use this branch” on an edge)

On condition and choice nodes, use **Force branch** or per-edge **Just use this branch** to always follow one path at export and suppress alternate-branch warnings.

## Godot integration

1. In Dialogsys, open **Export** and click **Export to Godot**.
2. Copy `projects/<slug>/export/godot/` into your game as `res://dialogue/`.
3. Autoload `DialogueRunner.gd`.
4. Call `start("tavern_intro")` and wire UI to `line_shown`, `choices_shown`, `dialogue_ended`, and `run_command`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Stack

- [Astro](https://astro.build) + Node adapter (API + pages)
- [Svelte](https://svelte.dev) islands (graph editor, forms)
- [@xyflow/svelte](https://svelteflow.dev) (dialog graph)
- [Zod](https://zod.dev) (validation)
