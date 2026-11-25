import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SKILL_NAMES = ["spec-distill", "spec-verify", "spec-view"] as const;
const CANONICAL_SCRIPT = path.join(
	REPO_ROOT,
	"skills",
	"spec-distill",
	"scripts",
	"check-specs.ts",
);
const SYNC_SCRIPT = path.join(REPO_ROOT, "scripts", "sync-check-specs.ts");

const tempDirs: string[] = [];

function makeTempDir(prefix = "session-spec-verify-v2-"): string {
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

describe("session-spec-verify v2 skill bundle and check-specs CLI", () => {
	afterEach(() => {
		while (tempDirs.length > 0) {
			const dir = tempDirs.pop();
			if (dir && fs.existsSync(dir)) {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		}
	});

	it("keeps check-specs.ts and spec-view assets byte-identical across skills and publishes valid generic manifests", () => {
		const syncRes = runTsScript(SYNC_SCRIPT, ["--check"]);
		assert.equal(syncRes.status, 0, syncRes.stderr);

		const rootPlugin = JSON.parse(
			fs.readFileSync(path.join(REPO_ROOT, "plugin.json"), "utf8"),
		) as Record<string, unknown>;
		assert.equal(rootPlugin.name, "session-spec-verify");
		assert.equal(rootPlugin.version, "2.0.0");
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
		) as { name: string; version: string; skills: string[] };
		assert.equal(claudePlugin.name, "session-spec-verify");
		assert.equal(claudePlugin.version, "2.0.0");
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

	it("validates self-hosted v2 docs/, resolves effective tiered rules, and produces a unified bundle", () => {
		const checkRes = runTsScript(CANONICAL_SCRIPT, ["validate", "--root", REPO_ROOT, "--json"]);
		assert.equal(checkRes.status, 0, checkRes.stderr);
		const summary = JSON.parse(checkRes.stdout) as {
			ok: boolean;
			standardsCount: number;
			oraclesCount: number;
			specsCount: number;
			decisionsCount: number;
		};
		assert.equal(summary.ok, true);
		assert.equal(summary.standardsCount, 1);
		assert.ok(summary.oraclesCount >= 1);
		assert.equal(summary.specsCount, 4);
		assert.ok(summary.decisionsCount >= 10);

		const effRes = runTsScript(CANONICAL_SCRIPT, ["effective", "--root", REPO_ROOT, "--json"]);
		assert.equal(effRes.status, 0, effRes.stderr);
		const eff = JSON.parse(effRes.stdout) as {
			ok: boolean;
			oracles: string[];
			effectiveRules: { pack: string; tier: number; kind: string; id: string }[];
		};
		assert.equal(eff.ok, true);
		assert.ok(eff.oracles.includes("docs/oracles/check-specs-pins.json"));
		assert.ok(eff.effectiveRules.some((r) => r.id === "kebab-skill-identity" && r.tier === 0));
		assert.ok(eff.effectiveRules.some((r) => r.id === "unbounded-rule-tier" && r.kind === "anti_spec" && r.tier === 0));
		assert.ok(eff.effectiveRules.some((r) => r.id === "node24-strip-types-runtime" && r.kind === "assumption" && r.tier === 2));
		assert.ok(eff.effectiveRules.some((r) => r.id === "validator-golden-pins" && r.kind === "oracle"));

		const bundleRes = runTsScript(CANONICAL_SCRIPT, ["bundle", "--root", REPO_ROOT]);
		assert.equal(bundleRes.status, 0, bundleRes.stderr);
		assert.match(bundleRes.stdout, /# Tier 0 · External Standards/);
		assert.match(bundleRes.stdout, /# Tier 0 · Holdout Oracle Fixtures/);
		assert.match(bundleRes.stdout, /# Tier 1 \/ Tier 2 · Domain Spec Packs/);
		assert.match(bundleRes.stdout, /\*\*D-1\*\*/);
		assert.match(bundleRes.stdout, /\*\*D-10\*\*/);
	});

	it("bootstraps a clean tiered docs/ tree with init subcommand idempotently and passes validate immediately", () => {
		const sandbox = makeTempDir("ssv2-init-");
		const initRes = runTsScript(CANONICAL_SCRIPT, [
			"init",
			"--root",
			sandbox,
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
		assert.ok(initParsed.created.includes("docs/oracles"));
		assert.ok(initParsed.created.includes("docs/decisions.jsonl"));

		const indexContent = fs.readFileSync(path.join(sandbox, "docs", "INDEX.md"), "utf8");
		assert.match(indexContent, /^# Demo Workspace — Tiered Specifications & Verification Index/);
		assert.match(indexContent, /## Glossary/);

		const checkRes = runTsScript(CANONICAL_SCRIPT, ["validate", "--root", sandbox, "--json"]);
		assert.equal(checkRes.status, 0, checkRes.stderr);

		// Re-running init must preserve existing files
		fs.appendFileSync(path.join(sandbox, "docs", "INDEX.md"), "\nCustom note.\n", "utf8");
		const secondInit = runTsScript(CANONICAL_SCRIPT, ["init", "--root", sandbox, "--json"]);
		assert.equal(secondInit.status, 0, secondInit.stderr);
		const secondParsed = JSON.parse(secondInit.stdout) as {
			created: string[];
			existing: string[];
		};
		assert.equal(secondParsed.created.length, 0);
		assert.ok(secondParsed.existing.includes("docs/INDEX.md"));
		assert.match(fs.readFileSync(path.join(sandbox, "docs", "INDEX.md"), "utf8"), /Custom note\./);
	});

	it("enforces Tier bounds, 5 rule kinds, 4-status decisions, override/waiver authority, VERSION_SKEW, and w_drift diagnosis", () => {
		const sandbox = makeTempDir("ssv2-lifecycle-");
		const localSkillsDir = path.join(sandbox, "vendor", "skills");
		fs.mkdirSync(localSkillsDir, { recursive: true });
		fs.cpSync(path.join(REPO_ROOT, "skills"), localSkillsDir, { recursive: true });

		const standaloneScript = path.join(localSkillsDir, "spec-distill", "scripts", "check-specs.ts");
		assert.equal(runTsScript(standaloneScript, ["init", "--root", sandbox]).status, 0);

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
				"tier: 0",
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
				"## Oracles",
				"- **[secret-scan-oracle]**: Scan logs for credential prefixes.",
				"",
			].join("\n"),
			"utf8",
		);

		const specPath = path.join(sandbox, "docs", "specs", "foundation", "app-secrets.md");
		fs.mkdirSync(path.dirname(specPath), { recursive: true });
		const makeSpec = (decisionId: string, tierLine = "tier: 1", statusLine = "status: candidate") =>
			[
				"---",
				"kind: spec",
				"id: app-secrets",
				"title: App Secrets",
				"domain: foundation",
				tierLine,
				statusLine,
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
				"## Anti-Specs",
				"- **[never-write-plaintext-env]** (*NEVER*): Never materialize `.env` secret files inside workspaces.",
				"",
				"## Acceptance Criteria",
				"- **[central-secret-env]**: Workspaces receive runtime secrets via process env injection.",
				"",
				"## World Assumptions",
				"- **[vault-cli-env-format]**: External secrets CLI emits single-line `KEY=VAL` records.",
				"",
				"## Oracles",
				"- **[env-injection-pin]**: Verify env injection without `.env` files on disk.",
				"",
			].join("\n");

		fs.writeFileSync(specPath, makeSpec("D-1", "tier: 9"), "utf8");
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
			date: "2026-11-25",
			status: "decided",
			author: { role: "coding_agent", harness: "codex" },
			packs: ["foundation/app-secrets"],
			title: "Agent-proposed env injection",
			summary: "Agent chose central injection.",
			resolution: "Avoids .env files.",
			comments: [],
		};
		const personDecision = {
			id: "D-2",
			date: "2026-11-25",
			status: "decided",
			author: { role: "person" },
			packs: ["foundation/app-secrets"],
			title: "Person-ratified env injection",
			summary: "Operator ratified central injection.",
			resolution: "Avoids .env files.",
			rejected: ["Write gitignored .env files into every temporary sandbox"],
			pins: [{ input: "temp workspace spawn", expected: "process.env populated, 0 .env files" }],
			comments: [],
		};
		fs.writeFileSync(
			path.join(sandbox, "docs", "decisions.jsonl"),
			`${JSON.stringify(agentDecision)}\n${JSON.stringify(personDecision)}\n`,
			"utf8",
		);

		const badTierAndAuth = runTsScript(standaloneScript, ["validate", "--root", sandbox, "--json"]);
		assert.equal(badTierAndAuth.status, 1);
		assert.match(badTierAndAuth.stdout, /SPEC_TIER_INVALID/);
		assert.match(badTierAndAuth.stdout, /OVERRIDE_AUTHORITY_INVALID/);

		fs.writeFileSync(specPath, makeSpec("D-2", "tier: 1", "status: candidate"), "utf8");
		const effOk = runTsScript(standaloneScript, ["effective", "--root", sandbox, "--json"]);
		assert.equal(effOk.status, 0, effOk.stderr);
		const effBody = JSON.parse(effOk.stdout) as {
			specs: { status: string; tier: number }[];
			effectiveRules: { id: string; kind: string; tier: number }[];
		};
		assert.equal(effBody.specs[0]?.status, "candidate");
		assert.equal(effBody.specs[0]?.tier, 1);
		assert.ok(effBody.effectiveRules.some((r) => r.id === "never-write-plaintext-env" && r.kind === "anti_spec" && r.tier === 0));
		assert.ok(effBody.effectiveRules.some((r) => r.id === "vault-cli-env-format" && r.kind === "assumption" && r.tier === 2));
		assert.equal(effBody.effectiveRules.some((r) => r.id === "per-repo-env-file"), false);

		const runDir = path.join(sandbox, "docs", "runs", "2026-11-25T12-00-00Z_abc1234");
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
				diagnosis: null,
				evidence: "Agent attempted waiver",
				proposal: null,
				waivedBy: "coding_agent",
			})}\n`,
			"utf8",
		);
		const badWaiver = runTsScript(standaloneScript, ["validate", "--root", sandbox, "--json"]);
		assert.equal(badWaiver.status, 1);
		assert.match(badWaiver.stdout, /WAIVER_AUTHORITY_INVALID/);

		fs.writeFileSync(
			path.join(runDir, "verdicts.jsonl"),
			[
				JSON.stringify({
					pack: "foundation/app-secrets",
					packVersion: 1,
					id: "vault-cli-env-format",
					kind: "assumption",
					verdict: "fail",
					diagnosis: "w_drift",
					evidence: "External CLI switched to JSON stdout",
					proposal: "Regenerate Tier 2 parser adapter without editing Tier 0/1 rules",
					waivedBy: null,
				}),
				JSON.stringify({
					pack: "foundation/app-secrets",
					packVersion: 1,
					id: "central-secret-env",
					kind: "criterion",
					verdict: "waived",
					diagnosis: null,
					evidence: "Operator approved temporary waiver",
					proposal: null,
					waivedBy: "person",
				}),
			].join("\n") + "\n",
			"utf8",
		);
		assert.equal(runTsScript(standaloneScript, ["validate", "--root", sandbox]).status, 0);

		fs.writeFileSync(
			stdPath,
			fs.readFileSync(stdPath, "utf8").replace("version: 1", "version: 2"),
			"utf8",
		);
		const skew = runTsScript(standaloneScript, ["validate", "--root", sandbox, "--json"]);
		assert.equal(skew.status, 1);
		assert.match(skew.stdout, /VERSION_SKEW/);
	});

	it("serves the standalone spec-view skill, exposes oracles json, enforces loopback boundaries, and preserves Ollama prefix caching", async () => {
		const sandbox = makeTempDir("ssv2-viewer-");
		const skillDir = path.join(sandbox, "spec-view");
		fs.cpSync(path.join(REPO_ROOT, "skills", "spec-view"), skillDir, { recursive: true });

		let tagsMode: "ok" | "404" | "invalid" = "ok";
		const receivedChatPayloads: { model?: string; messages?: { role: string; content: string }[] }[] = [];

		const mockOllama = http.createServer(async (req, res) => {
			if (req.method === "GET" && req.url === "/api/tags") {
				if (tagsMode === "404") {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "not found" }));
					return;
				}
				if (tagsMode === "invalid") {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ hello: "world" }));
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
				return;
			}
			if (req.method === "POST" && req.url === "/api/chat") {
				const chunks: Buffer[] = [];
				for await (const chunk of req) chunks.push(chunk as Buffer);
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				receivedChatPayloads.push(body);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						message: {
							role: "assistant",
							content: "### Summary\n\nAll rules in [S1] and `foundation/local-viewer-host` pass.",
						},
					}),
				);
				return;
			}
			res.writeHead(404);
			res.end();
		});

		await new Promise<void>((resolve) => mockOllama.listen(0, "127.0.0.1", resolve));
		const ollamaPort = (mockOllama.address() as AddressInfo).port;

		const probe = http.createServer();
		await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
		const viewerPort = (probe.address() as AddressInfo).port;
		await new Promise<void>((resolve) => probe.close(() => resolve()));

		const serveScript = path.join(skillDir, "scripts", "serve.mjs");
		const child = spawn(process.execPath, [serveScript, path.join(REPO_ROOT, "docs")], {
			env: {
				...process.env,
				DOCS_PORT: String(viewerPort),
				OLLAMA_URL: `http://127.0.0.1:${ollamaPort}`,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		try {
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error("Viewer server timed out starting")), 5000);
				child.stdout.on("data", (chunk: Buffer) => {
					if (chunk.toString("utf8").includes(`http://127.0.0.1:${viewerPort}`)) {
						clearTimeout(timeout);
						resolve();
					}
				});
				child.on("exit", (code) => {
					clearTimeout(timeout);
					reject(new Error(`Viewer exited early with code ${code}`));
				});
			});

			const baseUrl = `http://127.0.0.1:${viewerPort}`;

			const htmlRes = await fetch(`${baseUrl}/`);
			assert.equal(htmlRes.status, 200);
			const htmlText = await htmlRes.text();
			assert.match(htmlText, /aside id="chat"/);
			assert.match(htmlText, /function renderMarkdown/);
			assert.match(htmlText, /function buildSystemPrompt/);

			const docsRes = await fetch(`${baseUrl}/api/docs`);
			assert.equal(docsRes.status, 200);
			const docsList = (await docsRes.json()) as { path: string; text: string }[];
			assert.ok(docsList.some((d) => d.path === "docs/INDEX.md"));
			assert.ok(docsList.some((d) => d.path === "docs/oracles/check-specs-pins.json"));
			assert.ok(docsList.some((d) => d.path === "docs/specs/interfaces/spec-explorer.md"));

			const crossSiteRes = await fetch(`${baseUrl}/api/docs`, {
				headers: { "Sec-Fetch-Site": "cross-site" },
			});
			assert.equal(crossSiteRes.status, 403);

			const tagsOk = await fetch(`${baseUrl}/api/ollama/tags`);
			assert.equal(tagsOk.status, 200);
			const tagsBody = (await tagsOk.json()) as { models: { name: string }[] };
			assert.equal(tagsBody.models[0]?.name, "qwen3:8b");

			tagsMode = "404";
			const tags404 = await fetch(`${baseUrl}/api/ollama/tags`);
			assert.equal(tags404.status, 502);
			assert.match(JSON.stringify(await tags404.json()), /returned 404/);

			tagsMode = "invalid";
			const tagsInvalid = await fetch(`${baseUrl}/api/ollama/tags`);
			assert.equal(tagsInvalid.status, 502);
			assert.match(JSON.stringify(await tagsInvalid.json()), /did not return an Ollama model list/);

			const systemPrefix = `=== LOADED DOCS ===\n${docsList.map((d, i) => `[S${i + 1}] ${d.path}\n${d.text}`).join("\n\n")}`;
			const turn1Res = await fetch(`${baseUrl}/api/ollama/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "qwen3:8b",
					stream: false,
					messages: [
						{ role: "system", content: systemPrefix },
						{ role: "user", content: "What modules exist?" },
					],
				}),
			});
			assert.equal(turn1Res.status, 200);
			const turn1Body = (await turn1Res.json()) as { message: { content: string } };
			assert.match(turn1Body.message.content, /### Summary/);

			const turn2Res = await fetch(`${baseUrl}/api/ollama/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "qwen3:8b",
					stream: false,
					messages: [
						{ role: "system", content: systemPrefix },
						{ role: "user", content: "What modules exist?" },
						{ role: "assistant", content: turn1Body.message.content },
						{ role: "user", content: "Tell me more about [S1]." },
					],
				}),
			});
			assert.equal(turn2Res.status, 200);
			assert.equal(receivedChatPayloads.length, 2);
			assert.equal(
				receivedChatPayloads[0]?.messages?.[0]?.content,
				receivedChatPayloads[1]?.messages?.[0]?.content,
				"Leading system message must remain byte-identical across turns for Ollama KV cache reuse",
			);
		} finally {
			child.kill("SIGTERM");
			await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
		}
	});
});
