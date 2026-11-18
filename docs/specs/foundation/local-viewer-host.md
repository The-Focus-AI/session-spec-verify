---
kind: spec
id: local-viewer-host
title: Local viewer hosting
layer: foundation
version: 1
---

## Intent

Serve the self-contained viewer and project docs over one local HTTP origin so the browser can browse files and reach an optional Ollama instance from the same page.

## Invariants

- **[read-only-docs-host]** (*NEVER*): The host never writes to the docs folder. It reads Markdown and JSONL files beneath the configured root and skips symlink entries.
- **[local-origin-boundary]** (*NEVER*): The server accepts requests only on IPv4 loopback and rejects unexpected Host or Origin headers and cross-site browser requests.

## Acceptance Criteria

- **[single-command-docs-serving]**: Starting the viewer host with one Node command serves the HTML and the selected docs folder over the same HTTP origin. If the folder cannot be loaded, the viewer labels and displays the bundled repository snapshot.
- **[same-origin-ollama]**: Find models lists the models reported by the configured Ollama instance. Behavior comparisons go through the same viewer origin to that instance.
- **[model-connection-diagnostics]**: Find models distinguishes a missing viewer route, an Ollama endpoint that cannot be reached, an upstream 404, and a successful response that lacks an Ollama model list.

## Implementation Notes

- Start with `node serve.mjs [docs-directory]` using Node.js. The folder defaults to `./docs` relative to the launch directory. The HTML ships as `index.html` with its CSS, JavaScript, and sample docs embedded.
- `DOCS_PORT` defaults to `8080`. `OLLAMA_URL` accepts an HTTP(S) origin without an API path and defaults to `http://127.0.0.1:11434` from the server's machine.
- `GET /api/docs` returns path/text records. Model discovery and comparison use `GET /api/ollama/tags` and `POST /api/ollama/chat`, which relay to Ollama's corresponding API routes. A generic static host can display the snapshot but cannot provide those routes.

## Verification

1. Start the host with an explicit docs directory. Request the page and `/api/docs`. Check that returned paths point inside that directory and the viewer displays the loaded collection.
2. Point `OLLAMA_URL` at a test endpoint. Check model listing and a comparison request, then repeat discovery with an upstream 404, an incompatible response, and an unreachable endpoint. Serve the HTML from a static host to check the missing-route message.

## Open Callouts

- The Cloud preview served the viewer over port 8081. Ollama was unavailable in that workspace. The comparison path was exercised with a mock endpoint, and a live model run remains unverified.
