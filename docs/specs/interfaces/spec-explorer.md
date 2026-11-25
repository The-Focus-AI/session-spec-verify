---
kind: spec
id: spec-explorer
title: Specification explorer
domain: interfaces
layer: interfaces
tier: 1
status: active
version: 3
---

## Intent

Display specified domains, Mutation Tiers, all 5 typed rule kinds, recorded evidence, and an always-present right-hand Ollama chat panel preloaded with a deterministic `[S1]..[SN]` `docs/` prompt prefix.

## Invariants

- **[recorded-evidence-only]** (*NEVER*): Browsing, chatting, or importing docs never executes verification checks or promotes older-version, missing, or waived rules into recorded passes.

## Acceptance Criteria

- **[functional-area-drill-down]**: Groups local modules by domain/area alongside Tier badges and pass counts with persistent navigation and breadcrumbs.
- **[traceable-rule-evidence]**: Displays each rule's kind (`invariant`, `anti_spec`, `criterion`, `assumption`, `oracle`), evidence text, run file:line, optional `diagnosis`, related decisions (including `rejected[]`), pinned standards, and raw source.
- **[session-imports]**: Folder selection replaces the active docs collection; standalone spec drops route to Incoming; plain-text drops populate the persistent chat input.
- **[cited-behavior-comparison]**: Persistent right-side chat serializes loaded `docs/` files deterministically (`INDEX.md`, `standards/`, `oracles/`, `specs/`, `incoming/`, `decisions.jsonl`, `runs/`) into the leading `system` message for Ollama KV cache reuse and renders Markdown replies with clickable citations.

## Oracles

- **[viewer-kv-prefix-check]**: Assert in `test/session-spec-verify.test.ts` that two sequential chat requests send byte-identical leading `system` prompts over `serve.mjs` and preserve `aside#chat` Markdown + citation rendering.
