import {
  collectForbiddenTemplateFragments,
  repairAgreementTemplatePlaceholders,
} from "../agreementTemplatePlaceholderSafety";
import { validatePremiumAgreementStructure } from "../premiumAgreementStructure";
import type { ProCompletenessContext, ProStructuralIssue } from "./types";
import { scrubVisiblePlaceholderLexemes } from "./familyFallbackLanguage";
import { applyVisibleBodyQualityGate } from "../visibleBodyQualityGate";

const NUMBERED_HEADING_RE = /^\s*(\d+(?:\.\d+)*)\s+(.+?)\s*\.?\s*$/;
const SUBSTANTIVE_MIN_CHARS = 42;
const HEADING_ONLY_LINE_RE = /^\s*(\d+(?:\.\d+)*)\s+([A-Za-z][^.]{2,72})\.\s*$/;
const MARKDOWN_PIPE_TABLE_RE = /^\s*\|.+\|.+\|/m;
const MARKDOWN_RULE_RE = /^\s*[-*_]{3,}\s*$/m;
const RAW_MD_LIST_RE = /^\s*[-*]\s+\*\*[^*]+\*\*/m;
const DRAFTING_STUB_RE =
  /\b(?:needs\s+details|complete\s+in\s+review|unspecified\s+commercial|scaffold|template\s+variable)\b/i;

export function scrubMarkdownArtifacts(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (MARKDOWN_PIPE_TABLE_RE.test(line) || /^\s*\|[-:| ]+\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && line.trim() === "") {
      inTable = false;
      repairs.push("markdown_table→prose");
      out.push(
        "The commercial schedule below will be confirmed in writing before execution (see Ask LawDog to revise).",
      );
      continue;
    }
    if (inTable) continue;
    if (MARKDOWN_RULE_RE.test(line)) {
      repairs.push("markdown_rule_removed");
      continue;
    }
    if (RAW_MD_LIST_RE.test(line)) {
      repairs.push("markdown_bold_list_flattened");
      out.push(line.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, ""));
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

export function detectHeadingOnlyClauses(text: string): ProStructuralIssue[] {
  const issues: ProStructuralIssue[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!HEADING_ONLY_LINE_RE.test(line)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = (lines[j] || "").trim();
    if (NUMBERED_HEADING_RE.test(next)) {
      issues.push({
        code: "empty_clause",
        message: `Heading-only clause followed by another heading: "${line}"`,
        catastrophic: false,
      });
      continue;
    }
    const body = next.replace(NUMBERED_HEADING_RE, "").trim();
    if (!body || body.length < SUBSTANTIVE_MIN_CHARS) {
      issues.push({
        code: "empty_clause",
        message: `Insufficient body under heading: "${line}"`,
        catastrophic: false,
      });
    }
  }
  return issues;
}

export function detectPlaceholderLeakage(
  text: string,
  ctx?: Pick<ProCompletenessContext, "intakeRaw" | "partyNames">,
): ProStructuralIssue[] {
  const issues: ProStructuralIssue[] = [];
  const forbidden = collectForbiddenTemplateFragments(text, ctx?.intakeRaw, {
    partyNames: ctx?.partyNames ? [...ctx.partyNames] : undefined,
  });
  for (const f of forbidden.slice(0, 12)) {
    issues.push({
      code: "placeholder_leak",
      message: `Forbidden template fragment: ${f}`,
      catastrophic: false,
    });
  }
  if (DRAFTING_STUB_RE.test(text)) {
    issues.push({
      code: "drafting_stub",
      message: "Internal drafting stub language in visible body",
      catastrophic: false,
    });
  }
  return issues;
}

export function detectStructuralNumberingIssues(text: string): ProStructuralIssue[] {
  const issues: ProStructuralIssue[] = [];
  const majors = [...text.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)].map((m) => parseInt(m[1], 10));
  const uniq = [...new Set(majors)].sort((a, b) => a - b);
  if (uniq.length >= 3) {
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] - uniq[i - 1] > 1) {
        issues.push({
          code: "numbering_gap",
          message: `Major section gap ${uniq[i - 1]} → ${uniq[i]}`,
          catastrophic: false,
        });
        break;
      }
    }
  }
  const dup = new Set<number>();
  for (const n of majors) {
    if (dup.has(n)) {
      issues.push({ code: "duplicate_numbering", message: `Duplicate major section ${n}`, catastrophic: false });
      break;
    }
    dup.add(n);
  }
  return issues;
}

export function detectSpliceContamination(text: string): ProStructuralIssue[] {
  const issues: ProStructuralIssue[] = [];
  if (
    /\bdesignated operational contacts through designated operational contacts\b/i.test(text) ||
    /\bThe Parties shall perform their obligations in good faith[\s\S]{0,200}The Parties shall perform their obligations in good faith\b/i.test(
      text,
    )
  ) {
    issues.push({ code: "duplicate_boilerplate", message: "Repeated boilerplate paragraph", catastrophic: false });
  }
  if (/\blimitation of liability\b[\s\S]{0,400}\b(?:security|audit|data protection)\b/i.test(text)) {
    const secIdx = text.search(/\b(?:security|audit)\b/i);
    const limIdx = text.search(/\blimitation of liability\b/i);
    if (secIdx >= 0 && limIdx >= 0 && Math.abs(secIdx - limIdx) < 500) {
      issues.push({
        code: "clause_splice",
        message: "Limitation language adjacent to security/audit section",
        catastrophic: false,
      });
    }
  }
  return issues;
}

export function normalizeProStructuralBody(
  text: string,
  ctx: ProCompletenessContext,
): { text: string; repairs: string[]; issues: ProStructuralIssue[] } {
  const repairs: string[] = [];
  let working = (text || "").trim();
  const issues: ProStructuralIssue[] = [];

  const visible = applyVisibleBodyQualityGate(working, ctx);
  working = visible.text;
  repairs.push(...visible.repairs);

  const md = scrubMarkdownArtifacts(working);
  working = md.text;
  repairs.push(...md.repairs);

  const scrub = scrubVisiblePlaceholderLexemes(working);
  working = scrub.text;
  repairs.push(...scrub.repairs);

  const ph = repairAgreementTemplatePlaceholders(working, {
    intakeRaw: ctx.intakeRaw,
    partyNames: ctx.partyNames,
  });
  working = ph.text;
  repairs.push(...ph.repaired);

  const structure = validatePremiumAgreementStructure(working);
  working = structure.text;
  repairs.push(...structure.repairs);
  for (const i of structure.issues) {
    issues.push({
      code: i.code,
      message: i.message,
      repaired: i.repaired,
      catastrophic: i.code === "empty_subsection" && !i.repaired,
    });
  }

  issues.push(...detectHeadingOnlyClauses(working));
  issues.push(...detectPlaceholderLeakage(working, ctx));
  issues.push(...detectStructuralNumberingIssues(working));
  issues.push(...detectSpliceContamination(working));

  return { text: working, repairs, issues };
}

export function isCatastrophicStructuralFailure(args: {
  text: string;
  issues: readonly ProStructuralIssue[];
  partyNames?: readonly string[];
}): boolean {
  const len = (args.text || "").trim().length;
  if (len < 200) return true;
  if (len < 2000 && args.issues.some((i) => i.catastrophic && !i.repaired)) return true;
  const parties = (args.partyNames || []).filter((n) => (n || "").trim().length > 2);
  if (args.partyNames && args.partyNames.length > 0 && parties.length < 2 && len < 5000) {
    return true;
  }
  const fatalPlaceholders = args.issues.filter((i) => i.code === "placeholder_leak" && !i.repaired);
  if (fatalPlaceholders.length > 2) return true;
  if (args.issues.some((i) => i.catastrophic && !i.repaired)) return true;
  return false;
}
