import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SKILL_NAMES = ["spec-extract", "verify-deploy", "spec-refactor"] as const;
const CANONICAL_SCRIPT = path.join(
	REPO_ROOT,
	"skills",
	"spec-refactor",
	"scripts",
	"check-specs.ts",
);
const SYNC_SCRIPT = path.join(REPO_ROOT, "scripts", "sync-check-specs.ts");

const tempDirs: string[] = [];

function makeTempDir(prefix = "session-spec-verify-"): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function runTsScript(
	scriptPath: string,
	args: readonly string[] = [],
): { status: number; stdout: string; stderr: string } {
	try {
		const stdout = execFileSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { status: 0, stdout, stderr: "" };
	} catch (err) {
		const e = err as { status?: number; stdout?: string; stderr?: string };
		return {
			status: e.status ?? 1,
			stdout: String(e.stdout ?? ""),
			stderr: String(e.stderr ?? ""),
		};
	}
}

function collectFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectFiles(full));
		} else if (entry.isFile()) {
			out.push(full);
		}
	}
	return out;
}

describe("session-spec-verify skill bundle and check-specs CLI", () => {
	afterEach(() => {
		while (tempDirs.length > 0) {
			const dir = tempDirs.pop();
			if (dir && fs.existsSync(dir)) {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		}
	});

	it("keeps check-specs.ts byte-identical across skills and publishes valid generic manifests", () => {
		const syncRes = runTsScript(SYNC_SCRIPT, ["--check"]);
		assert.equal(syncRes.status, 0, syncRes.stderr);

		const rootPlugin = JSON.parse(
			fs.readFileSync(path.join(REPO_ROOT, "plugin.json"), "utf8"),
		) as Record<string, unknown>;
		assert.equal(rootPlugin.name, "session-spec-verify");
		assert.equal(rootPlugin.logo, "assets/logo.svg");
		assert.ok(Array.isArray(rootPlugin.suggestedPrompts) && rootPlugin.suggestedPrompts.length === 3);
		assert.equal(rootPlugin.skills, undefined, "Root Antigravity plugin.json must not declare skills");
		assert.equal(
			rootPlugin.keywords,
			undefined,
			"Root Antigravity plugin.json must not declare keywords",
		);
		assert.equal(fs.existsSync(path.join(REPO_ROOT, "assets", "logo.svg")), true);

		const claudePlugin = JSON.parse(
			fs.readFileSync(path.join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
		) as { name: string; skills: string[] };
		assert.equal(claudePlugin.name, "session-spec-verify");
		assert.deepEqual(
			claudePlugin.skills,
			SKILL_NAMES.map((name) => `./skills/${name}`),
		);

		for (const skill of SKILL_NAMES) {
			const skillMdPath = path.join(REPO_ROOT, "skills", skill, "SKILL.md");
			assert.equal(fs.existsSync(skillMdPath), true);
			const content = fs.readFileSync(skillMdPath, "utf8");
			assert.match(content, new RegExp(`^---\\nname:\\s*${skill}\\n`, "m"));
		}

		for (const filePath of collectFiles(path.join(REPO_ROOT, "skills"))) {
			const text = fs.readFileSync(filePath, "utf8");
			assert.equal(
				/habitat/i.test(text),
				false,
				`Skill asset ${path.relative(REPO_ROOT, filePath)} must remain repository-agnostic`,
			);
			assert.equal(
				text.includes(".agents/skills/"),
				false,
				`Skill asset ${path.relative(REPO_ROOT, filePath)} must not hardcode .agents/skills/`,
			);
		}
	});

	it("validates self-hosted docs/, resolves effective rules, and produces a unified bundle", () => {
		const checkRes = runTsScript(CANONICAL_SCRIPT, ["--root", REPO_ROOT, "--json"]);
		assert.equal(checkRes.status, 0, checkRes.stderr);
		const summary = JSON.parse(checkRes.stdout) as {
			ok: boolean;
			standardsCount: number;
			specsCount: number;
			decisionsCount: number;
		};
		assert.equal(summary.ok, true);
		assert.equal(summary.standardsCount, 1);
		assert.equal(summary.specsCount, 4);
		assert.ok(summary.decisionsCount >= 3);

		const effRes = runTsScript(CANONICAL_SCRIPT, ["--root", REPO_ROOT, "--effective", "--json"]);
		assert.equal(effRes.status, 0, effRes.stderr);
		const eff = JSON.parse(effRes.stdout) as {
			ok: boolean;
			effectiveRules: { pack: string; id: string }[];
		};
		assert.equal(eff.ok, true);
		assert.ok(eff.effectiveRules.some((r) => r.id === "kebab-skill-identity"));
		assert.ok(eff.effectiveRules.some((r) => r.id === "idempotent-workspace-init"));
		assert.ok(eff.effectiveRules.some((r) => r.id === "immutable-timestamped-runs"));

		const bundleRes = runTsScript(CANONICAL_SCRIPT, ["--root", REPO_ROOT, "--bundle"]);
		assert.equal(bundleRes.status, 0, bundleRes.stderr);
		assert.match(bundleRes.stdout, /# External Standards/);
		assert.match(bundleRes.stdout, /# Local Conceptual Specs/);
		assert.match(bundleRes.stdout, /\*\*D-1\*\*/);
	});

	it("bootstraps a clean docs/ tree with --init idempotently and passes check immediately", () => {
		const sandbox = makeTempDir("ssv-init-");
		const initRes = runTsScript(CANONICAL_SCRIPT, [
			"--root",
			sandbox,
			"--init",
			"--title",
			"Demo Workspace",
			"--json",
		]);
		assert.equal(initRes.status, 0, initRes.stderr);
		const initParsed = JSON.parse(initRes.stdout) as {
			ok: boolean;
			initialized: boolean;
			title: string;
			created: string[];
		};
		assert.equal(initParsed.ok, true);
		assert.equal(initParsed.initialized, true);
		assert.equal(initParsed.title, "Demo Workspace");
		assert.ok(initParsed.created.includes("docs/INDEX.md"));
		assert.ok(initParsed.created.includes("docs/decisions.jsonl"));

		const indexContent = fs.readFileSync(path.join(sandbox, "docs", "INDEX.md"), "utf8");
		assert.match(indexContent, /^# Demo Workspace — Modular Specifications & Verification Index/);

		const checkRes = runTsScript(CANONICAL_SCRIPT, ["--root", sandbox, "--json"]);
		assert.equal(checkRes.status, 0, checkRes.stderr);

		// Re-running --init must preserve existing files
		fs.appendFileSync(path.join(sandbox, "docs", "INDEX.md"), "\nCustom note.\n", "utf8");
		const secondInit = runTsScript(CANONICAL_SCRIPT, ["--root", sandbox, "--init", "--json"]);
		assert.equal(secondInit.status, 0, secondInit.stderr);
		const secondParsed = JSON.parse(secondInit.stdout) as {
			created: string[];
			existing: string[];
		};
		assert.equal(secondParsed.created.length, 0);
		assert.ok(secondParsed.existing.includes("docs/INDEX.md"));
		assert.match(fs.readFileSync(path.join(sandbox, "docs", "INDEX.md"), "utf8"), /Custom note\./);
	});

	it("enforces override authority, VERSION_SKEW, waiver authority, and cold-rebuild bundling", () => {
		const sandbox = makeTempDir("ssv-lifecycle-");
		// Copy only skills/ into .agents/skills/ and initialize docs/ to simulate standalone usage
		const localSkillsDir = path.join(sandbox, ".agents", "skills");
		fs.mkdirSync(localSkillsDir, { recursive: true });
		fs.cpSync(path.join(REPO_ROOT, "skills"), localSkillsDir, { recursive: true });

		const standaloneScript = path.join(localSkillsDir, "spec-extract", "scripts", "check-specs.ts");
		assert.equal(runTsScript(standaloneScript, ["--root", sandbox, "--init"]).status, 0);

		const stdPath = path.join(sandbox, "docs", "standards", "secret-hygiene.md");
		fs.writeFileSync(
			stdPath,
			[
				"---",
				"kind: standard",
				"id: secret-hygiene",
				"title: Secret Hygiene",
				"source: https://standards.thefocus.ai/packs/secret-hygiene.md",
				"version: 1",
				"status: in_force",
				"---",
				"",
				"## Intent",
				"Keep credentials out of logs and deliver runtime secrets safely.",
				"",
				"## Invariants",
				"- **[secret-redaction]** (*NEVER*): Logs **NEVER** contain raw secrets.",
				"- **[per-repo-env-file]**: Supply secrets via local `.env` files.",
				"",
				"## Verification",
				"Run secret prefix scan.",
				"",
			].join("\n"),
			"utf8",
		);

		const specPath = path.join(sandbox, "docs", "specs", "foundation", "app-secrets.md");
		fs.mkdirSync(path.dirname(specPath), { recursive: true });
		const makeSpec = (decisionId: string) =>
			[
				"---",
				"kind: spec",
				"id: app-secrets",
				"title: App Secrets",
				"layer: foundation",
				"version: 1",
				"uses:",
				"  - standards/secret-hygiene@1",
				"overrides:",
				"  - target: standards/secret-hygiene#per-repo-env-file",
				`    decision: ${decisionId}`,
				"    summary: Use central runtime secret injection instead of per-repo .env files.",
				"---",
				"",
				"## Intent",
				"Inject runtime secrets without writing .env files into workspaces.",
				"",
				"## Acceptance Criteria",
				"- **[central-secret-env]**: Workspaces receive runtime secrets via process env injection.",
				"",
				"## Verification",
				"Verify env injection without .env files on disk.",
				"",
			].join("\n");

		fs.writeFileSync(specPath, makeSpec("D-1"), "utf8");
		fs.writeFileSync(
			path.join(sandbox, "docs", "INDEX.md"),
			[
				"# Lifecycle Sandbox",
				"",
				"- [secret-hygiene](./standards/secret-hygiene.md)",
				"- [app-secrets](./specs/foundation/app-secrets.md)",
				"",
			].join("\n"),
			"utf8",
		);

		const agentDecision = {
			id: "D-1",
			date: "2026-11-17",
			type: "choice",
			outcome: "decided",
			author: { role: "coding_agent", harness: "claude-code" },
			packs: ["foundation/app-secrets"],
			title: "Agent-proposed env injection",
			summary: "Agent chose central injection.",
			resolution: "Avoids .env files.",
			comments: [],
		};
		const personDecision = {
			id: "D-2",
			date: "2026-11-17",
			type: "choice",
			outcome: "decided",
			author: { role: "person" },
			packs: ["foundation/app-secrets"],
			title: "Person-ratified env injection",
			summary: "Operator ratified central injection.",
			resolution: "Avoids .env files.",
			comments: [],
		};
		fs.writeFileSync(
			path.join(sandbox, "docs", "decisions.jsonl"),
			`${JSON.stringify(agentDecision)}\n${JSON.stringify(personDecision)}\n`,
			"utf8",
		);

		// Coding-agent decision cannot authorize a standard override
		const badAuth = runTsScript(standaloneScript, ["--root", sandbox, "--json"]);
		assert.equal(badAuth.status, 1);
		assert.match(badAuth.stdout, /OVERRIDE_AUTHORITY_INVALID/);

		// Person decision ratifies the override and replaces #per-repo-env-file in effective rules
		fs.writeFileSync(specPath, makeSpec("D-2"), "utf8");
		const effOk = runTsScript(standaloneScript, ["--root", sandbox, "--effective", "--json"]);
		assert.equal(effOk.status, 0, effOk.stderr);
		const effBody = JSON.parse(effOk.stdout) as {
			effectiveRules: { id: string }[];
		};
		assert.ok(effBody.effectiveRules.some((r) => r.id === "secret-redaction"));
		assert.ok(effBody.effectiveRules.some((r) => r.id === "central-secret-env"));
		assert.equal(
			effBody.effectiveRules.some((r) => r.id === "per-repo-env-file"),
			false,
		);

		// Verify run waiver authority guard
		const runDir = path.join(sandbox, "docs", "runs", "2026-11-17T12-00-00Z_abc1234");
		fs.mkdirSync(runDir, { recursive: true });
		fs.writeFileSync(path.join(runDir, "summary.md"), "# Run Summary\n", "utf8");
		fs.writeFileSync(
			path.join(runDir, "verdicts.jsonl"),
			`${JSON.stringify({
				pack: "foundation/app-secrets",
				packVersion: 1,
				id: "central-secret-env",
				kind: "criterion",
				verdict: "waived",
				evidence: "Agent attempted waiver",
				proposal: null,
				waivedBy: "coding_agent",
			})}\n`,
			"utf8",
		);
		const badWaiver = runTsScript(standaloneScript, ["--root", sandbox, "--json"]);
		assert.equal(badWaiver.status, 1);
		assert.match(badWaiver.stdout, /WAIVER_AUTHORITY_INVALID/);

		fs.writeFileSync(
			path.join(runDir, "verdicts.jsonl"),
			`${JSON.stringify({
				pack: "foundation/app-secrets",
				packVersion: 1,
				id: "central-secret-env",
				kind: "criterion",
				verdict: "waived",
				evidence: "Operator approved temporary waiver",
				proposal: null,
				waivedBy: "person",
			})}\n`,
			"utf8",
		);
		assert.equal(runTsScript(standaloneScript, ["--root", sandbox]).status, 0);

		// Bumping upstream standard version triggers VERSION_SKEW
		fs.writeFileSync(
			stdPath,
			fs.readFileSync(stdPath, "utf8").replace("version: 1", "version: 2"),
			"utf8",
		);
		const skew = runTsScript(standaloneScript, ["--root", sandbox, "--json"]);
		assert.equal(skew.status, 1);
		assert.match(skew.stdout, /VERSION_SKEW/);
	});
});
