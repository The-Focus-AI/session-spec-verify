# Session Spec & Verify v2 — Tiered Specifications & Verification Index

Unified, zero-dependency specification skill suite by **TheFocus.AI** (`spec-distill`, `spec-verify`, `spec-view`) built around **Mutation Tiers (`Tier 0 / 1 / 2`)**, **5 typed rule kinds**, simplified rationale logging in `decisions.jsonl`, and immutable verification runs under `docs/runs/`.

---

## Glossary (`TERM` — Shared Surface Vocabulary)

| Term | Surface Meaning & Boundary Units | Owning Domain |
| :--- | :--- | :--- |
| `Tier 0` | Slow-clock foundation: read-only standards, `## Invariants`, `## Anti-Specs`, and `docs/oracles/` (`person` mutation only). | [`foundation/pack-validator-and-cli`](./specs/foundation/pack-validator-and-cli.md) |
| `Tier 1` | Medium-clock domain policies and `## Acceptance Criteria`, CLS-staged as `status: candidate` when inferred from a single session. | [`workflows/three-skill-lifecycle`](./specs/workflows/three-skill-lifecycle.md) |
| `Tier 2` | Fast-clock indicative external world assumptions (`W` in `## World Assumptions`) isolated so external shifts diagnose as `w_drift`. | [`workflows/three-skill-lifecycle`](./specs/workflows/three-skill-lifecycle.md) |
| `Golden Pin` | Concrete distinguishing input→output check stored in `## Oracles` or `docs/oracles/*.json`. | [`foundation/pack-validator-and-cli`](./specs/foundation/pack-validator-and-cli.md) |
| `KV Prefix` | Deterministic `[S1]..[SN]` ordering of all `docs/` files in the viewer chat `system` prompt. | [`interfaces/spec-explorer`](./specs/interfaces/spec-explorer.md) |

---

## Tier 0 · Protected External Standards (`docs/standards/`) & Oracles (`docs/oracles/`)

- [`portable-agent-skills`](./standards/portable-agent-skills.md) — Kebab-case skill identity and standalone zero-dependency scripts across harnesses.
- [`check-specs-pins.json`](./oracles/check-specs-pins.json) — Golden Pin fixture asserting `OVERRIDE_AUTHORITY_INVALID`, `WAIVER_AUTHORITY_INVALID`, `VERSION_SKEW`, and `SPEC_TIER_INVALID`.

---

## Tier 1 & Tier 2 · Domain Spec Packs (`docs/specs/`)

### Foundation Domain
- [`foundation/pack-validator-and-cli`](./specs/foundation/pack-validator-and-cli.md) — Unified 4-subcommand `check-specs.ts` validator, Tier `0/1/2` checks, 5 rule kinds, `VERSION_SKEW`, and `--bundle` output.
- [`foundation/local-viewer-host`](./specs/foundation/local-viewer-host.md) — Read-only loopback HTTP server (`serve.mjs`) and same-origin Ollama relay.

### Workflows Domain
- [`workflows/three-skill-lifecycle`](./specs/workflows/three-skill-lifecycle.md) — Three-skill lifecycle (`spec-distill`, `spec-verify`, `spec-view`), Brownfield + Trace-First inputs, OGIS distinguishing-input grilling, CLS staging, and `w_drift` vs. `s_bug` runs.

### Interfaces Domain
- [`interfaces/spec-explorer`](./specs/interfaces/spec-explorer.md) — Swiss-index specification explorer (`index.html`) showing Tier badges, 5 rule kinds, and persistent KV-cached Ollama chat.

---

## Ledgers & Immutable Verification Runs

- [`decisions.jsonl`](./decisions.jsonl) — Append-only design rationale, rejected options, distinguishing pins, and `person` override authority (`D-1`..`D-10`).
- [`runs/`](./runs/) — Immutable timestamped verification outputs (`<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/`).

---

## Operational & Self-Verification Commands

```bash
# Sync shared check-specs.ts and spec-view assets across skill folders
pnpm run sync

# Verify script sync parity, validate docs/, and run test/session-spec-verify.test.ts
pnpm run check

# Launch the local specification viewer and Ollama chat proxy
node skills/spec-view/scripts/serve.mjs ./docs

# Initialize, validate, resolve effective rules, or compile cold-rebuild bundle
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts init --root /path/to/repo
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts validate --root /path/to/repo
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts effective --root /path/to/repo --json
pnpm run specs:bundle
```
