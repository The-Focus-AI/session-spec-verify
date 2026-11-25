import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const INDEX_HTML_PATH = path.join(REPO_ROOT, "index.html");

interface SyncGroup {
	canonical: string;
	targets: string[];
}

const SYNC_GROUPS: SyncGroup[] = [
	{
		canonical: path.join(REPO_ROOT, "skills", "spec-distill", "scripts", "check-specs.ts"),
		targets: [
			path.join(REPO_ROOT, "skills", "spec-verify", "scripts", "check-specs.ts"),
			path.join(REPO_ROOT, "skills", "spec-view", "scripts", "check-specs.ts"),
		],
	},
	{
		canonical: path.join(REPO_ROOT, "serve.mjs"),
		targets: [path.join(REPO_ROOT, "skills", "spec-view", "scripts", "serve.mjs")],
	},
	{
		canonical: INDEX_HTML_PATH,
		targets: [path.join(REPO_ROOT, "skills", "spec-view", "scripts", "index.html")],
	},
];

function collectDocsSnapshot(dir: string, out: { path: string; text: string }[] = []): { path: string; text: string }[] {
	if (!fs.existsSync(dir)) return out;
	const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectDocsSnapshot(full, out);
		} else if (entry.isFile()) {
			const relSub = path.relative(DOCS_DIR, full).split(path.sep).join("/");
			const isOracleJson = relSub.startsWith("oracles/") && /\.json$/i.test(entry.name);
			if (/\.(md|jsonl)$/i.test(entry.name) || isOracleJson) {
				out.push({ path: "docs/" + relSub, text: fs.readFileSync(full, "utf8") });
			}
		}
	}
	return out;
}

function buildUpdatedIndexHtml(html: string): string {
	const snapshot = collectDocsSnapshot(DOCS_DIR);
	const serialized = JSON.stringify(snapshot)
		.replace(/</g, "\\u003c")
		.replace(/\//g, "\\/");
	return html.replace(
		/<script id="snapshot" type="application\/json">[\s\S]*?<\/script>/,
		`<script id="snapshot" type="application/json">${serialized}</script>`,
	);
}

function main(): void {
	const checkOnly = process.argv.includes("--check");
	const mismatches: string[] = [];

	if (fs.existsSync(INDEX_HTML_PATH)) {
		const currentHtml = fs.readFileSync(INDEX_HTML_PATH, "utf8");
		const expectedHtml = buildUpdatedIndexHtml(currentHtml);
		if (checkOnly) {
			if (currentHtml !== expectedHtml) {
				mismatches.push("index.html (embedded #snapshot out of sync with docs/)");
			}
		} else if (currentHtml !== expectedHtml) {
			fs.writeFileSync(INDEX_HTML_PATH, expectedHtml, "utf8");
			console.log("Updated embedded docs/ snapshot in index.html");
		}
	}

	for (const group of SYNC_GROUPS) {
		if (!fs.existsSync(group.canonical)) {
			console.error(`Missing canonical file: ${group.canonical}`);
			process.exit(1);
		}
		const canonicalBytes = fs.readFileSync(group.canonical);

		if (checkOnly) {
			for (const target of group.targets) {
				if (!fs.existsSync(target)) {
					mismatches.push(`${path.relative(REPO_ROOT, target)} (missing)`);
					continue;
				}
				const candidate = fs.readFileSync(target);
				if (!canonicalBytes.equals(candidate)) {
					mismatches.push(`${path.relative(REPO_ROOT, target)} (out of sync)`);
				}
			}
		} else {
			for (const target of group.targets) {
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, canonicalBytes);
				console.log(`Synced ${path.relative(REPO_ROOT, target)}`);
			}
		}
	}

	if (checkOnly) {
		if (mismatches.length > 0) {
			console.error(`sync:check FAILED:\n- ${mismatches.join("\n- ")}`);
			process.exit(1);
		}
		console.log(
			`sync:check PASS (3 identical copies of check-specs.ts + synced spec-view assets)`,
		);
	}
}

main();
