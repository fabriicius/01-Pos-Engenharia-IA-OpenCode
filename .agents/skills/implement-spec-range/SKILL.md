---
name: implement-spec-range
description: Implement an inclusive range of numbered specs in parallel, one isolated subagent per spec, by invoking orchestrate-me. Use when the user requests implementation of a numbered spec range.
---

# Implement Spec Range

Use the [orchestrate-me](../orchestrate-me/SKILL.md) skill to implement the inclusive spec range supplied in the invocation arguments (`$ARGUMENTS` when supported).

Pass the range unchanged to `orchestrate-me`, which owns range validation, isolated worktrees, subagent scheduling, plan approvals, implementation, integration, QA, and delivery. Follow its instructions rather than duplicating the orchestration workflow here.

If no range was supplied, ask for it with an example such as `001-010`. Do not infer a range from the available specs.

Example invocation: `/implement-spec-range 001-010`.
