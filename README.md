# session-spec-verify

Modular conceptual specification extraction, evidence-backed deployment verification, and protected external-standard refactoring skills by **TheFocus.AI**.

Works across **Claude Code**, **Antigravity**, **Codex**, and the **`skills` CLI** (`Node.js >= 24`, zero npm runtime dependencies).

---

## Architecture

Three complementary skills manage a minimal, cold-rebuild-complete `docs/` directory:

| Skill | Role | Primary Artifacts |
| :--- | :--- | :--- |
| [`spec-extract`](./skills/spec-extract/SKILL.md) | Distills **what** happens from code/diffs and **why** from session transcripts into modular packs and append-only decisions. | `docs/specs/<layer>/*.md`, `docs/decisions.jsonl` |
| [`verify-deploy`](./skills/verify-deploy/SKILL.md) | Verifies resolved effective rules (external standards + local specs) using passive live audits and `mktemp -d` drills. | `docs/runs/<timestamp>_<sha>/{summary.md,verdicts.jsonl}` |
| [`spec-refactor`](./skills/spec-refactor/SKILL.md) | Splits/merges conceptual layers, pulls upstream external standards, manages `person`-ratified overrides, and audits cold-rebuild sufficiency. | `docs/INDEX.md`, `docs/standards/*.md`, `docs/specs/<layer>/*.md` |

### Repository `docs/` Layout

```text
docs/
├── INDEX.md                              # System map, environment defaults, links to all packs
├── decisions.jsonl                       # Append-only decision log + override authority
├── standards/                            # Protected external standards (e.g. from standards.thefocus.ai)
│   └── <standard-id>.md                  # kind: standard, version, status (in_force | draft)
├── specs/                                # Local conceptual-layer spec packs (no numeric prefixes)
│   ├── foundation/<pack-id>.md
│   ├── orchestration/<pack-id>.md
│   └── interfaces/<pack-id>.md
└── runs/                                 # Immutable timestamped verification outputs
    └── <YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/
        ├── summary.md
        └── verdicts.jsonl
```

---

## Precise Installation Recipes

### 1. Install Skills via `skills` CLI

```bash
# Install all three skills into the current project
pnpm dlx skills add The-Focus-AI/session-spec-verify --skill spec-extract verify-deploy spec-refactor -y

# Or install a single self-contained skill (includes bundled check-specs.ts)
pnpm dlx skills add The-Focus-AI/session-spec-verify --skill spec-extract -y
```

For a project-scoped Codex install, run from your project root:

```sh
npx skills add The-Focus-AI/session-spec-verify --agent codex --skill spec-extract verify-deploy spec-refactor --yes
```

### 2. Claude Code Plugin

```bash
# Register and install from GitHub via Claude Code plugin CLI
claude plugin marketplace add The-Focus-AI/session-spec-verify
claude plugin install session-spec-verify
```

### 3. Antigravity / Local `.agents/skills/` Copy

```bash
# Clone into your local Antigravity plugins folder or copy skills/ into .agents/skills/
git clone https://github.com/The-Focus-AI/session-spec-verify.git ~/.gemini/config/plugins/session-spec-verify

# Or vendor directly into any repo for self-contained cold rebuilds
mkdir -p .agents/skills
cp -R /path/to/session-spec-verify/skills/* .agents/skills/
```

---

## Docs explorer

Run `node serve.mjs` and open [http://127.0.0.1:8080](http://127.0.0.1:8080) to browse the repository's specs, decisions, and recorded verification evidence. To browse another project, pass its docs directory as the first argument.

The behavior comparison uses Ollama when available. Start Ollama on the same machine or set `OLLAMA_URL` to its HTTP origin before starting the viewer. Use **Find models** in the behavior view. See the [hosting spec](docs/specs/foundation/local-viewer-host.md) for details.

## Precise CLI & Cold-Rebuild Recipes

Every skill bundles an identical zero-dependency copy of `scripts/check-specs.ts` (`Node.js >= 24` with `--experimental-strip-types`).

### 1. Initialize `docs/` in Any Repository

```bash
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts \
  --root /path/to/repo \
  --init \
  --title "My Project"
```

### 2. Validate Packs, Overrides, Decisions & Runs

```bash
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts --root /path/to/repo
```

### 3. Resolve Active Rules (Inherited Standards Minus Ratified Overrides)

```bash
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts --root /path/to/repo --effective --json
```

### 4. Compile a Single-File Markdown Spec Bundle

```bash
node --experimental-strip-types skills/spec-refactor/scripts/check-specs.ts --root /path/to/repo --bundle > SPEC_BUNDLE.md
```

### 5. Cold-Rebuild Portability Smoke Test (Only `skills/` + `docs/`)

```bash
SANDBOX="$(mktemp -d)" && \
  mkdir -p "$SANDBOX/.agents/skills" && \
  cp -R skills/* "$SANDBOX/.agents/skills/" && \
  cp -R docs "$SANDBOX/" && \
  node --experimental-strip-types "$SANDBOX/.agents/skills/spec-refactor/scripts/check-specs.ts" --root "$SANDBOX" --effective && \
  node --experimental-strip-types "$SANDBOX/.agents/skills/spec-refactor/scripts/check-specs.ts" --root "$SANDBOX" --bundle > /dev/null && \
  rm -rf "$SANDBOX"
```

---

## How External Standards, Overrides & Runs Fit Together

1. **Protected External Standards (`docs/standards/*.md`)**: Adopt shared rules (for example from `standards.thefocus.ai`) by placing a standard file in `docs/standards/` and referencing `uses: [standards/<id>@<version>]` in local spec frontmatter. Routine `spec-extract` and `spec-refactor` passes never edit `docs/standards/`.
2. **Version Skew Detection**: Updating an upstream standard (`version: 1` -> `version: 2`) immediately causes `check-specs.ts` to report `VERSION_SKEW` for every local pack pinned to `@1`, ensuring downstream projects explicitly reconcile breaking standard changes before updating `uses:`.
3. **Human-Ratified Overrides**: If a project intentionally diverges from a rule in an adopted standard (`standards/<id>#<slug>`), the owning spec declares an `overrides:` block citing a `D-...` record in `docs/decisions.jsonl` whose `author.role` is `"person"` (never `"coding_agent"` or `"review_agent"`).
4. **Immutable Verification Runs (`docs/runs/`)**: Each `/verify-deploy` pass writes a new `<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/` directory with `summary.md` and `verdicts.jsonl`. Waivers (`"verdict": "waived"`) require `"waivedBy": "person"` and automatically expire when the waived rule statement changes.

---

## Development & Verification (`session-spec-verify` Repo)

```bash
pnpm run sync       # Propagate canonical skills/spec-refactor/scripts/check-specs.ts to all skills
pnpm run sync:check # Verify all bundled check-specs.ts copies are byte-identical
pnpm run specs:check
pnpm run specs:bundle > /dev/null
pnpm run check      # Runs sync:check && specs:check && test
```

## License

MIT © 2026 [TheFocus.AI](https://thefocus.ai)
