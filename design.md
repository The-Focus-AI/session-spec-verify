# Docs explorer — Swiss index

Status: selected by the user. This is the design baseline for the viewer.

## Purpose

Explore the specifications stored in `docs/`: see which functional areas and modules exist, inspect their documented behavior and verification evidence, and ask freeform questions in an always-present chat panel with the full `docs/` collection cached in the local model context.

## Navigation and layout

Project overview → functional area → module → rule and evidence, alongside a persistent right-side freeform chat panel.

Keep Reading room's persistent left index and main reading pane, paired with an always-present right-side chat column. Open on the whole-system overview. Group modules by functional purpose, with the original conceptual layer and file path available as secondary metadata. The repository's initial groups are Build & validate, Extract & verify, and Interfaces.

The overview shows each area's purpose, module count, and recorded verification breakdown. Opening an area shows its modules; opening a module shows intent, rules, supporting standards, decisions, and evidence. Selecting a rule reveals its verdict and cited source. Breadcrumbs let the user move back without losing the functional index.

Shared standards, decisions, and verification runs are supporting records. Keep them accessible without counting them as local modules.

## Visual system

- Swiss typography and grid: Helvetica Neue / Arial / system sans, strong left alignment, restrained hierarchy.
- Neutral paper and ink with a sparse red accent for active navigation, links, and primary actions.
- No warm beige, pastel surfaces, gradients, shadows, or rounded cards.
- Square controls, thin neutral dividers, stronger main separators, and an 8px spacing rhythm.
- Desktop baseline: `225px` functional index, fluid reading pane with `32px` padding, `380px` persistent right-side chat panel, aligned overview rows.
- Typography baseline: 44px overview title, 28–36px module title, 14px body, 11px metadata. Reduce large headings at narrow widths.
- Use neutral light/dark surface pairs with readable corresponding accents. Verification uses explicit status words and counts; red is not a passing-verification signal.
- On small screens, stack the functional index, reading pane, and chat panel while retaining all essential navigation, evidence, and chat controls.

## Verification and coverage

Show passing, failed, inconclusive, waived, missing, and evidence with uncertain applicability separately. A waiver is not a passing result. Associate each record with its module, rule ID, pack version, and run.

Count shared standard rules once in collection totals. Preserve inherited rules and declared exceptions in a module's detail view without inflating its local-rule count.

Verification coverage means documented rules with applicable evidence. The docs alone cannot establish total behavioral coverage or prove the current running implementation matches its specification. Label historical results as recorded evidence; do not imply that viewing or importing files reruns checks.

## Specs and persistent freeform chat

Accept incoming specs and plain-text prompts as distinct items. New specs enter an Incoming area until their functional placement is known. Show missing evidence explicitly. Importing a file does not verify it or adopt its proposed behavior.

The right-side chat panel is always present across all views so the user can ask about anything in the specifications, compare requested behavior against documented rules, or ask scoped questions about the currently open module:

1. **Deterministic full-docs prefix for Ollama KV caching**: Include all loaded `docs/` files (`docs/INDEX.md`, `docs/standards/*.md`, `docs/specs/**/*.md`, `docs/incoming/*.md`, `docs/decisions.jsonl`, and `docs/runs/**`) in a deterministic order inside the leading `system` message, followed by the multi-turn `user` and `assistant` conversation messages.
2. **Markdown response rendering**: Render model replies as formatted Markdown (headings, lists, tables, blockquotes, inline code, and fenced code blocks) with HTML escaping for untrusted content.
3. **Interactive citations**: Resolve `[S1]` source references, pack IDs, rule slugs, and `D-N` decision IDs so the user can jump directly to the cited source or module.

## Local model and skill boundary

The viewer remains useful as a zero-dependency HTML/JavaScript application served by a single Node.js script (`serve.mjs`). Parsing, navigation, reference resolution, and verification counts work without a model. Ollama is an optional local connection for multi-turn chat over the loaded specifications.

To support inspecting any repository's local setup, the viewer is packaged as the standalone `spec-viewer` skill (`skills/spec-viewer/`) containing `SKILL.md`, `scripts/serve.mjs`, `scripts/index.html`, and `scripts/check-specs.ts`.

## Design references

- [Viewer specification](docs/specs/interfaces/spec-explorer.md)
- [Local hosting specification](docs/specs/foundation/local-viewer-host.md)
