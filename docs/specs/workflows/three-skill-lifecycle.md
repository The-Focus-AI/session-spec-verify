---
kind: spec
id: three-skill-lifecycle
title: Unified v2 Skill Lifecycle (Distill, Verify & View)
domain: workflows
layer: workflows
tier: 1
status: active
version: 3
uses:
  - standards/portable-agent-skills@1
---

## Intent

Unify specification work across two core lifecycle skills (`spec-distill` and `spec-verify`) and one read-only browser lens (`spec-view`), replacing overlapping extraction and refactoring workflows while aligning storage and verification around Mutation Tiers (`Tier 0 / 1 / 2`).

## Invariants

- **[ground-truth-extraction]** (*NEVER*): `spec-distill` **NEVER** invents runtime claims from prose; it pairs session traces with `git diff` (Brownfield mode) or runs directly from PR commentary and escalations (Trace-First mode), recording rationale in `docs/decisions.jsonl`.
- **[protected-external-standards]** (*NEVER*): Routine `spec-distill` runs **NEVER** edit `docs/standards/*.md` or `docs/oracles/*`; upstream updates surface `VERSION_SKEW` and local deviations require `person`-ratified `overrides:`.
- **[immutable-timestamped-runs]** (*NEVER*): `spec-verify` **NEVER** overwrites prior verification runs; every pass creates `<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/` with `summary.md` and `verdicts.jsonl`.

## Acceptance Criteria

- **[multi-harness-manifests]**: The repository exposes valid plugin and skill manifests for `skills` CLI (`spec-distill`, `spec-verify`, `spec-view`), Claude Code (`.claude-plugin/plugin.json`), and Antigravity (`plugin.json` + `assets/logo.svg`), synced via `pnpm run sync`.
- **[fault-localized-verdicts]**: `spec-verify` checks `assumption` (`Tier 2 · W`) probes before blaming Tier 0/1 rules, recording `diagnosis: "w_drift"` on external drift vs. `"s_bug"` on core defects.

## Oracles

- **[lifecycle-bundle-parity]**: Run `pnpm run check` and an isolated `mktemp -d` copy of `skills/` + `docs/` executing `check-specs.ts validate` and `check-specs.ts bundle`.
