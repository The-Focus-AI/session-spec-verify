# Session Spec & Verify — Modular Specifications & Verification Index

Standalone, zero-dependency skill and plugin suite by **TheFocus.AI** (`spec-extract`, `verify-deploy`, `spec-refactor`) for conceptual spec packs, protected external standards with ratified overrides, append-only `decisions.jsonl`, and immutable timestamped verification runs.

---

## External Standards (`docs/standards/`)

Portable, repository-agnostic rules synced across projects. Local `spec-extract` and `spec-refactor` workflows never mutate these files directly without an explicit standards pull or promotion.

- [`portable-agent-skills`](./standards/portable-agent-skills.md) — Kebab-case skill identity and standalone bundled script self-containment across harnesses.

---

## Conceptual Spec Layers (`docs/specs/`)

### Foundation Layer
- [`foundation/pack-validator-and-cli`](./specs/foundation/pack-validator-and-cli.md) — Zero-dependency `check-specs.ts` schema validation, `--init` bootstrapping, `--effective` resolution, `VERSION_SKEW` / `person`-override checks, and `--bundle` compilation.

- [Local viewer hosting](./specs/foundation/local-viewer-host.md) — Serve docs over localhost and connect to Ollama.

### Workflows Layer
- [`workflows/three-skill-lifecycle`](./specs/workflows/three-skill-lifecycle.md) — Ground-truth extraction, protected external standards, immutable timestamped `docs/runs/` ledgers, and multi-harness manifests.

---

### Interfaces Layer

- [Specification explorer](./specs/interfaces/spec-explorer.md) — Browse modules, inspect recorded evidence, and compare behavior questions against the docs.

---

## Ledgers & Immutable Verification Runs

- [`decisions.jsonl`](./decisions.jsonl) — Append-only JSONL record of design choices and override authority (`D-1`..`D-3`).
- [`runs/`](./runs/) — Immutable timestamped verification outputs (`<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/`).

---

## Operational & Self-Verification Commands

```bash
# Sync shared check-specs.ts copies across all three skill folders
pnpm run sync

# Verify script sync parity, validate docs/, and execute the test suite
pnpm run check

# Initialize a new project's docs/ layout or inspect effective rules
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts --root /path/to/repo --init
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts --effective --json
pnpm run specs:bundle
```
