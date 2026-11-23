# Business

> Product context for humans and coding agents. This document describes product intent; validate implemented behavior in code.

## Vision

A platform for managing **custom AI agents ("experts")** that act as senior specialists for specific business roles.

## Core concept

Each expert is configured with a role perspective and works over connected company data.

Initial expert profiles:

| Expert     | Focus                                                       |
| ---------- | ----------------------------------------------------------- |
| CEO Expert | Business strategy, performance, and executive analysis      |
| CMO Expert | Marketing strategy, growth, and campaign analysis           |
| CTO Expert | Technology strategy, architecture, and engineering analysis |

## Data sources

Experts should ground their work in data pulled from external connectors. Planned connector examples:

- Notion
- Google Drive
- Google Docs
- Google Sheets
- PDF
- Markdown
- Confluence
- Jira
- Linear
- ClickUp

## Intended flow

1. User connects external data sources.
2. Connectors ingest and normalize data.
3. User assigns a task to an expert.
4. Expert analyzes available context and produces an artifact (analysis, report, recommendation, decision support, etc.).

## Product boundaries for implementation

- Treat connector integrations as explicit boundaries; do not assume a connector exists.
- Keep expert outputs traceable to source data when implementing analysis features.
- Separate domain concepts: **source/connector**, **normalized knowledge**, **expert**, **task/request**, **artifact/output**.
