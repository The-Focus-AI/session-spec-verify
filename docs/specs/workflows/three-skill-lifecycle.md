---
kind: spec
id: three-skill-lifecycle
title: Three-Skill Spec Extraction, Refactoring & Verification Lifecycle
layer: workflows
version: 1
uses:
  - standards/portable-agent-skills@1
---

## Intent

Coordinate session extraction (`spec-extract`), structural pack refactoring (`spec-refactor`), and evidence-backed deployment verification (`verify-deploy`) across conceptual layers without leaking repository-specific assumptions.

## Invariants

- **[ground-truth-extraction]** (*NEVER*): `spec-extract` **NEVER** invents runtime claims from prose; code/diffs remain ground truth for *what* happens while transcripts remain ground truth for *why*, recording session decisions in `docs/decisions.jsonl` without duplicating a second prose decisions file.
- **[protected-external-standards]** (*NEVER*): Routine `spec-extract` runs and local layer splits/merges in `spec-refactor` **NEVER** edit `docs/standards/*.md`; upstream changes enter via explicit standards updates (`VERSION_SKEW` reconciliation) and local deviations require ratified `overrides:`.
- **[immutable-timestamped-runs]** (*NEVER*): `verify-deploy` **NEVER** overwrites prior verification runs; every pass creates a fresh `docs/runs/<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/` directory containing `summary.md` and `verdicts.jsonl`.

## Acceptance Criteria

- **[multi-harness-manifests]**: The repository exposes valid plugin and skill manifests for `skills` CLI (`skills/*`), Claude Code (`.claude-plugin/plugin.json`), and Antigravity (`plugin.json` + `assets/logo.svg`), keeping all skill instructions generic and free of single-repository hardcoding.

## Verification

1. **Cross-Harness Manifest & Content Audit**: Verify `plugin.json`, `.claude-plugin/plugin.json`, `assets/logo.svg`, and all three `skills/*/SKILL.md` manifests in `test/session-spec-verify.test.ts` with zero hardcoded single-repo references.
2. **Self-Hosted Spec & Run Validation**: Run `pnpm run check` to verify `session-spec-verify`'s own `docs/` packs, `decisions.jsonl`, and `docs/runs/` directories validate cleanly.
