# Design

> Visual direction for the product UI. Status: **[target]** unless reflected in code.

## Principles

- **Clean, minimal, elegant** interface.
- **Pastel palette** with soft contrast and clear hierarchy.
- **Light theme only**. Do not introduce dark mode unless product direction changes.
- **Accessible by default**: semantic HTML, keyboard support, visible focus, sufficient contrast.
- **Responsive by default**: desktop, tablet, and mobile layouts.

## Color tokens

Proposed CSS variables:

| Token            | Hex       | Intended use                             |
| ---------------- | --------- | ---------------------------------------- |
| `--powder-petal` | `#eddcd2` | Subtle contrast/accent on light surfaces |
| `--linen`        | `#fff1e6` | Primary background/surface               |
| `--soft-blush`   | `#fde2e4` | Soft warning/error background            |
| `--petal-frost`  | `#fad2e1` | Accent/highlight background              |
| `--light-cyan`   | `#c5dedd` | Success/info background                  |
| `--mint-cream`   | `#dbe7e4` | Secondary surface                        |
| `--parchment`    | `#f0efeb` | Neutral surface/background               |
| `--alice-blue`   | `#d6e2e9` | Interactive/support surface              |
| `--pale-sky`     | `#bcd4e6` | Interactive hover/secondary accent       |
| `--powder-blue`  | `#99c1de` | Primary interactive accent               |

## Usage guidance

- **Surfaces/backgrounds**: `--linen`, `--parchment`, `--mint-cream`.
- **Interaction/highlights**: `--powder-blue`, `--pale-sky`, `--alice-blue`.
- **Status signaling**: `--light-cyan` (success/info), `--soft-blush`/`--petal-frost` (warning/error) — always pair with text/icon, never color alone.
- **Accessibility check**: verify contrast for text and interactive states before using pastel combinations.

## Implementation notes

- Define tokens in a shared location (app CSS variables or design-system tokens) before widespread use.
- When adding UI, load the required design skills per `.docs/AGENTS.md`.
