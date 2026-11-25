# Unified v2 Tiered Spec Pack & Rationale Schema Reference

Defines the directory layout, YAML frontmatter, 5 typed `[kebab-slug]` rule kinds, simplified 4-status `docs/decisions.jsonl`, and immutable `docs/runs/` format validated by `scripts/check-specs.ts`.

---

## Directory Layout

```text
docs/
├── INDEX.md                              # System map, shared TERM Glossary, links to every pack & ledger
├── decisions.jsonl                       # Append-only rationale log + rejected[] + pins[] + person authority
├── standards/                            # Tier 0 · Protected portable standards (person overrides only)
│   └── <standard-id>.md
├── oracles/                              # Tier 0 · Read-only Golden Pin JSON fixtures & holdout checks
│   └── <fixture>.json | <note>.md
├── specs/                                # Tier 1 (policies/goals) & Tier 2 (W adapters) grouped by domain
│   └── <domain>/<pack-id>.md
└── runs/                                 # Immutable timestamped verification passes
    └── <YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/
        ├── summary.md
        └── verdicts.jsonl
```

---

## 1. Tier 0 External Standards (`docs/standards/<id>.md`)

External standards are implicitly `tier: 0` (slowest clock, read-only during routine distillation).

```yaml
---
kind: standard
id: <kebab-slug>
title: <Human Title>
source: <canonical-url-or-uri>
version: <positive-integer>
tier: 0
status: in_force | draft
---
```

Required sections: `## Intent` (or `## Scope`), at least one rule bullet across the 5 rule sections, and `## Oracles` (or `## Verification`).

---

## 2. Tier 1 / Tier 2 Domain Spec Packs (`docs/specs/<domain>/<id>.md`)

Local specs live under domain directories (`domain: <kebab-slug>`, legacy `layer:` also accepted) and declare their Mutation Tier and CLS consolidation status:

```yaml
---
kind: spec
id: <kebab-slug>
title: <Human Title>
domain: <kebab-slug>
tier: 1 | 2 | 0
status: active | candidate
version: <positive-integer>
uses:
  - standards/<std-id>@<version>
overrides:
  - target: standards/<std-id>#<rule-slug>
    decision: D-<id>
    summary: <One-line reason for local deviation>
---
```

- `id` must match `<id>.md`, and `domain` (or `layer`) must match the parent directory under `docs/specs/`.
- `tier` defaults to `1` (`1` = business policies & goals; `2` = volatile world assumptions `W`; `0` = repo-local immutable laws).
- `status` defaults to `active` (`candidate` marks single-session CLS-staged Tier 1 updates awaiting cross-session hysteresis or `person` ratification).
- Every `uses:` reference validates against `docs/standards/<std-id>.md` at exact `version` (mismatch raises `VERSION_SKEW`).
- Every `overrides:` decision must cite `author.role === "person"` with resolved status in `["decided", "accepted_risk", "intended"]`.

---

## 3. Five Typed `[kebab-slug]` Rule Kinds

Every rule bullet uses `- **[kebab-slug]** [(MODALITY)]: Statement` with globally unique slugs (except explicit `overrides:`). Wait-free mechanical extraction maps section headings directly to `kind`:

| Section Heading | Parsed `kind` | Typical Tier | Purpose |
|---|---|---|---|
| `## Invariants` | `invariant` | Tier 0 | Hard safety/liveness conservation laws (`NEVER` / `EVENTUALLY`). |
| `## Anti-Specs` | `anti_spec` | Tier 0 | Explicit designs/shortcuts rebuilds **NEVER** regenerate. |
| `## Acceptance Criteria` | `criterion` | Tier 1 | Observable surface behaviors filtered by the Three-Gate Sieve. |
| `## World Assumptions` | `assumption` | Tier 2 | Indicative external `W` facts + observable breakage symptom. |
| `## Oracles` *(or `## Verification`)* | `oracle` | Tier 0/1 | Golden Pins, metamorphic checks, and executable verification probes. |

Optional prose sections: `## Open Callouts` (KAOS Obstacles & Tier 0 conflict forks), `## Implementation Notes` (terse non-obvious toolchain contracts).

---

## 4. Simplified Append-Only Decisions (`docs/decisions.jsonl`)

New v2 records collapse the 11 v1 `(type, outcome)` pairs down to **4 statuses** plus optional `rejected[]` and `pins[]`:

```json
{
  "id": "D-10",
  "date": "2026-11-25",
  "status": "decided",
  "author": { "role": "person" },
  "packs": ["foundation/pack-validator-and-cli"],
  "title": "Treat unratified Tier 1 policy updates as CLS candidates rather than active rules",
  "summary": "Stage single-session inferred Tier 1 rules with status: candidate until ratified or reinforced.",
  "resolution": "Eliminates single-session policy whiplash while keeping historical specs stable.",
  "rejected": ["Directly overwrite active Tier 1 specs after a single noisy support session"],
  "pins": [{ "input": "single session trace without person approval", "expected": "status: candidate" }],
  "comments": [{ "author": { "role": "person" }, "body": "Confirmed CLS staging gate." }]
}
```

- Valid v2 `status`: `"decided" | "accepted_risk" | "deferred" | "open"`.
- Historical v1 entries (`D-1..D-9`) using `(type, outcome)` remain valid verbatim in append-only logs.

---

## 5. Verification Runs (`docs/runs/<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/`)

Each `spec-verify` pass writes `summary.md` and `verdicts.jsonl` (`kind` across all 5 rule kinds, `verdict: pass | fail | inconclusive | waived`, optional `diagnosis: w_drift | s_bug | spec_ambiguity | null`). Waivers require `"waivedBy": "person"`.
