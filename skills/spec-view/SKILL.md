---
name: spec-view
description: "Serve the read-only local Swiss-index specification explorer (serve.mjs + index.html) and KV-cached Ollama chat across docs/standards/, docs/oracles/, docs/specs/, docs/decisions.jsonl, and docs/runs/. Thin inspection lens holding zero write logic."
---

# View & Query Tiered Specifications Locally

Starts a zero-dependency loopback HTTP server (`scripts/serve.mjs` + `scripts/index.html` bundled alongside this `SKILL.md`) to browse a project's `docs/` collection by domain, Mutation Tier, rule kind, and recorded verification evidence, with persistent KV-cached Ollama chat.

---

## Core Guarantees

1. **Read-Only Inspection Lens**: Never edits `docs/`, never executes verification checks, and never upgrades older-version or unverified rules into passes.
2. **Tier & Rule-Kind Visibility**: Displays `Tier 0 / 1 / 2` badges, CLS status (`active` / `candidate`), all 5 rule kinds (`invariant`, `anti_spec`, `criterion`, `assumption`, `oracle`), `docs/oracles/` fixtures, and `docs/decisions.jsonl` (`rejected[]`, `pins[]`).
3. **Deterministic Ollama KV-Cached Prefix**: Serializes all loaded `docs/` files in deterministic order `[S1]..[SN]` in the leading `system` prompt so multi-turn Q&A reuses Ollama's prompt cache.
4. **Loopback Boundary**: Binds strictly to `127.0.0.1` and rejects non-local `Host` / `Origin` headers and `Sec-Fetch-Site: cross-site` requests.

---

## Workflow Commands

### 1. Validate `docs/` Before Opening

```bash
node --experimental-strip-types <this-skill-dir>/scripts/check-specs.ts validate --root "$PWD"
```

### 2. Start the Local Viewer

```bash
# Default port 8080, reading ./docs
node <this-skill-dir>/scripts/serve.mjs "$PWD/docs"

# Custom port or custom Ollama endpoint
DOCS_PORT=8081 OLLAMA_URL=http://127.0.0.1:11434 node <this-skill-dir>/scripts/serve.mjs "$PWD/docs"
```

Open `http://127.0.0.1:8080` (or the chosen `DOCS_PORT`) in your browser.
