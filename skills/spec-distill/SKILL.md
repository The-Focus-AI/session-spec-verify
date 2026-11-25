---
name: spec-distill
description: "Capture, structure, and govern tiered specifications (docs/specs/), protected Tier 0 standards (docs/standards/), Golden Pin fixtures (docs/oracles/), and rationale decisions (docs/decisions.jsonl) from conversation traces and optional code diffs. Unifies spec extraction, pack refactoring, upstream VERSION_SKEW reconciliation, person-ratified overrides, OGIS distinguishing-input grilling, and CLS candidate staging."
---

# Distill, Structure & Govern Tiered Specifications

Turns engineering sessions, PR commentary, and optional `git diff` changes into minimal, cold-rebuild-complete `docs/` specifications organized around **three Mutation Tiers (`Tier 0 / 1 / 2`)** and validated by `scripts/check-specs.ts`.

Read [references/pack-format.md](references/pack-format.md) before modifying pack structure, frontmatter, or `docs/decisions.jsonl`.

---

## Ground-Truth Modes & Core Boundaries

Select the ground-truth mode that fits the workspace:

- **Brownfield Mode (`--from-diff`, default when source code is retained)**: `git diff` = ground truth for *what* currently runs; session transcript & PR commentary = ground truth for *why* it looks that way.
- **Trace-First Mode (`--from-trace`, disposable-code / spike mode)**: distills directly from PR commentary, alignment spikes, and runtime 5% escalations with **no requirement to retain source code**. Never invent behavioral claims beyond what traces or verified fixtures establish.

Enforce these three Mutation Tier boundaries on every run:

1. **Tier 0 (`docs/standards/`, `docs/oracles/`, `## Invariants`, `## Anti-Specs`) — Slow Clock, Human-Ratified Only**:
   - Routine distillation never mutates `docs/standards/*.md` or frozen fixtures in `docs/oracles/`.
   - Overrides require `overrides:` (`target: standards/<id>#<slug>`, `decision: D-...`, `summary: ...`) citing a `"role": "person"` decision with `status` `"decided"` or `"accepted_risk"`.
   - If a session tries to weaken a Tier 0 invariant without human sign-off, **block the edit** and open an `status: "open"` conflict fork in `docs/decisions.jsonl` + `## Open Callouts`.
2. **Tier 1 (`tier: 1` domain packs, `## Acceptance Criteria`, `## Glossary` `TERM`) — Medium Clock, CLS-Staged**:
   - Single-session inferred policy edits stage as `status: candidate` in pack frontmatter until a `person` ratifies `active` or cross-session signal recurs.
3. **Tier 2 (`tier: 2` adapter packs, `## World Assumptions`) — Fast Clock**:
   - Volatile external formats, vendor table layouts, and partner DTO quirks live explicitly in `## World Assumptions` (`assumption` kind) with concrete breakage symptoms so external format shifts repair cleanly without mutating Tier 0/1 rules.

---

## Step 1: Bootstrap & Inspect Effective Contract

Run this skill's bundled validator (`scripts/check-specs.ts` alongside this `SKILL.md`) against `"$PWD"`:

1. Initialize missing `docs/` scaffolding non-destructively if `docs/INDEX.md` or `docs/decisions.jsonl` is absent:
   ```bash
   node --experimental-strip-types <this-skill-dir>/scripts/check-specs.ts init --root "$PWD"
   ```
2. Read inputs:
   - In **Brownfield Mode**: inspect `git status` and `git diff` (or project files if uninitialized).
   - In **Trace-First Mode**: read PR commentary, alignment session transcripts, and runtime escalation logs.
   - Read `docs/INDEX.md` (including `## Glossary`), impacted packs under `docs/specs/`, recent lines of `docs/decisions.jsonl`, and active rules:
     ```bash
     node --experimental-strip-types <this-skill-dir>/scripts/check-specs.ts effective --root "$PWD" --json
     ```

---

## Step 2: Distill Decisions (`docs/decisions.jsonl`)

Append concise single-line JSON records (`D-1..D-N`) using the simplified **4-status** schema:

- `decided` — settled choice, intentional quirk, or answered question.
- `accepted_risk` — known limitation shipped deliberately (earns zero acceptance criteria).
- `deferred` — explicitly pushed to follow-up scope (earns zero acceptance criteria).
- `open` — unresolved question or Tier 0 conflict fork (surfaces in `## Open Callouts`).

Attach optional high-signal fields whenever present:
- `"rejected": ["Option B: ... (reason rejected)"]` — promotes critical taboos to Tier 0 `## Anti-Specs`.
- `"pins": [{"input": "...", "expected": "..."}]` — captures concrete distinguishing examples settled during user review.

---

## Step 3: Update Tiered Domain Packs & Shared Structure

Per impacted pack under `docs/specs/<domain>/<pack>.md` (keep facts stated once; no numeric prefixes):

1. **`## Intent`**: 1–3 surface-vocabulary sentences echoing user intent (no private helper/module names).
2. **Typed `[kebab-slug]` Rules (5 Kinds)**:
   - `## Invariants` (`invariant`, Tier 0): `(*NEVER*)` / `(*EVENTUALLY*)` conservation or safety laws.
   - `## Anti-Specs` (`anti_spec`, Tier 0): explicit rejected approaches that cold rebuilds **NEVER** re-implement.
   - `## Acceptance Criteria` (`criterion`, Tier 1): **2–5** surface-vocabulary behaviors passing the **Three-Gate Sieve**: (a) code in this pack can break it, (b) a reviewer would flag its absence as a gap, and (c) no inherited `docs/standards/*.md` rule already covers it.
   - `## World Assumptions` (`assumption`, Tier 2): external `W` facts and observable breakage symptoms.
   - `## Oracles` (`oracle`, Tier 0/1): Golden Pins, metamorphic invariants, and executable read-only verification checks.
3. **`## Open Callouts`**: KAOS Obstacles or unresolved Tier 0 conflict forks (`status: "open"` decisions). Never guess past them.
4. **`docs/INDEX.md` Glossary**: Keep shared surface nouns and units updated once in the top-level `## Glossary` table.

### Structural & Standards Governance Operations

Run these directly inside `spec-distill` without switching skills:
- **Split / Merge / Re-domain Packs**: Run `check-specs.ts effective --json` before and after moving `[kebab-slug]` rules across `docs/specs/<domain>/`, updating `docs/INDEX.md` links and `decisions.jsonl` `packs` refs, and confirming 100% rule conservation.
- **Sync Upstream Standards (`VERSION_SKEW`)**: Drop updated `docs/standards/<id>.md`, run `check-specs.ts validate` to expose all pinned consumers with `VERSION_SKEW`, summarize changed clauses, confirm adopt-vs-override with the user, bump `uses: [standards/<id>@<ver>]`, and trigger `spec-verify`.
- **Promote Local Rules to Standards**: Extract portable rules from `docs/specs/<domain>/<pack>.md` into `docs/standards/<id>.md` (`tier: 0`, `status: draft` until human ratifies `in_force`), add `uses:`, remove duplicates, and validate.

---

## Step 4: OGIS Distinguishing-Input Grilling (Interactive Review)

Before persisting edits interactively (skip only when the user pre-authorized immediate writes), replace generic *"Anything to add or tighten?"* prompts with **1–3 concrete distinguishing-input questions**:

1. Identify places where two faithful clean-room implementations `P1` and `P2` could both satisfy the draft prose yet disagree on an edge input `x*` (e.g., `> 50` vs `>= 50`, fee-base inclusion, rounding ties, missing external column).
2. Show impacted pack(s), proposed tier/status, and ask **1–3 sharp binary input→output questions**:
   > *"If an order has exactly 50 cases plus a $2 container deposit, should the discount be $0 or 10% of beverage net?"*
3. Turn each answered example directly into a Golden Pin under `## Oracles` (or `docs/oracles/*.json`) and record `pins[]` on the settled `D-...` decision.

---

## Step 5: Persist & Validate

1. Update impacted `docs/specs/<domain>/<pack>.md` (increment integer `version`), `docs/INDEX.md` links/Glossary, and append to `docs/decisions.jsonl`.
2. Validate schema, Tier boundaries, `person` override authority, `VERSION_SKEW`, and slug uniqueness:
   ```bash
   node --experimental-strip-types <this-skill-dir>/scripts/check-specs.ts validate --root "$PWD"
   ```
3. Inform the user that any modified rule text requires a fresh `spec-verify` pass (prior waivers expire on rule edits).
