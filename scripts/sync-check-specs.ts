import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_PATH = path.join(REPO_ROOT, "skills", "spec-refactor", "scripts", "check-specs.ts");
const TARGET_PATHS = [
	path.join(REPO_ROOT, "skills", "spec-extract", "scripts", "check-specs.ts"),
	path.join(REPO_ROOT, "skills", "verify-deploy", "scripts", "check-specs.ts"),
];

function main(): void {
	const checkOnly = process.argv.includes("--check");
	if (!fs.existsSync(CANONICAL_PATH)) {
		console.error(`Missing canonical script: ${CANONICAL_PATH}`);
		process.exit(1);
	}
	const canonicalBytes = fs.readFileSync(CANONICAL_PATH);

	if (checkOnly) {
		const mismatches: string[] = [];
		for (const target of TARGET_PATHS) {
			if (!fs.existsSync(target)) {
				mismatches.push(`${path.relative(REPO_ROOT, target)} (missing)`);
				continue;
			}
			const candidate = fs.readFileSync(target);
			if (!canonicalBytes.equals(candidate)) {
				mismatches.push(`${path.relative(REPO_ROOT, target)} (out of sync)`);
			}
		}
		if (mismatches.length > 0) {
			console.error(`sync:check FAILED:\n- ${mismatches.join("\n- ")}`);
			process.exit(1);
		}
		console.log(`sync:check PASS (${TARGET_PATHS.length + 1} identical copies of check-specs.ts)`);
		return;
	}

	for (const target of TARGET_PATHS) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, canonicalBytes);
		console.log(`Synced ${path.relative(REPO_ROOT, target)}`);
	}
}

main();
