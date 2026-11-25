---
kind: spec
id: pack-validator-and-cli
title: Unified Spec Pack Validator, Initializer & Tiered Bundle CLI
domain: foundation
layer: foundation
tier: 1
status: active
version: 2
uses:
  - standards/portable-agent-skills@1
---

## Intent

Provide a zero-dependency Node.js 24 TypeScript CLI (`check-specs.ts`) supporting `init`, `validate`, `effective`, and `bundle` subcommands over Mutation Tiers (`0 / 1 / 2`), 5 rule kinds, `docs/oracles/` fixtures, simplified 4-status `decisions.jsonl` records, and immutable `docs/runs/`.

## Invariants

- **[slug-uniqueness-and-version-skew]** (*NEVER*): Duplicate `[kebab-slug]` rule identifiers across packs **NEVER** pass validation (except where a spec declares a valid `overrides:` target for that slug), and mismatched `uses: standards/<id>@<ver>` version pins **NEVER** pass silently (`VERSION_SKEW`).
- **[person-ratified-overrides]** (*NEVER*): Local `overrides:` declarations **NEVER** validate unless their cited decision in `docs/decisions.jsonl` exists with `author.role === "person"` and resolved status in `["decided", "accepted_risk", "intended"]`, and `"verdict": "waived"` entries in `docs/runs/*/verdicts.jsonl` **NEVER** pass without `"waivedBy": "person"`.

## Anti-Specs

- **[unbounded-rule-tier]** (*NEVER*): Packs and standards **NEVER** accept out-of-range Mutation Tiers (standard packs must be `tier: 0`, spec packs `tier: 0 | 1 | 2`), blocking silent promotion of Tier 1/2 edits into Tier 0.

## Acceptance Criteria

- **[idempotent-workspace-init]**: Running `check-specs.ts init --root <dir> [--title "<Title>"]` creates `docs/standards/`, `docs/oracles/`, `docs/specs/`, `docs/runs/`, empty `docs/decisions.jsonl`, and starter `docs/INDEX.md` (with `## Glossary`) without overwriting existing files, and validates immediately.
- **[deterministic-markdown-bundle]**: Running `check-specs.ts bundle` validates all packs and streams a unified Markdown bundle containing `docs/INDEX.md`, Tier 0 standards, `docs/oracles/` fixtures, Tier 1/2 domain specs, and a `docs/decisions.jsonl` summary table.

## World Assumptions

- **[node24-strip-types-runtime]**: Execution environment runs Node.js 24+ with `--experimental-strip-types` and `erasableSyntaxOnly` (breakage symptom: syntax rejection if TypeScript parameter properties or non-erasable enums are introduced).

## Oracles

- **[validator-golden-pins]**: Replay `docs/oracles/check-specs-pins.json` scenarios in `test/session-spec-verify.test.ts` and assert exact failure codes (`OVERRIDE_AUTHORITY_INVALID`, `WAIVER_AUTHORITY_INVALID`, `VERSION_SKEW`, `SPEC_TIER_INVALID`).

## Implementation Notes

- Supported subcommands & flags: `init | validate | effective | bundle`, `--root <dir>`, `--title <string>`, `--json`, `--help` (legacy `--init`, `--effective`, `--bundle` flags also accepted).
