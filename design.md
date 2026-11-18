# Docs explorer — Swiss index

Status: selected by the user. This is the design baseline for the viewer.

## Purpose

Explore the specifications stored in docs/: see which functional areas and modules exist, inspect their documented behavior and verification evidence, and ask whether requested behavior is already specified or would require changes.

## Navigation and layout

Project overview → functional area → module → rule and evidence.

Keep Reading room's persistent left index and main reading pane. Open on the whole-system overview. Group modules by functional purpose, with the original conceptual layer and file path available as secondary metadata. The repository's initial groups are Build & validate and Extract & verify.

The overview shows each area's purpose, module count, and recorded verification breakdown. Opening an area shows its modules; opening a module shows intent, rules, supporting standards, decisions, and evidence. Selecting a rule reveals its verdict and cited source. Breadcrumbs let the user move back without losing the functional index.

Shared standards, decisions, and verification runs are supporting records. Keep them accessible without counting them as local modules.

## Visual system

- Swiss typography and grid: Helvetica Neue / Arial / system sans, strong left alignment, restrained hierarchy.
- Neutral paper and ink with a sparse red accent for active navigation, links, and primary actions.
- No warm beige, pastel surfaces, gradients, shadows, or rounded cards.
- Square controls, thin neutral dividers, stronger main separators, and an 8px spacing rhythm.
- Desktop baseline: 225px functional index, 32px reading-pane padding, aligned overview rows.
- Typography baseline: 44px overview title, 28–36px module title, 14px body, 11px metadata. Reduce large headings at narrow widths.
- Use neutral light/dark surface pairs with readable corresponding accents. Verification uses explicit status words and counts; red is not a passing-verification signal.
- On small screens, move the functional index above the reading pane, wrap source paths, and retain all essential navigation and evidence.

## Verification and coverage

Show passing, failed, inconclusive, waived, missing, and evidence with uncertain applicability separately. A waiver is not a passing result. Associate each record with its module, rule ID, pack version, and run.

Count shared standard rules once in collection totals. Preserve inherited rules and declared exceptions in a module's detail view without inflating its local-rule count.

Verification coverage means documented rules with applicable evidence. The docs alone cannot establish total behavioral coverage or prove the current running implementation matches its specification. Label historical results as recorded evidence; do not imply that viewing or importing files reruns checks.

## Specs and behavior asks

Accept incoming specs and behavior asks as distinct items. New specs enter an Incoming area until their functional placement is known. Show missing evidence explicitly. Importing a file does not verify it or adopt its proposed behavior.

A behavior ask describes what the user wants to happen. Compare it with the relevant documented contract and show:

1. Existing specification, with exact source passages.
2. Missing, conflicting, or ambiguous parts of the requested behavior.
3. Proposed specification changes and affected modules or standards.
4. Additional verification needed and unresolved user choices.

Keep proposals separate from adopted specifications. Distinguish no matching specification found from the implementation cannot do this.

## Local model boundary

The viewer should remain useful as a relatively static HTML/JavaScript application. Parsing, navigation, reference resolution, and verification counts work without a model. Ollama is an optional local connection for interpreting behavior asks and suggesting changes with citations.

Label inferred connections and potential semantic gaps as suggestions. Never fabricate an analysis when no model has run. Exact connection, indexing, and persistence mechanisms remain implementation decisions.

## Reference content

The selected mockup uses a snapshot of The-Focus-AI/session-spec-verify:

- Validator & CLI: four local rules and four recorded passing verdicts.
- Skill lifecycle: four local rules and four recorded passing verdicts.
- Portable agent skills: two shared rules and two recorded passing verdicts.
- Three linked decisions and run 2026-11-17T22-16-40Z_7d29a16.

These are repository-reported results, not checks rerun by the mockup. Its incoming spec and behavior comparison are explicitly illustrative.

## Design references

- [Viewer specification](docs/specs/interfaces/spec-explorer.md)
- [Local hosting specification](docs/specs/foundation/local-viewer-host.md)
