# Agent Guide

> Mandatory operating guide for coding agents working in this repository.  
> Docs in `.docs/` are the project context pack; verify against code/config when they disagree.

## Context loading

Read before making changes:

| Document           | Read when            | Purpose                                                    |
| ------------------ | -------------------- | ---------------------------------------------------------- |
| `ARCHITECTURE.md`  | Always               | Current stack, workspaces, commands, target architecture   |
| `DEVELOPMENT.md`   | Always               | Engineering standards, naming, quality expectations        |
| `QA.md`            | Before finishing     | Required checks and reporting                              |
| `BUSINESS.md`      | Product/feature work | Domain model: experts, connectors, tasks, artifacts        |
| `DESIGN.md`        | UI work              | Visual direction, palette, light-theme/accessibility rules |
| `DESIGN_SYSTEM.md` | UI work              | Component conventions and token usage                      |
| `RULES.md`         | Non-trivial work     | Workflow, planning, ADRs, delivery checklist               |

## Working rules

1. **Verify reality first.** Use code/config (`package.json`, `turbo.json`, workspace files) as source of truth; docs may contain target-state guidance.
2. **Use the right skill.** Load the most specific skill for the task. For UI changes, load `frontend-design` and `web-design-guidelines` before implementation/review.
3. **Keep docs coherent.** If you change commands, architecture, or conventions, update affected `.docs/*` in the same change.
4. **Do not invent.** Never claim scripts, tests, infra, or architecture exist without checking. Mark target items clearly.
5. **Be scoped and explicit.** Make the smallest coherent change, report checks run, skipped checks, and manual QA.

## Quick repo facts (current)

- Monorepo: npm workspaces + Turborepo; Node `>=22`.
- Apps: `apps/api` (NestJS, port 3000), `apps/app` (React + Vite, port 5173).
- Packages: `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`.
- Root checks: `npm run lint`, `npm run check-types` / `types:check`, `npm run test`, `npm run build`, `npm run code:fix`, `npm run format`.
- Local infra: `npm run infra:up`, `npm run db:migrate`, `npm run infra:down` (see `.docs/QA.md`).

## Delivery checklist

- [ ] Context docs read
- [ ] Change matches existing patterns or documents new pattern
- [ ] Relevant QA checks run/reported
- [ ] Docs updated if behavior/commands changed
- [ ] Risks, assumptions, and manual QA noted
