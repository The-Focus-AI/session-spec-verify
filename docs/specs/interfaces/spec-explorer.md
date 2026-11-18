---
kind: spec
id: spec-explorer
title: Specification explorer
layer: interfaces
version: 1
---

## Intent

See which parts of a project are specified, what each part does, and which rules have evidence. Start with the functional overview, then open a module, rule, or behavior question when more detail is needed.

## Invariants

- **[recorded-evidence-only]** (*NEVER*): Browsing or importing docs never runs a verification check or turns a waiver, missing verdict, or verdict for another pack version into a recorded pass.

## Acceptance Criteria

- **[functional-area-drill-down]**: The first screen groups local modules by functional area and shows their purpose and recorded pass counts. A persistent index and breadcrumbs let the reader navigate from the overview to an area, a module, and its rules.
- **[traceable-rule-evidence]**: A rule shows its evidence status and, when a verdict exists, its evidence text, run file and line, and pack version. Shared standards appear separately from local modules. A module exposes its pinned standards, declared overrides, related decisions, and source text.
- **[session-imports]**: Selecting or dropping a docs folder replaces the active collection. Dropping a standalone spec adds it to Incoming with no evidence. Dropping a plain-text behavior ask opens it in the question form.
- **[cited-behavior-comparison]**: The reader can find candidate passages without a model. With a selected Ollama model and candidate passages, the reader can request a comparison showing the current specification, gaps or conflicts, proposed changes, and verification to add. Source references in the response open the matching passages.

## Implementation Notes

- Swiss index visual baseline: neutral paper and ink, sans-serif typography, square corners, aligned rows, sparse red accents, and a functional index that stacks above the reading pane on narrow screens. See [design.md](../../../design.md) for spacing and type.
- Build & validate and Extract & verify are display names for the `foundation` and `workflows` layers. Preserve the pack identity and source path in the details.
- A verdict is matched by pack reference, rule ID, rule kind, and pack version. The viewer prefers the latest valid matching record in timestamped run-path order. The dates and pack versions describe recorded evidence only.
- Search ranks excerpts from loaded pack intents, rules, verdicts, and decisions by text match. Module scope limits candidates to the module, its referenced standards, and related records. A comparison sends the ask and selected excerpts to the configured model only when requested.

## Verification

1. Open the viewer with a docs folder containing multiple layers, a shared standard, and mixed verdicts. Follow an area and module to an individual verdict, and confirm that shared standards count once and a version mismatch stays separate from passes.
2. Add a standalone module and a text ask. Inspect Incoming, the no-evidence status, and the populated question form. Reload to confirm no source files were written.
3. Find passages for a known rule. With an Ollama test endpoint returning a structured answer and a source ID, compare the ask and open the citation.

## Open Callouts

- D-8 records open questions about saving reviewed imports and generating exact Markdown edits.
