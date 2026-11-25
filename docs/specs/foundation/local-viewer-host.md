---
kind: spec
id: local-viewer-host
title: Local viewer hosting
domain: foundation
layer: foundation
tier: 1
status: active
version: 3
uses:
  - standards/portable-agent-skills@1
---

## Intent

Serve the self-contained viewer and project docs over one local HTTP origin — from the repository root or the standalone `spec-view` skill — so the browser can browse files and reach a local Ollama instance from the same page.

## Invariants

- **[read-only-docs-host]** (*NEVER*): The host never writes to the docs folder. It reads Markdown, JSONL, and `docs/oracles/*.json` files beneath the configured root and skips hidden entries.
- **[local-origin-boundary]** (*NEVER*): The server accepts requests only on IPv4 loopback and rejects unexpected Host or Origin headers and cross-site browser requests.

## Acceptance Criteria

- **[single-command-docs-serving]**: Starting `serve.mjs` (from root or `skills/spec-view/scripts/serve.mjs`) serves `index.html` and `/api/docs` over the same HTTP origin, falling back to the embedded repository snapshot when docs cannot be loaded.
- **[same-origin-ollama]**: Model discovery lists models reported by the configured Ollama instance and relays multi-turn chat through `/api/ollama/chat`.
- **[model-connection-diagnostics]**: Model discovery distinguishes a missing viewer route, unreachable Ollama endpoint, upstream 404, and non-Ollama payloads.

## World Assumptions

- **[ollama-loopback-api]**: Local Ollama serves `GET /api/tags` and `POST /api/chat` JSON schemas on `OLLAMA_URL` (breakage symptom: 502 diagnostic banners on `/api/ollama/tags`).

## Oracles

- **[host-loopback-and-relay-checks]**: Exercise `serve.mjs` in `test/session-spec-verify.test.ts` verifying HTTP 200 on `/` and `/api/docs` (including `docs/oracles/*.json`), HTTP 403 on `Sec-Fetch-Site: cross-site`, and identical prefix forwarding across multi-turn `/api/ollama/chat`.

## Implementation Notes

- `DOCS_PORT` defaults to `8080`; `OLLAMA_URL` defaults to `http://127.0.0.1:11434`. `POST /api/ollama/chat` accepts up to 2 MB payloads.
