import fs from "node:fs";
import path from "node:path";

type PackKind = "standard" | "spec";
type RuleKind = "invariant" | "anti_spec" | "criterion" | "assumption" | "oracle";
type VerdictValue = "pass" | "fail" | "inconclusive" | "waived";
type MutationTier = 0 | 1 | 2;

type OverrideDecl = {
	readonly target: string;
	readonly decision: string;
	readonly summary: string;
};

type ParsedRule = {
	readonly id: string;
	readonly kind: RuleKind;
	readonly modality: string | null;
	readonly statement: string;
	readonly line: number;
};

type ParsedPack = {
	readonly packRef: string;
	readonly relPath: string;
	readonly filePath: string;
	readonly kind: PackKind;
	readonly id: string;
	readonly title: string;
	readonly version: number;
	readonly tier: MutationTier;
	readonly source: string | null;
	readonly status: string | null;
	readonly layer: string | null;
	readonly domain: string | null;
	readonly uses: readonly string[];
	readonly overrides: readonly OverrideDecl[];
	readonly sections: ReadonlySet<string>;
	readonly rules: readonly ParsedRule[];
	readonly body: string;
};

type OracleFixture = {
	readonly relPath: string;
	readonly filePath: string;
	readonly ext: string;
};

type DecisionAuthor = {
	readonly role: string;
	readonly harness?: string;
};

type DecisionComment = {
	readonly author: DecisionAuthor;
	readonly body: string;
};

type DecisionPin = {
	readonly input: string;
	readonly expected: string;
};

type DecisionRecord = {
	readonly id: string;
	readonly date: string;
	readonly status?: string;
	readonly type?: string;
	readonly outcome?: string;
	readonly author: DecisionAuthor;
	readonly packs: readonly string[];
	readonly title: string;
	readonly summary: string;
	readonly resolution: string;
	readonly comments: readonly DecisionComment[];
	readonly rejected?: readonly string[];
	readonly pins?: readonly DecisionPin[];
	readonly anchor?: string;
	readonly historical?: boolean;
};

type EffectiveRule = {
	readonly pack: string;
	readonly packVersion: number;
	readonly tier: MutationTier;
	readonly id: string;
	readonly kind: RuleKind;
	readonly modality: string | null;
	readonly statement: string;
	readonly sourcePack: string;
	readonly sourceVersion: number;
	readonly overriddenBy: string | null;
};

type ValidationIssue = {
	readonly code: string;
	readonly file: string;
	readonly message: string;
};

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_DIR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-z0-9-]+$/;
const RULE_LINE_RE = /^\s*-\s+\*\*\[([^\]]+)\]\*\*(?:\s+\(\*?([^*)]+?)\*?\))?\s*:\s*(.+)$/;
const USES_REF_RE = /^standards\/([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9]\d*)$/;
const OVERRIDE_TARGET_RE =
	/^standards\/([a-z0-9]+(?:-[a-z0-9]+)*)#([a-z0-9]+(?:-[a-z0-9]+)*)$/;

const SECTION_RULE_KINDS: Readonly<Record<string, RuleKind>> = {
	Invariants: "invariant",
	"Anti-Specs": "anti_spec",
	"Acceptance Criteria": "criterion",
	"World Assumptions": "assumption",
	Oracles: "oracle",
	Verification: "oracle",
};

const VALID_V2_DECISION_STATUSES = new Set([
	"decided",
	"accepted_risk",
	"deferred",
	"open",
]);

const VALID_TYPE_OUTCOMES: Readonly<Record<string, readonly string[]>> = {
	choice: ["decided", "intended", "follow_up"],
	possible_bug: ["intended", "fixed", "withdrawn"],
	risk: ["accepted_risk", "follow_up", "withdrawn"],
	question: ["decided", "open"],
};

const OVERRIDE_VALID_STATUSES = new Set(["decided", "accepted_risk", "intended"]);
const VALID_RULE_KINDS = new Set<string>([
	"invariant",
	"anti_spec",
	"criterion",
	"assumption",
	"oracle",
]);
const VALID_DIAGNOSES = new Set(["w_drift", "s_bug", "spec_ambiguity"]);
const VALID_SPEC_STATUSES = new Set(["active", "candidate"]);

function unquoteYamlScalar(raw: string): string {
	const trimmed = raw.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function splitInlineArray(raw: string): string[] {
	const inner = raw.slice(1, -1).trim();
	if (!inner) return [];
	const items: string[] = [];
	let current = "";
	let quote: string | null = null;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i]!;
		if (quote) {
			current += ch;
			if (ch === quote && inner[i - 1] !== "\\") {
				quote = null;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === ",") {
			const val = unquoteYamlScalar(current);
			if (val) items.push(val);
			current = "";
			continue;
		}
		current += ch;
	}
	const tail = unquoteYamlScalar(current);
	if (tail) items.push(tail);
	return items;
}

function stripYamlComment(line: string): string {
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (quote) {
			if (ch === quote && line[i - 1] !== "\\") {
				quote = null;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
			return line.slice(0, i).trimEnd();
		}
	}
	return line;
}

function parseFrontmatter(
	content: string,
	relPath: string,
	issues: ValidationIssue[],
): { meta: Record<string, unknown>; body: string } {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) {
		issues.push({
			code: "FRONTMATTER_MISSING",
			file: relPath,
			message: "Missing YAML frontmatter opening '---' on line 1.",
		});
		return { meta: {}, body: normalized };
	}

	const endIdx = normalized.indexOf("\n---\n", 4);
	const altEndIdx = endIdx === -1 && normalized.endsWith("\n---") ? normalized.length - 4 : endIdx;
	if (altEndIdx === -1) {
		issues.push({
			code: "FRONTMATTER_UNCLOSED",
			file: relPath,
			message: "Unclosed YAML frontmatter block.",
		});
		return { meta: {}, body: normalized };
	}

	const yamlBlock = normalized.slice(4, altEndIdx);
	const body = normalized.slice(altEndIdx + 5).replace(/^\n+/, "");
	const lines = yamlBlock.split("\n");
	const meta: Record<string, unknown> = {};

	let i = 0;
	while (i < lines.length) {
		const rawLine = stripYamlComment(lines[i]!);
		i++;
		if (!rawLine.trim()) continue;

		const keyMatch = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!keyMatch) {
			issues.push({
				code: "FRONTMATTER_SYNTAX",
				file: relPath,
				message: `Invalid YAML frontmatter line: '${rawLine.trim()}'.`,
			});
			continue;
		}

		const key = keyMatch[1]!;
		const rest = keyMatch[2]!.trim();

		if (rest.startsWith("[") && rest.endsWith("]")) {
			meta[key] = splitInlineArray(rest);
			continue;
		}

		if (rest !== "") {
			meta[key] = unquoteYamlScalar(rest);
			continue;
		}

		const listItems: unknown[] = [];
		while (i < lines.length) {
			const nextRaw = stripYamlComment(lines[i]!);
			if (!nextRaw.trim()) {
				i++;
				continue;
			}
			if (!/^\s/.test(nextRaw)) break;

			const itemMatch = nextRaw.match(/^\s+-\s*(.*)$/);
			if (!itemMatch) {
				issues.push({
					code: "FRONTMATTER_SYNTAX",
					file: relPath,
					message: `Unexpected indented line under '${key}': '${nextRaw.trim()}'.`,
				});
				i++;
				continue;
			}

			const itemText = itemMatch[1]!.trim();
			const objMatch = itemText.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
			if (objMatch) {
				const obj: Record<string, string> = {};
				obj[objMatch[1]!] = unquoteYamlScalar(objMatch[2]!);
				i++;
				while (i < lines.length) {
					const subRaw = stripYamlComment(lines[i]!);
					if (!subRaw.trim()) {
						i++;
						continue;
					}
					if (/^\s+-\s*/.test(subRaw) || !/^\s/.test(subRaw)) break;
					const propMatch = subRaw.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
					if (!propMatch) {
						issues.push({
							code: "FRONTMATTER_SYNTAX",
							file: relPath,
							message: `Invalid object property in '${key}': '${subRaw.trim()}'.`,
						});
						i++;
						continue;
					}
					obj[propMatch[1]!] = unquoteYamlScalar(propMatch[2]!);
					i++;
				}
				listItems.push(obj);
			} else {
				listItems.push(unquoteYamlScalar(itemText));
				i++;
			}
		}
		meta[key] = listItems;
	}

	return { meta, body };
}

function parseTierValue(raw: unknown): MutationTier | null {
	if (raw === "0") return 0;
	if (raw === "1") return 1;
	if (raw === "2") return 2;
	return null;
}

function parseMarkdownPack(
	filePath: string,
	relPath: string,
	expectedKind: PackKind,
	expectedDir: string | null,
	issues: ValidationIssue[],
): ParsedPack | null {
	const raw = fs.readFileSync(filePath, "utf8");
	const { meta, body } = parseFrontmatter(raw, relPath, issues);

	const kindRaw = typeof meta.kind === "string" ? meta.kind : "";
	const idRaw = typeof meta.id === "string" ? meta.id : "";
	const titleRaw = typeof meta.title === "string" ? meta.title : "";
	const versionNum =
		typeof meta.version === "string" && /^[1-9]\d*$/.test(meta.version)
			? Number.parseInt(meta.version, 10)
			: Number.NaN;

	if (kindRaw !== expectedKind) {
		issues.push({
			code: "PACK_KIND_MISMATCH",
			file: relPath,
			message: `Expected kind '${expectedKind}', found '${kindRaw || "(missing)"}'.`,
		});
	}
	if (!KEBAB_RE.test(idRaw)) {
		issues.push({
			code: "PACK_ID_INVALID",
			file: relPath,
			message: `Pack 'id' must be kebab-case, found '${idRaw || "(missing)"}'.`,
		});
	} else if (path.basename(filePath, ".md") !== idRaw) {
		issues.push({
			code: "PACK_FILENAME_MISMATCH",
			file: relPath,
			message: `Filename '${path.basename(filePath)}' does not match frontmatter id '${idRaw}'.`,
		});
	}
	if (!titleRaw) {
		issues.push({
			code: "PACK_TITLE_MISSING",
			file: relPath,
			message: "Missing required frontmatter field 'title'.",
		});
	}
	if (!Number.isInteger(versionNum) || versionNum < 1) {
		issues.push({
			code: "PACK_VERSION_INVALID",
			file: relPath,
			message: `Frontmatter 'version' must be a positive integer, found '${String(meta.version ?? "")}'.`,
		});
	}

	let tier: MutationTier = expectedKind === "standard" ? 0 : 1;
	let source: string | null = null;
	let status: string | null = null;
	let layer: string | null = null;
	let domain: string | null = null;
	const uses: string[] = [];
	const overrides: OverrideDecl[] = [];

	if (expectedKind === "standard") {
		if (meta.tier !== undefined) {
			if (meta.tier !== "0") {
				issues.push({
					code: "STANDARD_TIER_INVALID",
					file: relPath,
					message: `Standard pack 'tier' must be '0', found '${String(meta.tier)}'.`,
				});
			}
			tier = 0;
		}
		source = typeof meta.source === "string" && meta.source ? meta.source : null;
		status = typeof meta.status === "string" ? meta.status : null;
		if (!source) {
			issues.push({
				code: "STANDARD_SOURCE_MISSING",
				file: relPath,
				message: "Standard pack requires non-empty frontmatter 'source'.",
			});
		}
		if (status !== "in_force" && status !== "draft") {
			issues.push({
				code: "STANDARD_STATUS_INVALID",
				file: relPath,
				message: `Standard 'status' must be 'in_force' or 'draft', found '${String(meta.status ?? "")}'.`,
			});
		}
	} else {
		if (meta.tier !== undefined) {
			const parsedTier = parseTierValue(meta.tier);
			if (parsedTier === null) {
				issues.push({
					code: "SPEC_TIER_INVALID",
					file: relPath,
					message: `Spec 'tier' must be 0, 1, or 2, found '${String(meta.tier)}'.`,
				});
			} else {
				tier = parsedTier;
			}
		}

		if (meta.status !== undefined) {
			if (typeof meta.status !== "string" || !VALID_SPEC_STATUSES.has(meta.status)) {
				issues.push({
					code: "SPEC_STATUS_INVALID",
					file: relPath,
					message: `Spec 'status' must be 'active' or 'candidate', found '${String(meta.status)}'.`,
				});
			} else {
				status = meta.status;
			}
		} else {
			status = "active";
		}

		domain = typeof meta.domain === "string" ? meta.domain : null;
		layer = typeof meta.layer === "string" ? meta.layer : null;
		const group = domain ?? layer;
		if (!group || !KEBAB_RE.test(group)) {
			issues.push({
				code: "SPEC_LAYER_INVALID",
				file: relPath,
				message: `Spec 'domain' (or 'layer') must be kebab-case, found '${String(group ?? "")}'.`,
			});
		} else {
			if (domain && layer && domain !== layer) {
				issues.push({
					code: "SPEC_LAYER_MISMATCH",
					file: relPath,
					message: `Spec frontmatter 'domain' ('${domain}') does not match 'layer' ('${layer}').`,
				});
			}
			if (expectedDir && group !== expectedDir) {
				issues.push({
					code: "SPEC_LAYER_MISMATCH",
					file: relPath,
					message: `Spec parent directory '${expectedDir}' does not match frontmatter domain/layer '${group}'.`,
				});
			}
		}

		if (meta.uses !== undefined) {
			if (!Array.isArray(meta.uses)) {
				issues.push({
					code: "SPEC_USES_INVALID",
					file: relPath,
					message: "Frontmatter 'uses' must be a list of 'standards/<id>@<version>'.",
				});
			} else {
				for (const item of meta.uses) {
					if (typeof item !== "string" || !USES_REF_RE.test(item)) {
						issues.push({
							code: "SPEC_USES_FORMAT",
							file: relPath,
							message: `Invalid 'uses' reference '${String(item)}'; expected 'standards/<id>@<version>'.`,
						});
					} else {
						uses.push(item);
					}
				}
			}
		}

		if (meta.overrides !== undefined) {
			if (!Array.isArray(meta.overrides)) {
				issues.push({
					code: "SPEC_OVERRIDES_INVALID",
					file: relPath,
					message: "Frontmatter 'overrides' must be a list of { target, decision, summary }.",
				});
			} else {
				for (const entry of meta.overrides) {
					if (!entry || typeof entry !== "object") {
						issues.push({
							code: "OVERRIDE_ENTRY_INVALID",
							file: relPath,
							message: "Each override item must be an object with target, decision, and summary.",
						});
						continue;
					}
					const rec = entry as Record<string, unknown>;
					const target = typeof rec.target === "string" ? rec.target : "";
					const decision = typeof rec.decision === "string" ? rec.decision : "";
					const summary = typeof rec.summary === "string" ? rec.summary : "";
					if (!OVERRIDE_TARGET_RE.test(target) || !decision || !summary) {
						issues.push({
							code: "OVERRIDE_FIELDS_INVALID",
							file: relPath,
							message: `Override entry must specify valid 'target' (standards/<id>#<slug>), 'decision', and 'summary'.`,
						});
						continue;
					}
					overrides.push({ target, decision, summary });
				}
			}
		}
	}

	const sections = new Set<string>();
	const rules: ParsedRule[] = [];
	const bodyLines = body.split("\n");
	let currentSection = "";
	let inFence = false;

	for (let idx = 0; idx < bodyLines.length; idx++) {
		const lineText = bodyLines[idx]!;
		if (/^\s*```/.test(lineText)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const h2Match = lineText.match(/^##\s+(.+?)\s*$/);
		if (h2Match) {
			currentSection = h2Match[1]!.trim();
			sections.add(currentSection);
			continue;
		}

		const sectionRuleKind = SECTION_RULE_KINDS[currentSection];
		if (sectionRuleKind) {
			const ruleMatch = lineText.match(RULE_LINE_RE);
			if (ruleMatch) {
				const slug = ruleMatch[1]!.trim();
				const modality = ruleMatch[2] ? ruleMatch[2].trim() : null;
				const statement = ruleMatch[3]!.trim();
				if (!KEBAB_RE.test(slug)) {
					issues.push({
						code: "RULE_SLUG_INVALID",
						file: relPath,
						message: `Rule slug '[${slug}]' must be kebab-case without numbers-only segments or spaces.`,
					});
				}
				rules.push({
					id: slug,
					kind: sectionRuleKind,
					modality,
					statement,
					line: idx + 1,
				});
			}
		}
	}

	if (!sections.has("Intent") && !sections.has("Scope")) {
		issues.push({
			code: "PACK_SECTION_MISSING",
			file: relPath,
			message: "Pack must contain an '## Intent' or '## Scope' section.",
		});
	}
	if (rules.length === 0) {
		issues.push({
			code: "PACK_RULES_MISSING",
			file: relPath,
			message:
				"Pack must define at least one '- **[slug]**: ...' rule under '## Invariants', '## Anti-Specs', '## Acceptance Criteria', '## World Assumptions', or '## Oracles'.",
		});
	}
	if (!sections.has("Oracles") && !sections.has("Verification")) {
		issues.push({
			code: "PACK_SECTION_MISSING",
			file: relPath,
			message: "Pack must contain an '## Oracles' or '## Verification' section.",
		});
	}

	const groupRef = domain ?? layer ?? expectedDir ?? "unknown";
	const packRef =
		expectedKind === "standard"
			? `standards/${idRaw || path.basename(filePath, ".md")}`
			: `${groupRef}/${idRaw || path.basename(filePath, ".md")}`;

	return {
		packRef,
		relPath,
		filePath,
		kind: expectedKind,
		id: idRaw || path.basename(filePath, ".md"),
		title: titleRaw,
		version: Number.isInteger(versionNum) ? versionNum : 0,
		tier,
		source,
		status,
		layer: groupRef,
		domain,
		uses,
		overrides,
		sections,
		rules,
		body,
	};
}

function listFilesByExt(dirPath: string, exts: readonly string[]): string[] {
	if (!fs.existsSync(dirPath)) return [];
	return fs
		.readdirSync(dirPath, { withFileTypes: true })
		.filter((d) => d.isFile() && exts.some((ext) => d.name.endsWith(ext)))
		.map((d) => d.name)
		.sort();
}

function listSubdirs(dirPath: string): string[] {
	if (!fs.existsSync(dirPath)) return [];
	return fs
		.readdirSync(dirPath, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
}

function resolveDecisionStatus(rec: DecisionRecord): string {
	return rec.status ?? rec.outcome ?? "";
}

function validateDecisions(
	decisionsPath: string,
	allPackRefs: ReadonlySet<string>,
	issues: ValidationIssue[],
): Map<string, DecisionRecord> {
	const byId = new Map<string, DecisionRecord>();
	if (!fs.existsSync(decisionsPath)) {
		issues.push({
			code: "DECISIONS_MISSING",
			file: "docs/decisions.jsonl",
			message: "Missing docs/decisions.jsonl.",
		});
		return byId;
	}

	const lines = fs.readFileSync(decisionsPath, "utf8").replace(/\r\n/g, "\n").split("\n");
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]!.trim();
		if (!raw) continue;
		const lineLabel = `docs/decisions.jsonl:${i + 1}`;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			issues.push({
				code: "DECISION_JSON_INVALID",
				file: lineLabel,
				message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
			});
			continue;
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			issues.push({
				code: "DECISION_SHAPE_INVALID",
				file: lineLabel,
				message: "Decision line must be a JSON object.",
			});
			continue;
		}
		const rec = parsed as Record<string, unknown>;
		const requiredStrings = ["id", "date", "title", "summary", "resolution"];
		let validShape = true;
		for (const field of requiredStrings) {
			if (typeof rec[field] !== "string" || !rec[field]) {
				issues.push({
					code: "DECISION_FIELD_MISSING",
					file: lineLabel,
					message: `Decision requires non-empty string field '${field}'.`,
				});
				validShape = false;
			}
		}
		if (
			!rec.author ||
			typeof rec.author !== "object" ||
			typeof (rec.author as Record<string, unknown>).role !== "string"
		) {
			issues.push({
				code: "DECISION_AUTHOR_INVALID",
				file: lineLabel,
				message: "Decision requires 'author: { role: string }'.",
			});
			validShape = false;
		}
		if (!Array.isArray(rec.packs)) {
			issues.push({
				code: "DECISION_PACKS_INVALID",
				file: lineLabel,
				message: "Decision requires 'packs' array.",
			});
			validShape = false;
		}
		if (!Array.isArray(rec.comments)) {
			issues.push({
				code: "DECISION_COMMENTS_INVALID",
				file: lineLabel,
				message: "Decision requires 'comments' array.",
			});
			validShape = false;
		}
		if (!validShape) continue;

		const id = rec.id as string;
		if (byId.has(id)) {
			issues.push({
				code: "DECISION_DUPLICATE_ID",
				file: lineLabel,
				message: `Duplicate decision id '${id}'.`,
			});
			continue;
		}

		// Validate v2 `status` OR legacy v1 `(type, outcome)`
		if (typeof rec.status === "string" && rec.status) {
			if (!VALID_V2_DECISION_STATUSES.has(rec.status)) {
				issues.push({
					code: "DECISION_STATUS_INVALID",
					file: lineLabel,
					message: `Invalid v2 status '${rec.status}' on decision '${id}'; expected decided, accepted_risk, deferred, or open.`,
				});
			}
		} else if (typeof rec.type === "string" && typeof rec.outcome === "string") {
			const allowedOutcomes = VALID_TYPE_OUTCOMES[rec.type];
			if (!allowedOutcomes || !allowedOutcomes.includes(rec.outcome)) {
				issues.push({
					code: "DECISION_OUTCOME_INVALID",
					file: lineLabel,
					message: `Invalid (type, outcome) pair ('${rec.type}', '${rec.outcome}') on decision '${id}'.`,
				});
			}
		} else {
			issues.push({
				code: "DECISION_STATUS_MISSING",
				file: lineLabel,
				message: `Decision '${id}' requires 'status' (v2) or ('type' and 'outcome') (v1).`,
			});
		}

		if (rec.rejected !== undefined) {
			if (
				!Array.isArray(rec.rejected) ||
				rec.rejected.some((r) => typeof r !== "string" || !r.trim())
			) {
				issues.push({
					code: "DECISION_REJECTED_INVALID",
					file: lineLabel,
					message: `Decision '${id}' field 'rejected' must be an array of non-empty strings.`,
				});
			}
		}

		if (rec.pins !== undefined) {
			const badPin =
				!Array.isArray(rec.pins) ||
				rec.pins.some((p) => {
					if (!p || typeof p !== "object" || Array.isArray(p)) return true;
					const pin = p as Record<string, unknown>;
					return (
						typeof pin.input !== "string" ||
						!pin.input.trim() ||
						typeof pin.expected !== "string" ||
						!pin.expected.trim()
					);
				});
			if (badPin) {
				issues.push({
					code: "DECISION_PINS_INVALID",
					file: lineLabel,
					message: `Decision '${id}' field 'pins' must be an array of { input, expected } with non-empty strings.`,
				});
			}
		}

		const isHistoricalDecision = rec.historical === true;
		for (const p of rec.packs as unknown[]) {
			if (typeof p !== "string" || !p) {
				issues.push({
					code: "DECISION_PACK_REF_INVALID",
					file: lineLabel,
					message: `Decision '${id}' contains invalid pack reference.`,
				});
				continue;
			}
			if (isHistoricalDecision || p.startsWith("historical:")) continue;
			if (!allPackRefs.has(p)) {
				issues.push({
					code: "DECISION_PACK_UNKNOWN",
					file: lineLabel,
					message: `Decision '${id}' references unknown pack '${p}'.`,
				});
			}
		}

		byId.set(id, rec as unknown as DecisionRecord);
	}

	return byId;
}

function validateRuns(runsDir: string, issues: ValidationIssue[]): string[] {
	if (!fs.existsSync(runsDir)) return [];
	const runNames = listSubdirs(runsDir);
	const validVerdicts = new Set(["pass", "fail", "inconclusive", "waived"]);

	for (const name of runNames) {
		const relDir = `docs/runs/${name}`;
		if (!RUN_DIR_RE.test(name)) {
			issues.push({
				code: "RUN_DIR_NAME_INVALID",
				file: relDir,
				message: `Run directory '${name}' must match YYYY-MM-DDTHH-MM-SSZ_<short-sha[-dirty]>.`,
			});
		}
		const runPath = path.join(runsDir, name);
		const summaryPath = path.join(runPath, "summary.md");
		const verdictsPath = path.join(runPath, "verdicts.jsonl");
		if (!fs.existsSync(summaryPath)) {
			issues.push({
				code: "RUN_SUMMARY_MISSING",
				file: `${relDir}/summary.md`,
				message: "Run directory is missing summary.md.",
			});
		}
		if (!fs.existsSync(verdictsPath)) {
			issues.push({
				code: "RUN_VERDICTS_MISSING",
				file: `${relDir}/verdicts.jsonl`,
				message: "Run directory is missing verdicts.jsonl.",
			});
			continue;
		}
		const lines = fs.readFileSync(verdictsPath, "utf8").replace(/\r\n/g, "\n").split("\n");
		let recordCount = 0;
		for (let i = 0; i < lines.length; i++) {
			const raw = lines[i]!.trim();
			if (!raw) continue;
			recordCount++;
			const lineLabel = `${relDir}/verdicts.jsonl:${i + 1}`;
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch (err) {
				issues.push({
					code: "VERDICT_JSON_INVALID",
					file: lineLabel,
					message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
				});
				continue;
			}
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				issues.push({
					code: "VERDICT_SHAPE_INVALID",
					file: lineLabel,
					message: "Verdict line must be a JSON object.",
				});
				continue;
			}
			const rec = parsed as Record<string, unknown>;
			if (
				typeof rec.pack !== "string" ||
				!rec.pack ||
				typeof rec.packVersion !== "number" ||
				!Number.isInteger(rec.packVersion) ||
				rec.packVersion < 1 ||
				typeof rec.id !== "string" ||
				!rec.id ||
				typeof rec.kind !== "string" ||
				!VALID_RULE_KINDS.has(rec.kind) ||
				typeof rec.verdict !== "string" ||
				!validVerdicts.has(rec.verdict) ||
				typeof rec.evidence !== "string" ||
				!rec.evidence ||
				!(rec.proposal === null || typeof rec.proposal === "string") ||
				!(rec.waivedBy === null || typeof rec.waivedBy === "string")
			) {
				issues.push({
					code: "VERDICT_FIELDS_INVALID",
					file: lineLabel,
					message:
						"Verdict requires { pack, packVersion, id, kind, verdict, evidence, proposal, waivedBy }.",
				});
				continue;
			}
			if (
				rec.diagnosis !== undefined &&
				rec.diagnosis !== null &&
				(typeof rec.diagnosis !== "string" || !VALID_DIAGNOSES.has(rec.diagnosis))
			) {
				issues.push({
					code: "VERDICT_DIAGNOSIS_INVALID",
					file: lineLabel,
					message: `Invalid verdict diagnosis '${String(rec.diagnosis)}' for '${rec.id}'; expected w_drift, s_bug, spec_ambiguity, or null.`,
				});
			}
			if (rec.verdict === "waived" && rec.waivedBy !== "person") {
				issues.push({
					code: "WAIVER_AUTHORITY_INVALID",
					file: lineLabel,
					message: `Waived verdict for '${rec.id}' must record waivedBy: 'person'.`,
				});
			}
		}
		if (recordCount === 0) {
			issues.push({
				code: "RUN_VERDICTS_EMPTY",
				file: `${relDir}/verdicts.jsonl`,
				message: "verdicts.jsonl must contain at least one verdict record.",
			});
		}
	}

	return runNames;
}

function validateIndexLinks(
	indexPath: string,
	allPacks: readonly ParsedPack[],
	issues: ValidationIssue[],
): void {
	if (!fs.existsSync(indexPath)) {
		issues.push({
			code: "INDEX_MISSING",
			file: "docs/INDEX.md",
			message: "Missing docs/INDEX.md.",
		});
		return;
	}
	const content = fs.readFileSync(indexPath, "utf8");
	const linkTargets = new Set<string>();
	const linkRe = /\[[^\]]+\]\(([^)#?\s]+)(?:#[^)\s]*)?\)/g;
	for (const match of content.matchAll(linkRe)) {
		const rawTarget = match[1]!.replace(/^\.\//, "");
		linkTargets.add(rawTarget);
	}
	for (const pack of allPacks) {
		const expectedFromDocs = pack.relPath.replace(/^docs\//, "");
		if (!linkTargets.has(expectedFromDocs)) {
			issues.push({
				code: "INDEX_LINK_MISSING",
				file: "docs/INDEX.md",
				message: `docs/INDEX.md must contain a relative Markdown link to '${expectedFromDocs}'.`,
			});
		}
	}
}

function evaluateWorkspace(rootDir: string): {
	readonly ok: boolean;
	readonly rootDir: string;
	readonly standards: readonly ParsedPack[];
	readonly oracles: readonly OracleFixture[];
	readonly specs: readonly ParsedPack[];
	readonly decisions: readonly DecisionRecord[];
	readonly runs: readonly string[];
	readonly effectiveRules: readonly EffectiveRule[];
	readonly issues: readonly ValidationIssue[];
} {
	const issues: ValidationIssue[] = [];
	const docsDir = path.join(rootDir, "docs");
	const indexPath = path.join(docsDir, "INDEX.md");
	const decisionsPath = path.join(docsDir, "decisions.jsonl");
	const standardsDir = path.join(docsDir, "standards");
	const oraclesDir = path.join(docsDir, "oracles");
	const specsDir = path.join(docsDir, "specs");
	const runsDir = path.join(docsDir, "runs");

	if (!fs.existsSync(standardsDir)) {
		issues.push({
			code: "STANDARDS_DIR_MISSING",
			file: "docs/standards",
			message: "Missing docs/standards directory.",
		});
	}
	if (!fs.existsSync(specsDir)) {
		issues.push({
			code: "SPECS_DIR_MISSING",
			file: "docs/specs",
			message: "Missing docs/specs directory.",
		});
	}

	const standards: ParsedPack[] = [];
	for (const fileName of listFilesByExt(standardsDir, [".md"])) {
		const pack = parseMarkdownPack(
			path.join(standardsDir, fileName),
			`docs/standards/${fileName}`,
			"standard",
			null,
			issues,
		);
		if (pack) standards.push(pack);
	}

	const oracles: OracleFixture[] = [];
	for (const fileName of listFilesByExt(oraclesDir, [".json", ".md"])) {
		const full = path.join(oraclesDir, fileName);
		const ext = path.extname(fileName).toLowerCase();
		if (ext === ".json") {
			try {
				JSON.parse(fs.readFileSync(full, "utf8"));
			} catch (err) {
				issues.push({
					code: "ORACLE_JSON_INVALID",
					file: `docs/oracles/${fileName}`,
					message: `Invalid JSON in oracle fixture: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}
		oracles.push({
			relPath: `docs/oracles/${fileName}`,
			filePath: full,
			ext,
		});
	}

	const specs: ParsedPack[] = [];
	for (const groupDir of listSubdirs(specsDir)) {
		const fullGroupDir = path.join(specsDir, groupDir);
		for (const fileName of listFilesByExt(fullGroupDir, [".md"])) {
			const pack = parseMarkdownPack(
				path.join(fullGroupDir, fileName),
				`docs/specs/${groupDir}/${fileName}`,
				"spec",
				groupDir,
				issues,
			);
			if (pack) specs.push(pack);
		}
	}

	const allPacks = [...standards, ...specs];
	const standardsByRef = new Map<string, ParsedPack>();
	for (const std of standards) {
		standardsByRef.set(std.packRef, std);
	}
	const allPackRefs = new Set<string>(allPacks.map((p) => p.packRef));

	const decisionsById = validateDecisions(decisionsPath, allPackRefs, issues);

	const overriddenTargetBySpec = new Map<string, Map<string, string>>();
	const overriddenRuleSlugAllowed = new Map<string, Set<string>>();

	for (const spec of specs) {
		const usedStandardRefs = new Set<string>();
		for (const useRef of spec.uses) {
			const m = useRef.match(USES_REF_RE);
			if (!m) continue;
			const stdRef = `standards/${m[1]!}`;
			const expectedVer = Number.parseInt(m[2]!, 10);
			const stdPack = standardsByRef.get(stdRef);
			if (!stdPack) {
				issues.push({
					code: "STANDARD_NOT_FOUND",
					file: spec.relPath,
					message: `Pack '${spec.packRef}' references missing standard '${stdRef}@${expectedVer}'.`,
				});
				continue;
			}
			usedStandardRefs.add(stdRef);
			if (stdPack.version !== expectedVer) {
				issues.push({
					code: "VERSION_SKEW",
					file: spec.relPath,
					message: `VERSION_SKEW: '${spec.packRef}' uses '${stdRef}@${expectedVer}', but '${stdPack.relPath}' is at version ${stdPack.version}.`,
				});
			}
		}

		const targetMap = new Map<string, string>();
		const allowedRedefine = new Set<string>();

		for (const ov of spec.overrides) {
			const tm = ov.target.match(OVERRIDE_TARGET_RE);
			if (!tm) continue;
			const stdRef = `standards/${tm[1]!}`;
			const ruleSlug = tm[2]!;

			if (!usedStandardRefs.has(stdRef)) {
				issues.push({
					code: "OVERRIDE_UNDECLARED_STANDARD",
					file: spec.relPath,
					message: `Override target '${ov.target}' must reference a standard declared in '${spec.packRef}' uses.`,
				});
			} else {
				const stdPack = standardsByRef.get(stdRef);
				if (stdPack && !stdPack.rules.some((r) => r.id === ruleSlug)) {
					issues.push({
						code: "OVERRIDE_TARGET_UNKNOWN",
						file: spec.relPath,
						message: `Override target '${ov.target}' does not match any rule slug in '${stdPack.relPath}'.`,
					});
				}
			}

			const dec = decisionsById.get(ov.decision);
			if (!dec) {
				issues.push({
					code: "OVERRIDE_DECISION_MISSING",
					file: spec.relPath,
					message: `Override '${ov.target}' cites missing decision '${ov.decision}'.`,
				});
			} else {
				if (dec.author.role !== "person") {
					issues.push({
						code: "OVERRIDE_AUTHORITY_INVALID",
						file: spec.relPath,
						message: `Override '${ov.target}' cites decision '${ov.decision}' authored by '${dec.author.role}'; only 'person'-authored decisions can authorize standard overrides.`,
					});
				}
				const effectiveStatus = resolveDecisionStatus(dec);
				if (!OVERRIDE_VALID_STATUSES.has(effectiveStatus)) {
					issues.push({
						code: "OVERRIDE_OUTCOME_INVALID",
						file: spec.relPath,
						message: `Override '${ov.target}' cites decision '${ov.decision}' with status '${effectiveStatus}'; expected decided or accepted_risk.`,
					});
				}
			}

			targetMap.set(`${stdRef}#${ruleSlug}`, spec.packRef);
			allowedRedefine.add(ruleSlug);
		}

		overriddenTargetBySpec.set(spec.packRef, targetMap);
		overriddenRuleSlugAllowed.set(spec.packRef, allowedRedefine);
	}

	const ruleOwners = new Map<string, ParsedPack[]>();
	for (const pack of allPacks) {
		for (const rule of pack.rules) {
			const list = ruleOwners.get(rule.id) ?? [];
			list.push(pack);
			ruleOwners.set(rule.id, list);
		}
	}

	for (const [slug, owners] of ruleOwners.entries()) {
		if (owners.length <= 1) continue;
		const stdOwners = owners.filter((o) => o.kind === "standard");
		const specOwners = owners.filter((o) => o.kind === "spec");
		const validOverride =
			stdOwners.length === 1 &&
			specOwners.length === 1 &&
			overriddenRuleSlugAllowed.get(specOwners[0]!.packRef)?.has(slug) === true &&
			overriddenTargetBySpec
				.get(specOwners[0]!.packRef)
				?.has(`${stdOwners[0]!.packRef}#${slug}`) === true;

		if (!validOverride) {
			issues.push({
				code: "RULE_SLUG_DUPLICATE",
				file: owners.map((o) => o.relPath).join(", "),
				message: `Duplicate rule slug '[${slug}]' across ${owners.map((o) => o.packRef).join(", ")}.`,
			});
		}
	}

	validateIndexLinks(indexPath, allPacks, issues);
	const runs = validateRuns(runsDir, issues);

	const overriddenStandardRules = new Map<string, string>();
	for (const spec of specs) {
		for (const ov of spec.overrides) {
			overriddenStandardRules.set(ov.target, spec.packRef);
		}
	}

	const effectiveRules: EffectiveRule[] = [];
	for (const std of standards) {
		for (const rule of std.rules) {
			const overrideOwner = overriddenStandardRules.get(`${std.packRef}#${rule.id}`) ?? null;
			if (overrideOwner) continue;
			effectiveRules.push({
				pack: std.packRef,
				packVersion: std.version,
				tier: 0,
				id: rule.id,
				kind: rule.kind,
				modality: rule.modality,
				statement: rule.statement,
				sourcePack: std.packRef,
				sourceVersion: std.version,
				overriddenBy: null,
			});
		}
	}

	for (const spec of specs) {
		for (const rule of spec.rules) {
			const ruleTier: MutationTier =
				rule.kind === "invariant" || rule.kind === "anti_spec"
					? 0
					: rule.kind === "assumption"
						? 2
						: spec.tier;
			effectiveRules.push({
				pack: spec.packRef,
				packVersion: spec.version,
				tier: ruleTier,
				id: rule.id,
				kind: rule.kind,
				modality: rule.modality,
				statement: rule.statement,
				sourcePack: spec.packRef,
				sourceVersion: spec.version,
				overriddenBy: null,
			});
		}
	}

	return {
		ok: issues.length === 0,
		rootDir,
		standards,
		oracles,
		specs,
		decisions: Array.from(decisionsById.values()),
		runs,
		effectiveRules,
		issues,
	};
}

function buildBundle(result: ReturnType<typeof evaluateWorkspace>): string {
	const chunks: string[] = [];
	const indexPath = path.join(result.rootDir, "docs", "INDEX.md");
	chunks.push(fs.readFileSync(indexPath, "utf8").trimEnd());

	chunks.push("\n\n---\n\n# Tier 0 · External Standards (`docs/standards/`)\n");
	for (const std of result.standards) {
		chunks.push(`\n<!-- pack: ${std.packRef}@${std.version} tier=0 (${std.relPath}) -->\n`);
		chunks.push(fs.readFileSync(std.filePath, "utf8").trimEnd());
	}

	if (result.oracles.length > 0) {
		chunks.push("\n\n---\n\n# Tier 0 · Holdout Oracle Fixtures (`docs/oracles/`)\n");
		for (const oracle of result.oracles) {
			chunks.push(`\n<!-- oracle: ${oracle.relPath} -->\n`);
			const content = fs.readFileSync(oracle.filePath, "utf8").trimEnd();
			if (oracle.ext === ".json") {
				chunks.push("```json\n" + content + "\n```");
			} else {
				chunks.push(content);
			}
		}
	}

	chunks.push("\n\n---\n\n# Tier 1 / Tier 2 · Domain Spec Packs (`docs/specs/`)\n");
	for (const spec of result.specs) {
		chunks.push(
			`\n<!-- pack: ${spec.packRef}@${spec.version} tier=${spec.tier} status=${spec.status ?? "active"} (${spec.relPath}) -->\n`,
		);
		chunks.push(fs.readFileSync(spec.filePath, "utf8").trimEnd());
	}

	chunks.push("\n\n---\n\n# Decisions & Rationale Log (`docs/decisions.jsonl`)\n\n");
	chunks.push("| ID | Date | Status | Author | Packs | Title | Rejected Options |\n");
	chunks.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n");
	for (const d of result.decisions) {
		const status = resolveDecisionStatus(d);
		const rejectedCell =
			d.rejected && d.rejected.length > 0 ? d.rejected.join("; ") : "—";
		chunks.push(
			`| **${d.id}** | ${d.date} | \`${status}\` | \`${d.author.role}\` | ${d.packs.map((p) => `\`${p}\``).join(", ")} | ${d.title} | ${rejectedCell} |\n`,
		);
	}

	return chunks.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function initWorkspace(rootDir: string, explicitTitle: string | null, asJson: boolean): void {
	const projectTitle = explicitTitle?.trim() || path.basename(rootDir) || "Project";
	const created: string[] = [];
	const existing: string[] = [];

	const requiredDirs = [
		path.join(rootDir, "docs"),
		path.join(rootDir, "docs", "standards"),
		path.join(rootDir, "docs", "oracles"),
		path.join(rootDir, "docs", "specs"),
		path.join(rootDir, "docs", "runs"),
	];
	for (const dir of requiredDirs) {
		const rel = path.relative(rootDir, dir) || dir;
		if (fs.existsSync(dir)) {
			existing.push(rel);
		} else {
			fs.mkdirSync(dir, { recursive: true });
			created.push(rel);
		}
	}

	const decisionsPath = path.join(rootDir, "docs", "decisions.jsonl");
	if (fs.existsSync(decisionsPath)) {
		existing.push("docs/decisions.jsonl");
	} else {
		fs.writeFileSync(decisionsPath, "", "utf8");
		created.push("docs/decisions.jsonl");
	}

	const indexPath = path.join(rootDir, "docs", "INDEX.md");
	if (fs.existsSync(indexPath)) {
		existing.push("docs/INDEX.md");
	} else {
		const starterIndex = [
			`# ${projectTitle} — Tiered Specifications & Verification Index`,
			"",
			"Tiered specification packs (`docs/specs/`), protected Tier 0 standards (`docs/standards/`), frozen Golden Pin fixtures (`docs/oracles/`), design decisions (`docs/decisions.jsonl`), and immutable verification runs (`docs/runs/`).",
			"",
			"---",
			"",
			"## Glossary (`TERM` — Shared Vocabulary)",
			"",
			"| Term | Surface Meaning & Boundary Units | Owning Domain |",
			"| :--- | :--- | :--- |",
			"| *(add terms)* | *Shared public nouns and units across specs* | — |",
			"",
			"---",
			"",
			"## Tier 0 · Protected External Standards (`docs/standards/`) & Oracles (`docs/oracles/`)",
			"",
			"Slow-clock invariants, anti-specs, and Golden Pin fixtures. Never mutated without `person` ratification and explicit `overrides:` citing a `person`-authored decision.",
			"",
			"---",
			"",
			"## Tier 1 & Tier 2 · Domain Spec Packs (`docs/specs/`)",
			"",
			"Organize local packs under domain directories (`domain: <name>`), tag each pack `tier: 1` (policies/goals) or `tier: 2` (volatile world assumptions `W`), and keep a relative Markdown link here.",
			"",
			"---",
			"",
			"## Ledgers & Immutable Verification Runs",
			"",
			"- [`decisions.jsonl`](./decisions.jsonl) — Append-only rationale log (`decided`, `accepted_risk`, `deferred`, `open`) + `rejected[]` options and `pins[]`.",
			"- [`runs/`](./runs/) — Immutable timestamped verification outputs (`<YYYY-MM-DDTHH-MM-SSZ>_<short-sha[-dirty]>/`).",
			"",
		].join("\n");
		fs.writeFileSync(indexPath, starterIndex, "utf8");
		created.push("docs/INDEX.md");
	}

	if (asJson) {
		console.log(
			JSON.stringify(
				{
					ok: true,
					initialized: true,
					rootDir,
					title: projectTitle,
					created,
					existing,
				},
				null,
				2,
			),
		);
	} else {
		console.log(
			`docs:init PASS (${created.length} created, ${existing.length} existing in ${path.join(rootDir, "docs")})`,
		);
	}
}

function parseCliArgs(argv: readonly string[]): {
	rootDir: string;
	init: boolean;
	title: string | null;
	effective: boolean;
	bundle: boolean;
	json: boolean;
} {
	let rootDir = process.cwd();
	let init = false;
	let title: string | null = null;
	let effective = false;
	let bundle = false;
	let json = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--root") {
			const val = argv[i + 1];
			if (!val) throw new Error("--root requires a directory argument");
			rootDir = path.resolve(val);
			i++;
		} else if (arg === "--init" || arg === "init") {
			init = true;
		} else if (arg === "validate") {
			// Default action
		} else if (arg === "--title") {
			const val = argv[i + 1];
			if (!val) throw new Error("--title requires a string argument");
			title = val;
			i++;
		} else if (arg === "--effective" || arg === "effective") {
			effective = true;
		} else if (arg === "--bundle" || arg === "bundle") {
			bundle = true;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: check-specs.ts [init | validate | effective | bundle] [--root <dir>] [--title <title>] [--json]",
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown option or subcommand: ${arg}`);
		}
	}

	return { rootDir, init, title, effective, bundle, json };
}

function main(): void {
	const args = parseCliArgs(process.argv.slice(2));
	if (args.init) {
		initWorkspace(args.rootDir, args.title, args.json);
		return;
	}
	const res = evaluateWorkspace(args.rootDir);

	if (!res.ok) {
		if (args.json) {
			console.log(
				JSON.stringify(
					{
						ok: false,
						issues: res.issues,
						standardsCount: res.standards.length,
						oraclesCount: res.oracles.length,
						specsCount: res.specs.length,
					},
					null,
					2,
				),
			);
		} else {
			console.error(`Spec check failed with ${res.issues.length} issue(s):`);
			for (const issue of res.issues) {
				console.error(`- [${issue.code}] ${issue.file}: ${issue.message}`);
			}
		}
		process.exit(1);
	}

	if (args.bundle) {
		process.stdout.write(buildBundle(res));
		return;
	}

	if (args.effective) {
		if (args.json) {
			console.log(
				JSON.stringify(
					{
						ok: true,
						standards: res.standards.map((s) => ({
							pack: s.packRef,
							tier: s.tier,
							version: s.version,
							status: s.status,
							source: s.source,
						})),
						oracles: res.oracles.map((o) => o.relPath),
						specs: res.specs.map((s) => ({
							pack: s.packRef,
							domain: s.domain ?? s.layer,
							layer: s.layer,
							tier: s.tier,
							status: s.status,
							version: s.version,
							uses: s.uses,
							overrides: s.overrides,
						})),
						effectiveRules: res.effectiveRules,
						decisionsCount: res.decisions.length,
						runs: res.runs,
					},
					null,
					2,
				),
			);
		} else {
			console.log(
				`Effective rules (${res.effectiveRules.length} active across ${res.standards.length} standards, ${res.specs.length} specs):`,
			);
			for (const rule of res.effectiveRules) {
				const mod = rule.modality ? ` (${rule.modality})` : "";
				console.log(
					`- [Tier ${rule.tier} · ${rule.pack}@${rule.packVersion}] ${rule.id}${mod} [${rule.kind}]: ${rule.statement}`,
				);
			}
		}
		return;
	}

	if (args.json) {
		console.log(
			JSON.stringify(
				{
					ok: true,
					standardsCount: res.standards.length,
					oraclesCount: res.oracles.length,
					specsCount: res.specs.length,
					effectiveRuleCount: res.effectiveRules.length,
					decisionsCount: res.decisions.length,
					runsCount: res.runs.length,
				},
				null,
				2,
			),
		);
	} else {
		console.log(
			`specs:check PASS (${res.standards.length} standards, ${res.oracles.length} oracles, ${res.specs.length} specs, ${res.effectiveRules.length} effective rules, ${res.decisions.length} decisions, ${res.runs.length} runs)`,
		);
	}
}

main();
