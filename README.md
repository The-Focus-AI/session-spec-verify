# session-spec-verify (v2)

Unified, zero-dependency specification distillation, evidence-backed oracle & cold-rebuild verification, and read-only local specification explorer with KV-cached Ollama chat by **TheFocus.AI**.

Works across **Claude Code**, **Antigravity**, **Codex**, and the **`skills` CLI** (`Node.js >= 24`, zero npm runtime dependencies).

---

## Architecture (2 Core Lifecycle Skills + 1 Read-Only Lens)

Three unified skills manage a single cold-rebuild-complete `docs/` directory partitioned by **Mutation Tiers (`Tier 0 / 1 / 2`)**:

| Skill | Role | Primary Artifacts |
| :--- | :--- | :--- |
| [`spec-distill`](./skills/spec-distill/SKILL.md) | **Capture, Structure & Govern**: distills traces (and optional `git diff`) into tiered specs, splits/merges packs, reconciles `VERSION_SKEW`, manages `person` overrides, runs OGIS distinguishing-input grilling, and stages Tier 1 changes via CLS candidates. | `docs/INDEX.md` (with Glossary), `docs/specs/<domain>/*.md`, `docs/decisions.jsonl`, `docs/standards/*.md` |
| [`spec-verify`](./skills/spec-verify/SKILL.md) | **Verify Live & Rehearse Rebuilds**: executes passive Mode 1 audits and isolated Mode 2 `mktemp -d` drills across all 5 rule kinds (`invariant`, `anti_spec`, `criterion`, `assumption`, `oracle`), localizes `w_drift` vs. `s_bug`, and runs the Cold-Rebuild Sufficiency Audit (`bundle`). | `docs/oracles/*.json`, `docs/runs/<timestamp>_<sha>/{summary.md,verdicts.jsonl}` |
| [`spec-view`](./skills/spec-view/SKILL.md) | **Optional Read-Only Lens**: serves the local Swiss-index specification explorer (`serve.mjs` + `index.html`) with persistent KV-cached Ollama chat across all `docs/` files. | Local HTTP viewer on `http://127.0.0.1:8080` |

### Repository `docs/` Layout (Tiered Markdown + JSONL Spine)

```text
docs/
├── INDEX.md                              # System map, shared TERM Glossary, links to all packs & ledgers
├── decisions.jsonl                       # Append-only 4-status rationale log + rejected[] + pins[]
├── standards/                            # Tier 0 · Protected portable standards (person overrides only)
│   └── <standard-id>.md
├── oracles/                              # Tier 0 · Frozen Golden Pin JSON fixtures & metamorphic checks
│   └── <fixture>.json
├── specs/                                # Tier 1 (policies/goals) & Tier 2 (W adapters) by domain
│   └── <domain>/<pack-id>.md
└── runs/                                 # Immutable timestamped verification outputs
    └── <YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/
        ├── summary.md
        └── verdicts.jsonl
```

---

## Precise Installation Recipes

### 1. Install Skills via `skills` CLI

```bash
# Install all three unified v2 skills from branch v2
pnpm dlx skills add The-Focus-AI/session-spec-verify@v2 --skill spec-distill spec-verify spec-view -y

# Or install a single self-contained skill (includes bundled scripts)
pnpm dlx skills add The-Focus-AI/session-spec-verify@v2 --skill spec-view -y
```

### 2. Claude Code Plugin

```bash
claude plugin marketplace add The-Focus-AI/session-spec-verify
claude plugin install session-spec-verify
```

### 3. Antigravity / Local Vendor Copy

```bash
git clone -b v2 https://github.com/The-Focus-AI/session-spec-verify.git ~/.gemini/config/plugins/session-spec-verify
```

---

## Docs Explorer & Cached Ollama Chat (`spec-view`)

```bash
DOCS_PORT=8081 node skills/spec-view/scripts/serve.mjs ./docs
open http://127.0.0.1:8081
```

The right-hand **Ask about anything** chat panel stays open across all views and connects to `OLLAMA_URL` (default `http://127.0.0.1:11434`). Every loaded file in `docs/` (`INDEX.md`, `standards/`, `oracles/`, `specs/`, `decisions.jsonl`, and `runs/`) is serialized deterministically (`[S1]..[SN]`) in the leading `system` prompt so Ollama KV-caches the prefix across follow-up turns.

---

## Precise CLI & Cold-Rebuild Recipes (`check-specs.ts`)

Every skill bundles an identical zero-dependency copy of `scripts/check-specs.ts` (`Node.js >= 24` with `--experimental-strip-types`).

```bash
# 1. Initialize Tier 0/1/2 docs/ skeleton + Glossary in any repo
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts \
  init --root /path/to/repo --title "My Project"

# 2. Validate Tier bounds, 5 rule kinds, person overrides, VERSION_SKEW, decisions, and runs
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts validate --root /path/to/repo

# 3. Resolve active rules (with Tier 0/1/2 + 5 kinds)
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts effective --root /path/to/repo --json

# 4. Compile single-file cold-rebuild bundle
node --experimental-strip-types skills/spec-distill/scripts/check-specs.ts bundle --root /path/to/repo > SPEC_BUNDLE.md
```

### Cold-Rebuild Portability Smoke Test (Only `skills/` + `docs/`)

```bash
SANDBOX="$(mktemp -d)" && \
  mkdir -p "$SANDBOX/.agents/skills" && \
  cp -R skills/* "$SANDBOX/.agents/skills/" && \
  cp -R docs "$SANDBOX/" && \
  node --experimental-strip-types "$SANDBOX/.agents/skills/spec-verify/scripts/check-specs.ts" validate --root "$SANDBOX" && \
  node --experimental-strip-types "$SANDBOX/.agents/skills/spec-verify/scripts/check-specs.ts" effective --root "$SANDBOX" --json > /dev/null && \
  node --experimental-strip-types "$SANDBOX/.agents/skills/spec-verify/scripts/check-specs.ts" bundle --root "$SANDBOX" > /dev/null && \
  rm -rf "$SANDBOX"
```

---

## Development & Verification

```bash
pnpm run sync       # Sync check-specs.ts, viewer assets (serve.mjs, index.html), and #snapshot
pnpm run sync:check # Verify all bundled scripts and embedded snapshot are byte-identical
pnpm run specs:check
pnpm run specs:bundle > /dev/null
pnpm run check      # Runs sync:check && specs:check && test
```

## License

MIT © 2026 [TheFocus.AI](https://thefocus.ai)
