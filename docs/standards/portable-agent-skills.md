---
kind: standard
id: portable-agent-skills
title: Portable, Self-Contained Agent Skill Packages
source: https://standards.thefocus.ai/packs/portable-agent-skills.md
version: 1
tier: 0
status: in_force
---

## Intent

Ensure every installable skill folder functions standalone across agent harnesses (`skills` CLI, Claude Code, Antigravity, and `.agents/skills/` vendors) with matching kebab-case identity and zero external script or runtime package dependencies.

## Invariants

- **[kebab-skill-identity]** (*NEVER*): Every skill directory `skills/<name>/SKILL.md` **NEVER** mismatches its YAML `name:` field, never uses non-kebab-case naming, and never introduces a separate numeric skill registry.
- **[self-contained-skill-scripts]** (*NEVER*): Helper scripts referenced by a `SKILL.md` **NEVER** rely on paths outside the skill's own directory when installed individually via `skills add --skill <name>`, nor depend on third-party npm packages outside Node.js built-ins.

## Oracles

1. **Manifest & Sync Check**: Run `pnpm run sync:check` to verify all three v2 skills (`spec-distill`, `spec-verify`, `spec-view`) bundle byte-identical `scripts/check-specs.ts` and `SKILL.md` directory-to-`name` parity.
2. **Standalone Copy Smoke Test**: Copy any single `skills/<name>/` directory into an isolated `mktemp -d` folder with no `package.json` or `node_modules` and verify its bundled script executes cleanly using Node.js 24+.
