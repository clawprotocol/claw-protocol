/**
 * Deterministic guided Q&A semantic fact reconciliation — replaces conflicting corpus
 * fragments instead of appending raw pill labels as agreement lines.
 */

import type { GuidedCompletionSession } from "./types";
import { listGuidedAnsweredVariableIds } from "./guidedAnswerApplyOrchestration";
import { repairBareProSkeletonClauses } from "../proCorpusSkeletonSafety";
import { dedupeRepeatingSentenceLines } from "./guidedCorpusLineRepairs";

export type GuidedSemanticFactKey =
  | "payment_timing"
  | "payment_structure"
  | "milestone_allocation"
  | "monthly_fee"
  | "total_project_fee"
  | "support_sla"
  | "ownership"
  | "background_tools_license"
  | "termination_notice"
  | "governing_law";

export type GuidedSemanticFacts = {
  facts: Partial<Record<GuidedSemanticFactKey, string>>;
  paymentMode: "milestone_project" | "monthly_retainer" | "hybrid" | "unknown";
  milestoneSplit: "40_30_30" | "even_thirds" | "build_heavy" | "custom" | null;
  terminationDays: number | null;
  governingLaw: string | null;
};

const RAW_ANSWER_LABEL_LINE_RES: readonly RegExp[] = [
  /^\s*Milestone[-\s]?based\.?\s*$/i,
  /^\s*Monthly\s+retainer\.?\s*$/i,
  /^\s*Net\s*30\.?\s*$/i,
  /^\s*Net\s*15\.?\s*$/i,
  /^\s*Delaware\.?\s*$/i,
  /^\s*Texas\.?\s*$/i,
  /^\s*Oklahoma\.?\s*$/i,
  /^\s*Company\s+owns\s+project\s+deliverables\.?\s*$/i,
  /^\s*30\s+days?\s+notice\.?\s*$/i,
  /^\s*15\s+days?\s+notice\.?\s*$/i,
  /^\s*Build[-\s]?heavy\.?\s*$/i,
  /^\s*Even\s+thirds\.?\s*$/i,
  /^\s*As\s+specified\s+in\s+Schedule\s+A\.?\s*$/i,
];

const ORPHAN_BOILERPLATE_LINE_RES: readonly RegExp[] = [
  /^\s*Contractor\s+represents\s+that\s+it\s+has\s+authority\b/i,
  /^\s*Except\s+as\s+expressly\s+stated,\s+neither\s+Party\s+is\s+liable\b/i,
  /^\s*Neither\s+party\s+shall\s+be\s+liable\s+for\s+indirect\b/i,
  /^\s*Provider\s+shall\s+invoice\s+Client\s+within\s+fifteen\s*\(15\)\s+days\s+of\s+milestone\s+acceptance\b/i,
];

const CONFLICTING_PAYMENT_LINE_RES: Readonly<
  Record<NonNullable<GuidedSemanticFacts["milestoneSplit"]>, readonly RegExp[]>
> = {
  "40_30_30": [/\bbuild-heavy\b/i, /\beven\s+thirds\b/i, /\bsplits?\s+evenly\b/i, /\bone-third\s+each\b/i],
  even_thirds: [/\bbuild-heavy\b/i, /\b40\s*%[\s\S]{0,40}30\s*%/i],
  build_heavy: [/\beven\s+thirds\b/i, /\b40\s*%[\s\S]{0,40}30\s*%/i],
  custom: [],
};

const MILESTONE_LANGUAGE_RE =
  /\b(?:milestone|written\s+acceptance\s+of\s+each\s+phase|schedule\s+a\s+phase\s+allocation|build-heavy|even\s+thirds|one-third\s+each)\b/i;

const GOVERNING_LAW_IN_FEES_RE =
  /\b(?:governing\s+law|laws?\s+of\s+(?:the\s+State\s+of\s+)?(?:Delaware|Texas|Oklahoma|New York|California))\b/i;

function normAnswer(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function lastAnswerForKeys(session: GuidedCompletionSession, keys: readonly string[]): string {
  for (let i = keys.length - 1; i >= 0; i--) {
    const a = normAnswer(session.answered[keys[i]!] ?? "");
    if (a) return a;
  }
  return "";
}

function parseTerminationDays(text: string): number | null {
  const t = normAnswer(text);
  if (!t) return null;
  const m = t.match(/\b(\d{1,3})\s+days?\b/i);
  if (m) return Number(m[1]);
  if (/\bthirty\b/i.test(t)) return 30;
  if (/\bfifteen\b/i.test(t)) return 15;
  if (/\bsixty\b/i.test(t)) return 60;
  return null;
}

function parseGoverningLaw(text: string, intake: string): string | null {
  const blob = `${text}\n${intake}`;
  const m =
    blob.match(/\b(?:laws?\s+of\s+(?:the\s+State\s+of\s+)?)(Delaware|Texas|Oklahoma|New York|California)\b/i) ??
    blob.match(/\b(Delaware|Texas|Oklahoma)\s+law\b/i);
  return m ? m[1] : null;
}

function detectMilestoneSplit(answer: string, intake: string): GuidedSemanticFacts["milestoneSplit"] {
  const blob = `${answer}\n${intake}`;
  if (/40\s*%|40%\s*build|40\s*\/\s*30\s*\/\s*30|forty.{0,20}thirty.{0,20}thirty/i.test(blob)) return "40_30_30";
  if (/even\s+thirds|one-third\s+each|thirds\s+across\s+build/i.test(blob)) return "even_thirds";
  if (/build[-\s]?heavy/i.test(blob)) return "build_heavy";
  if (/milestone|phase\s+allocation|schedule\s+a/i.test(blob)) return "custom";
  return null;
}

function detectPaymentMode(
  session: GuidedCompletionSession,
  intake: string,
): GuidedSemanticFacts["paymentMode"] {
  const blob = [
    intake,
    ...listGuidedAnsweredVariableIds(session).map((id) => session.answered[id] ?? ""),
  ].join("\n");
  const monthly =
    /\$[\d,]+(?:\.\d{2})?\s*(?:per\s+)?month|month[-\s]?to[-\s]?month|monthly\s+(?:fee|retainer|service\s+fee)/i.test(blob);
  const milestone =
    /\$120[,\s]?000|milestone|40\s*%|phase\s+allocation|schedule\s+a|build-heavy|even\s+thirds|\$18[,\s]?000/i.test(
      blob,
    );
  if (monthly && !milestone) return "monthly_retainer";
  if (milestone && !monthly) return "milestone_project";
  if (monthly && milestone) {
    const monthlyAnswer = lastAnswerForKeys(session, ["payment_structure", "project_fee_phase_confirmation"]);
    if (/monthly|retainer|per\s+month/i.test(monthlyAnswer)) return "monthly_retainer";
    return "milestone_project";
  }
  return "unknown";
}

/** Map guided session + intake to canonical semantic facts (latest answer wins per key). */
export function extractGuidedSemanticFacts(
  session: GuidedCompletionSession | null | undefined,
  intakeRaw = "",
): GuidedSemanticFacts {
  const facts: Partial<Record<GuidedSemanticFactKey, string>> = {};
  const intake = normAnswer(intakeRaw);
  if (!session) {
    return {
      facts,
      paymentMode: /\$[\d,]+(?:\.\d{2})?\s*(?:per\s+)?month|month[-\s]?to[-\s]?month/i.test(intake)
        ? "monthly_retainer"
        : /\bmilestone|40\s*%|schedule\s+a/i.test(intake)
          ? "milestone_project"
          : "unknown",
      milestoneSplit: detectMilestoneSplit("", intake),
      terminationDays: parseTerminationDays(intake),
      governingLaw: parseGoverningLaw("", intake),
    };
  }

  const ids = listGuidedAnsweredVariableIds(session);
  for (const id of ids) {
    const answer = normAnswer(session.answered[id]);
    if (!answer) continue;
    if (/payment_timing|payment_structure|invoice/i.test(id)) facts.payment_timing = answer;
    if (/phase_payment|milestone|schedule|project_fee|total_fee|amount/i.test(id)) {
      facts.milestone_allocation = answer;
      facts.payment_structure = answer;
    }
    if (/monthly|retainer/i.test(id)) facts.monthly_fee = answer;
    if (/saas_sla|support|sla/i.test(id)) facts.support_sla = answer;
    if (/ip_ownership|ownership/i.test(id)) facts.ownership = answer;
    if (/license|background/i.test(id)) facts.background_tools_license = answer;
    if (/renewal|termination|notice/i.test(id)) facts.termination_notice = answer;
    if (/governing|jurisdiction/i.test(id)) facts.governing_law = answer;
  }

  const paymentMode = detectPaymentMode(session, intake);
  const phaseAnswer = lastAnswerForKeys(session, [
    "phase_payment_allocation",
    "milestone_schedule",
    "project_fee_phase_confirmation",
    "supplemental_schedule_confirmation",
  ]);
  const milestoneSplit = detectMilestoneSplit(phaseAnswer || facts.milestone_allocation || "", intake);
  const terminationDays =
    parseTerminationDays(facts.termination_notice || "") ?? parseTerminationDays(intake);
  const governingLaw =
    parseGoverningLaw(facts.governing_law || "", intake) ?? parseGoverningLaw(intake, "");

  if (paymentMode === "monthly_retainer" && !facts.monthly_fee) {
    const m = intake.match(/\$[\d,]+(?:\.\d{2})?\s*(?:per\s+)?month/i);
    if (m) facts.monthly_fee = m[0];
  }

  return { facts, paymentMode, milestoneSplit, terminationDays, governingLaw };
}

function stripMatchingLines(
  text: string,
  lineRes: readonly RegExp[],
  repairPrefix: string,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t && lineRes.some((re) => re.test(t))) {
      repairs.push(`${repairPrefix}:${t.slice(0, 40)}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function stripConflictingPaymentLines(
  text: string,
  split: GuidedSemanticFacts["milestoneSplit"],
): { text: string; repairs: string[] } {
  if (!split || split === "custom") return { text, repairs: [] };
  const patterns = CONFLICTING_PAYMENT_LINE_RES[split] ?? [];
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t && patterns.some((re) => re.test(t))) {
      repairs.push(`semantic_payment_conflict:${t.slice(0, 48)}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function stripMilestoneLanguageForMonthly(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t && MILESTONE_LANGUAGE_RE.test(t) && !/\$[\d,]+/i.test(t)) {
      repairs.push(`semantic_strip_milestone:${t.slice(0, 48)}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function stripGoverningLawFromFeesSection(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const before = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const after = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const feeMatch = before.match(/^\s*2\.\s+[^\n]+/im);
  if (!feeMatch || feeMatch.index == null) return { text, repairs };
  const feeStart = feeMatch.index;
  const nextSection = before.slice(feeStart + 1).search(/^\s*3\.\s+/m);
  const feeEnd = nextSection >= 0 ? feeStart + 1 + nextSection : before.length;
  const feesBlock = before.slice(feeStart, feeEnd);
  if (!GOVERNING_LAW_IN_FEES_RE.test(feesBlock)) return { text, repairs };

  const cleanedFees = feesBlock
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t && GOVERNING_LAW_IN_FEES_RE.test(t) && !/\$|invoice|fee|payment|net\s*\d/i.test(t)) {
        repairs.push(`semantic_governing_out_of_fees:${t.slice(0, 40)}`);
        return false;
      }
      return true;
    })
    .join("\n");
  const merged = `${before.slice(0, feeStart)}${cleanedFees}${before.slice(feeEnd)}`;
  return { text: `${merged}${after}`.replace(/\n{3,}/g, "\n\n"), repairs };
}

function fixBrokenTerminationNoticeDays(
  text: string,
  days: number | null,
): { text: string; repairs: string[] } {
  if (days == null) return { text, repairs: [] };
  const repairs: string[] = [];
  let out = text;
  if (/\bO\s+days?\b/i.test(out) || /\b0\s+days?\s+written\s+notice\b/i.test(out)) {
    out = out.replace(
      /\b(?:O|0)\s+days?(\s+written\s+notice)?\b/gi,
      `${days} days written notice`,
    );
    repairs.push("semantic_fix_o_days_notice");
  }
  return { text: out, repairs };
}

function dedupeNet30Lines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let seen = false;
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (/^Invoices?\s+(?:are\s+)?due\s+Net\s*30\b/i.test(t)) {
      if (seen) {
        repairs.push("semantic_dedupe_net30");
        continue;
      }
      seen = true;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function dedupeGenericBoilerplate(text: string): { text: string; repairs: string[] } {
  const dupes = dedupeRepeatingSentenceLines(text);
  const repairs = [...dupes.repairs.map((r) => `semantic_${r}`)];
  return { text: dupes.text, repairs };
}

/** Post-Q&A deterministic corpus hygiene driven by structured guided facts. */
export function reconcileGuidedSemanticCorpus(
  text: string,
  semantic: GuidedSemanticFacts,
  _intakeRaw = "",
): { text: string; repairs: string[] } {
  let out = (text || "").trim();
  const repairs: string[] = [];
  if (!out) return { text: out, repairs };

  const run = (fn: (t: string) => { text: string; repairs: string[] }) => {
    const result = fn(out);
    out = result.text;
    repairs.push(...result.repairs);
  };

  run((t) => stripMatchingLines(t, RAW_ANSWER_LABEL_LINE_RES, "semantic_raw_label"));
  run((t) => stripMatchingLines(t, ORPHAN_BOILERPLATE_LINE_RES, "semantic_orphan"));
  run((t) => stripConflictingPaymentLines(t, semantic.milestoneSplit));
  if (semantic.paymentMode === "monthly_retainer") {
    run((t) => stripMilestoneLanguageForMonthly(t));
  }
  run((t) => stripGoverningLawFromFeesSection(t));
  run((t) => fixBrokenTerminationNoticeDays(t, semantic.terminationDays));
  run((t) => dedupeNet30Lines(t));
  run((t) => dedupeGenericBoilerplate(t));
  run((t) => {
    const sk = repairBareProSkeletonClauses(t);
    return { text: sk.text, repairs: sk.repairs.map((r) => `semantic_${r}`) };
  });

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test" && repairs.length) {
    // eslint-disable-next-line no-console
    console.info("[guided-semantic-reconcile]", {
      paymentMode: semantic.paymentMode,
      milestoneSplit: semantic.milestoneSplit,
      terminationDays: semantic.terminationDays,
      governingLaw: semantic.governingLaw,
      repairCount: repairs.length,
      bodyLen: out.length,
    });
  }

  return { text: out, repairs };
}

export function corpusHasPaymentStructureContradictions(
  body: string,
  semantic: GuidedSemanticFacts,
): string[] {
  const contradictions: string[] = [];
  const t = body.replace(/\s+/g, " ");
  if (semantic.milestoneSplit === "40_30_30") {
    if (/\bbuild-heavy\b/i.test(t)) contradictions.push("payment_build_heavy_conflicts_40_30_30");
    if (/\beven\s+thirds\b/i.test(t)) contradictions.push("payment_even_thirds_conflicts_40_30_30");
  }
  if (semantic.paymentMode === "monthly_retainer" && MILESTONE_LANGUAGE_RE.test(t)) {
    if (/\bbuild-heavy\b/i.test(t) || /\bschedule\s+a\s+phase\s+allocation\b/i.test(t)) {
      contradictions.push("milestone_language_in_monthly_agreement");
    }
  }
  if (/\bO\s+days?\s+written\s+notice\b/i.test(t)) contradictions.push("broken_termination_notice_days");
  if (RAW_ANSWER_LABEL_LINE_RES.some((re) => re.test(t))) contradictions.push("raw_guided_answer_label_in_corpus");
  return contradictions;
}
