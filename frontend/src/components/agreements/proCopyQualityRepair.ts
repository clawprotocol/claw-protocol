import { postPremiumRefine, type PremiumRefineResponse } from "./premiumRefineApi";
import {
  repairProFullAgreementCandidateSurgically,
  validateProAgreementConfidenceGate,
  validateProFullAgreementCandidate,
  type ProFullAgreementCandidateValidationContext,
} from "./proFullAgreementCandidate";

export type ProCopyQualityDefectCode =
  | "unresolved_semantic_token"
  | "dangling_conjunction"
  | "empty_heading"
  | "orphan_schedule_a_reference"
  | "repeated_scope_bullet"
  | "placeholder_commercial_phrase"
  | "malformed_termination_phrase"
  | "confidentiality_outside_section"
  | "generic_applicable_party"
  | "duplicate_clause";

export type ProCopyQualityDefect = {
  code: ProCopyQualityDefectCode;
  evidence: string;
};

export type ProCopyRepairClient = (args: {
  current_document_text: string;
  intake_text: string;
  user_refinement_prompt: string;
  action: "update";
  surgical_preserve_retry: true;
}) => Promise<Pick<PremiumRefineResponse, "updated_document_text" | "summary_changes" | "readiness_score" | "suggested_next_step">>;

export type ProCopyRepairResult = {
  text: string;
  source: "none" | "openai" | "deterministic";
  defects: ProCopyQualityDefect[];
  repairs: string[];
  rejectedReasons: string[];
};

const HEADING_RE = /^\s*(\d+(?:\.\d+)*)\.?\s+(.+?)\.?\s*$/;
const SCHEDULE_A_RE = /\bSchedule\s+A\b/i;
const SCHEDULE_A_HEADER_RE = /^\s*SCHEDULE\s+A\b/im;
const PLACEHOLDER_COMMERCIAL_RE =
  /\b(?:total\s+project\s+fee\s+of\s+total\s+fee|total\s+fee|commercial terms include|amount to be confirmed|fees? to be confirmed|payment terms? to be confirmed)\b/gi;
const GENERIC_APPLICABLE_RE = /\b(?:applicable Party|applicable deliverables|applicable Party retained materials)\b/i;
const MALFORMED_TERMINATION_RE = /\b\d{1,3}\s*-\s*day\s+termination\b/i;

function compact(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function push(defects: ProCopyQualityDefect[], code: ProCopyQualityDefectCode, evidence: string): void {
  const clean = evidence.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!clean) return;
  if (defects.some((d) => d.code === code && d.evidence === clean)) return;
  defects.push({ code, evidence: clean });
}

function isSectionHeading(line: string): boolean {
  return HEADING_RE.test(line.trim());
}

function detectEmptyHeadings(text: string, defects: ProCopyQualityDefect[]): void {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!isSectionHeading(line)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    if (!next || isSectionHeading(next) || /^IN WITNESS WHEREOF\b/i.test(next)) {
      push(defects, "empty_heading", line);
    }
  }
}

function sectionTitleForLine(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = lines[i].trim().match(HEADING_RE);
    if (m) return m[2].toLowerCase();
  }
  return "";
}

function detectRepeatedScopeBullets(text: string, defects: ProCopyQualityDefect[]): void {
  const lines = text.split("\n");
  const seen = new Map<string, { line: string; section: string }>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!/^[-*•]\s+/.test(line)) continue;
    if (!/\b(?:workflow|dashboard|automation|onboarding|maintenance|support|implementation|configuration)\b/i.test(line)) {
      continue;
    }
    const key = line.toLowerCase().replace(/^[-*•]\s+/, "").replace(/\s+/g, " ").trim();
    const section = sectionTitleForLine(lines, i);
    const prior = seen.get(key);
    if (prior && !/purpose|scope|services/.test(section)) {
      push(defects, "repeated_scope_bullet", line);
    } else if (!prior) {
      seen.set(key, { line, section });
    }
  }
}

function detectConfidentialityOutsideSection(text: string, defects: ProCopyQualityDefect[]): void {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!/\bconfidential(?:ity| information)\b/i.test(line)) continue;
    const section = sectionTitleForLine(lines, i);
    if (section && !/confidential/.test(section) && !isSectionHeading(line)) {
      push(defects, "confidentiality_outside_section", line);
    }
  }
}

function detectDuplicateClauses(text: string, defects: ProCopyQualityDefect[]): void {
  const seen = new Set<string>();
  for (const block of text.split(/\n{2,}/)) {
    const normalized = block.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized.length < 100) continue;
    if (/^in witness whereof\b/i.test(normalized)) continue;
    if (seen.has(normalized)) push(defects, "duplicate_clause", block);
    seen.add(normalized);
  }
}

export function validateProCopyQuality(text: string): ProCopyQualityDefect[] {
  const body = compact(text || "");
  const defects: ProCopyQualityDefect[] = [];
  for (const match of body.matchAll(PLACEHOLDER_COMMERCIAL_RE)) {
    push(defects, "placeholder_commercial_phrase", match[0]);
  }
  if (/\btotal\s+(?:project\s+)?fee\b/i.test(body) && /\bof\s+total\s+fee\b/i.test(body)) {
    push(defects, "unresolved_semantic_token", "total project fee of total fee");
  }
  for (const line of body.split("\n")) {
    if (/^\s*(?:[-*•]\s*)?(?:and|or)\s*[,.;:]?\s*$/i.test(line)) {
      push(defects, "dangling_conjunction", line);
    }
    if (GENERIC_APPLICABLE_RE.test(line)) push(defects, "generic_applicable_party", line);
    if (MALFORMED_TERMINATION_RE.test(line)) push(defects, "malformed_termination_phrase", line);
  }
  if (SCHEDULE_A_RE.test(body) && !SCHEDULE_A_HEADER_RE.test(body)) {
    push(defects, "orphan_schedule_a_reference", "Schedule A referenced but no Schedule A exists");
  }
  detectEmptyHeadings(body, defects);
  detectRepeatedScopeBullets(body, defects);
  detectConfidentialityOutsideSection(body, defects);
  detectDuplicateClauses(body, defects);
  return defects;
}

function extractFirst(text: string, re: RegExp): string | null {
  return text.match(re)?.[0] ?? null;
}

function repairedPreservesCriticalFacts(original: string, repaired: string, parties: readonly string[]): string[] {
  const defects: string[] = [];
  for (const party of parties.filter(Boolean)) {
    if (!repaired.toLowerCase().includes(party.toLowerCase())) defects.push(`party_missing:${party}`);
  }
  const checks: readonly [string, RegExp][] = [
    ["payment_amount", /\$[\d,]+(?:\.\d{2})?/],
    ["milestone_allocation", /\b\d{1,3}\s*%\b[\s\S]{0,160}\b\d{1,3}\s*%\b/],
    ["governing_law", /\b(?:Oklahoma|Texas|Delaware|California|New York)\s+law\b/i],
  ];
  for (const [id, re] of checks) {
    const originalValue = extractFirst(original, re);
    if (!originalValue) continue;
    const repairedValue = extractFirst(repaired, re);
    if (!repairedValue || originalValue.toLowerCase() !== repairedValue.toLowerCase()) defects.push(`fact_changed:${id}`);
  }
  return defects;
}

export function buildProCopyRepairPrompt(defects: readonly ProCopyQualityDefect[]): string {
  return [
    "Repair ONLY the listed copy defects in the full Pro agreement.",
    "Return the complete corrected agreement, not a summary or partial patch.",
    "Preserve all valid business/legal content.",
    "Do not add Schedule A unless the original user intake asks for Schedule A.",
    "Do not change party names, economics, governing law, payment allocation, or signature block except to repair listed defects.",
    "",
    "Defects:",
    ...defects.map((d, index) => `${index + 1}. ${d.code}: ${d.evidence}`),
  ].join("\n");
}

export function logProCopyQualityDefects(defects: readonly ProCopyQualityDefect[], surface?: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-copy-quality-defects]", { surface, defects });
}

export function logProCopyRepairRequested(defects: readonly ProCopyQualityDefect[], surface?: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-copy-repair-requested]", { surface, defectCount: defects.length });
}

export function logProCopyRepairAccepted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-copy-repair-accepted]", payload);
}

export function logProCopyRepairRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-copy-repair-rejected]", payload);
}

export function logProCopyRepairFallback(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-copy-repair-fallback]", payload);
}

export async function repairProCopyQualityWithOpenAI(args: {
  text: string;
  intakeText: string;
  context?: ProFullAgreementCandidateValidationContext;
  surface?: string;
  repairClient?: ProCopyRepairClient;
}): Promise<ProCopyRepairResult> {
  const original = compact(args.text || "");
  const defects = validateProCopyQuality(original);
  if (!defects.length) return { text: original, source: "none", defects, repairs: [], rejectedReasons: [] };

  logProCopyQualityDefects(defects, args.surface);
  const client: ProCopyRepairClient =
    args.repairClient ??
    ((body) => postPremiumRefine(body));
  const prompt = buildProCopyRepairPrompt(defects);

  try {
    logProCopyRepairRequested(defects, args.surface);
    const response = await client({
      current_document_text: original,
      intake_text: args.intakeText,
      user_refinement_prompt: prompt,
      action: "update",
      surgical_preserve_retry: true,
    });
    const repaired = compact(response.updated_document_text || "");
    const remainingDefects = validateProCopyQuality(repaired);
    const preservationDefects = repairedPreservesCriticalFacts(
      original,
      repaired,
      args.context?.canonicalPartyNames ?? [],
    );
    const candidate = validateProFullAgreementCandidate(repaired, args.context);
    const confidence = validateProAgreementConfidenceGate(repaired, args.context);
    const rejectedReasons = [
      ...remainingDefects.map((d) => `remaining:${d.code}`),
      ...preservationDefects,
      ...candidate.defects.map((d) => `candidate:${d}`),
      ...(confidence.ok ? [] : confidence.defects.map((d) => `confidence:${d}`)),
    ];
    if (repaired && rejectedReasons.length === 0) {
      logProCopyRepairAccepted({ surface: args.surface, defectCount: defects.length, len: repaired.length });
      return {
        text: repaired,
        source: "openai",
        defects,
        repairs: defects.map((d) => `openai_copy_repair:${d.code}`),
        rejectedReasons: [],
      };
    }
    logProCopyRepairRejected({ surface: args.surface, rejectedReasons });
  } catch (err) {
    logProCopyRepairRejected({ surface: args.surface, error: err instanceof Error ? err.message : String(err) });
  }

  const deterministic = repairProFullAgreementCandidateSurgically(original, args.context);
  if (deterministic.repairs.length > 0) {
    logProCopyRepairFallback({ surface: args.surface, repairs: deterministic.repairs });
    const remaining = validateProCopyQuality(deterministic.text);
    return {
      text: deterministic.text,
      source: "deterministic",
      defects,
      repairs: deterministic.repairs.map((r) => `deterministic_copy_repair:${r}`),
      rejectedReasons: remaining.map((d) => `remaining:${d.code}`),
    };
  }
  return {
    text: original,
    source: "none",
    defects,
    repairs: [],
    rejectedReasons: defects.map((d) => `unrepaired:${d.code}`),
  };
}
