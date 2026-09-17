import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

const root = process.cwd();
const sourceRoot = resolve(root, "src");
const entry = resolve(sourceRoot, "main.tsx");
const extensions = [".ts", ".tsx"];

function resolveImport(from, request) {
  if (!request.startsWith(".")) return undefined;
  const base = resolve(dirname(from), request);
  const candidates = extname(base) ? [base] : [...extensions.map((suffix) => `${base}${suffix}`), ...extensions.map((suffix) => resolve(base, `index${suffix}`))];
  return candidates.find((candidate) => existsSync(candidate));
}

function productionGraph() {
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const dependency = resolveImport(file, match[1]);
      if (dependency?.startsWith(sourceRoot)) pending.push(dependency);
    }
  }
  return [...visited].sort();
}

const legacyPatterns = [
  ["dark canvas #061015", /#061015/],
  ["legacy black surface #0A171D", /#0A171D/],
  ["legacy elevated surface #0E2027", /#0E2027/],
  ["neon teal #5DE6D4", /#5DE6D4/],
  ["neon bright teal #8AF5E7", /#8AF5E7/],
  ["legacy teal border #17343A", /#17343A/],
  ["legacy muted text #70817F", /#70817F/],
  ["legacy secondary text #A6B3B1", /#A6B3B1/],
  ["legacy inverse text #F4F7F5", /#F4F7F5/],
  ["deprecated permanent navigation", /\b(?:MobileNavigation|TopNavigation|PrimaryNavigation)\b/],
];

const findings = [];
for (const file of productionGraph()) {
  const source = readFileSync(file, "utf8");
  for (const [label, pattern] of legacyPatterns) {
    source.split("\n").forEach((line, index) => {
      if (pattern.test(line)) findings.push(`${relative(root, file)}:${index + 1} ${label}`);
    });
  }
}

const provider = readFileSync(resolve(sourceRoot, "app/FlowEnvironmentProvider.tsx"), "utf8");
for (const route of ["today", "focus", "weather-outfit", "people", "good-to-know", "capture", "outcomes"]) {
  if (!provider.includes(`\"${route}\"`)) findings.push(`canonical route is absent: ${route}`);
}
const matchers = readFileSync(resolve(sourceRoot, "shared/command/globalMatchers.ts"), "utf8");
if (matchers.includes("navigationPatterns")) findings.push("legacy enumerated navigationPatterns table remains");
const auditPath = resolve(root, "docs/FLOW_REVAMP_AUDIT.md");
if (!existsSync(auditPath)) findings.push("docs/FLOW_REVAMP_AUDIT.md is absent");
const designQaPath = resolve(root, "docs/quality/design-qa.md");
if (!existsSync(designQaPath) || readFileSync(designQaPath, "utf8").trim().split("\n").at(-1) !== "final result: passed") findings.push("docs/quality/design-qa.md does not end with exact `final result: passed`");

if (findings.length) {
  console.error("FLOW DESIGN MIGRATION: FAIL");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log(`FLOW DESIGN MIGRATION: PASS (${productionGraph().length} reachable production modules audited)`);
}
