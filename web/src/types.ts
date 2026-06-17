/** The audit report shape returned by the Blacklight worker (POST /audit). */

export type Category = "security" | "correctness" | "best-practice";
export type Severity = "error" | "warning" | "info";

export interface RuleMeta {
  id: string;
  title: string;
  category: Category;
  tier: "merge-worthy" | "report-only";
  fixKind: "deterministic" | "guidance";
  remediation: string;
  authority?: { name: string; url: string }[];
}

export interface Finding {
  checkId: string;
  severity: Severity;
  message: string;
  file: string;
  entity?: string;
  lexicon: string;
  meta: RuleMeta;
}

export interface QuickWinFile {
  file: string;
  diff?: string;
  addressed: RuleMeta[];
  needsInput: Finding[];
}

export interface GuidanceCluster {
  name: string;
  url?: string;
  rules: { meta: RuleMeta; findings: Finding[] }[];
}

export interface Counts {
  total: number;
  quickWin: number;
  needsReview: number;
  reportOnly: number;
  errors: number;
  warnings: number;
  infos: number;
  security: number;
  correctness: number;
  bestPractice: number;
}

export interface Report {
  target: string;
  scanned: number;
  counts: Counts;
  quickWins: QuickWinFile[];
  needsReview: GuidanceCluster[];
  reportOnly: Finding[];
}

/** Link from a rule id to its reference entry (same scheme the CLI report uses). */
export const ruleDocUrl = (id: string): string =>
  `https://intentius.io/chant/lint-rules/audit-rules/#${id.toLowerCase()}`;
