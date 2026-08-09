/**
 * Frozen-pin alarm (#20). Every @intentius/* dep sat at ^0.13.1 for ~31 minors
 * because 0.x carets never cross a minor and nothing said so. This compares
 * the installed versions (package-lock) against npm latest and prints a
 * Markdown issue body when they diverge — nothing when current. The pins
 * workflow turns that into a single tracking issue.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const names = Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith("@intentius/"));
const rows = [];
for (const name of names) {
  const installed = lock.packages?.[`node_modules/${name}`]?.version ?? "(not installed)";
  const latest = execFileSync("npm", ["view", name, "version"], { encoding: "utf8" }).trim();
  if (installed !== latest) rows.push({ name, installed, latest });
}

if (rows.length === 0) process.exit(0);

const lines = [
  "Installed `@intentius/*` packages are behind npm latest. Under 0.x semver a",
  "caret never crosses a minor, so nothing moves these without a range bump.",
  "",
  "| package | installed | npm latest |",
  "| --- | --- | --- |",
  ...rows.map((r) => `| ${r.name} | ${r.installed} | ${r.latest} |`),
  "",
  "Core and the lexicons move in lockstep — bump the ranges together and adapt",
  "to whatever moved in the audit surface (see #17 / #18 for the previous pass).",
  "",
  "_Maintained by the weekly `pins` workflow: it updates this issue in place and closes it when the deps catch up._",
];
console.log(lines.join("\n"));
