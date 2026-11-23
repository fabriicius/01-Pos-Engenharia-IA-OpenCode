# Design System

> Component and token guidance for UI work. Status: **[target/evolving]**.

## Base

- **Foundation**: shadcn/ui patterns/components.
- **Shared package**: `packages/ui` (`@repo/ui`) is the intended home for reusable UI components.
- **Current state**: `@repo/ui` contains starter components (`button`, `card`, `code`) exported via `./* -> ./src/*.tsx`. No shadcn setup is present yet.

## Component conventions

- Prefer composing existing `@repo/ui`/shadcn primitives over one-off custom components.
- Keep components accessible: semantic markup, labels, keyboard behavior, focus states, ARIA only when needed.
- Keep components responsive: avoid fixed widths that break small screens; test common breakpoints.
- Keep styling token-driven; avoid hard-coded colors when a design token exists.
- Export reusable components from `packages/ui`; app-specific composition stays in the app.

## Tokens

- Use the palette defined in `DESIGN.md`.
- Introduce semantic tokens (e.g., `--background`, `--foreground`, `--primary`, `--muted`) mapped to palette tokens before scaling component work.
- Light theme only, unless product direction explicitly changes.

## Workflow for UI changes

1. Read `DESIGN.md`, `DEVELOPMENT.md`, and `AGENTS.md`.
2. Load required UI skills (`frontend-design`, `web-design-guidelines`) before implementing UI.
3. Check for an existing component in `@repo/ui` before creating a new one.
4. Add/update tests or visual verification steps as applicable.
