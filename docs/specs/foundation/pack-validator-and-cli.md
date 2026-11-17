---
kind: spec
id: pack-validator-and-cli
title: Zero-Dependency Spec Pack Validator, Initializer & Markdown Bundler
layer: foundation
version: 1
uses:
  - standards/portable-agent-skills@1
---

## Intent

Provide a zero-dependency Node.js 24 TypeScript CLI (`check-specs.ts`) that initializes clean `docs/` skeletons, enforces pack schemas and override authority, resolves inherited rulesets, and compiles modular packs into one portable Markdown bundle.

## Invariants

- **[slug-uniqueness-and-version-skew]** (*NEVER*): Duplicate `[kebab-slug]` rule identifiers across packs **NEVER** pass validation (except where a spec declares a valid `overrides:` target for that slug), and mismatched `uses: standards/<id>@<ver>` version pins **NEVER** pass silently (`VERSION_SKEW`).
- **[person-ratified-overrides]** (*NEVER*): Local `overrides:` declarations **NEVER** validate unless their cited decision in `docs/decisions.jsonl` exists with `author.role === "person"` and outcome in `["decided", "intended", "accepted_risk"]`, and `"verdict": "waived"` entries in `docs/runs/*/verdicts.jsonl` **NEVER** pass without `"waivedBy": "person"`.

## Acceptance Criteria

- **[idempotent-workspace-init]**: Running `check-specs.ts --root <dir> --init [--title "<Title>"]` creates `docs/standards/`, `docs/specs/`, `docs/runs/`, empty `docs/decisions.jsonl`, and starter `docs/INDEX.md` without overwriting existing files, and the initialized workspace passes `check-specs.ts` immediately.
- **[deterministic-markdown-bundle]**: Running `check-specs.ts --bundle` validates all packs and streams a combined Markdown document containing `docs/INDEX.md`, every external standard, every local conceptual pack, and a summary table rendered from `docs/decisions.jsonl`.

## Implementation Notes

- **Zero-dependency Node 24 TypeScript**: Uses strictly `node:fs` and `node:path` under `node --experimental-strip-types` with erasable TypeScript syntax (`erasableSyntaxOnly`), avoiding build steps or third-party YAML parsers.
- **Supported CLI flags**: `--root <dir>`, `--init`, `--title <string>`, `--effective`, `--bundle`, `--json`, and `--help`.

## Verification

1. **Automated Validator Suite**: Run `pnpm run test` (`test/session-spec-verify.test.ts`) to exercise `--init` idempotency, `--effective --json`, `--bundle`, `VERSION_SKEW`, `OVERRIDE_AUTHORITY_INVALID`, and `WAIVER_AUTHORITY_INVALID` in isolated `mktemp -d` directories.
