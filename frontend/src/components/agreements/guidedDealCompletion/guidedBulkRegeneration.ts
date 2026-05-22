import type { GuidedCompletionSession } from "./types";
import { getCurrentVariable } from "./guidedCompletionEngine";
import { resolveGuidedQuestionTarget, validateGuidedPatchPlacement } from "./guidedRevisionAnchors";
import type { GuidedRevisionTarget } from "./guidedRevisionAnchors";
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import { resolveImplementationPreview } from "./guidedImplementationPreview";
import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";

export const GUIDED_BULK_FAIL_USER_MESSAGE =
  "We couldn't cleanly apply all answers. Please try again or edit manually.";

/** Per-answer synthesis hints so bulk regen materially rewrites operative language. */
export function materialRewriteHintForGuidedAnswer(variableId: string, answer: string): string | null {
  const a = (answer || "").trim().toLowerCase();
  const id = variableId.toLowerCase();
  if (!a) return null;
  if (/99\.9|uptime|sla/i.test(a) || /sla|uptime|support_obligations/i.test(id)) {
    if (/99\.9/.test(a)) {
      return "Rewrite Section 5 with explicit 99.9% monthly uptime target, measurement method, exclusions, and remedy/credit language.";
    }
    if (/business.?hour|9\s*[-–]\s*5|weekday/i.test(a)) {
      return "Rewrite Section 5 with business-hours support window, response-time targets, and escalation path.";
    }
    return "Rewrite Section 5 support/SLA with measurable response targets and scope boundaries.";
  }
  if (/phase|milestone|deposit|installment|net\s*\d/i.test(a) || /payment|fee|phase/i.test(id)) {
    if (/phase|milestone|installment/i.test(a)) {
      return "Rewrite Section 2 and Schedule A with milestone-based payment schedule, due dates, and late-payment terms tied to deliverables.";
    }
    if (/monthly|retainer/i.test(a)) {
      return "Rewrite Section 2 with recurring monthly fee, invoice timing, and payment due dates.";
    }
    return "Rewrite Section 2 Fees and Payment with concrete amounts, timing, and invoicing language matching the answer.";
  }
  if (/client.*own|company.*own|provider.*own|assign|work.?product|ip/i.test(a) || /ip|ownership/i.test(id)) {
    if (/client|company|customer/i.test(a)) {
      return "Rewrite Section 4 so deliverables and work product are assigned to the client, with provider background-IP license carve-out.";
    }
    if (/provider|vendor|consultant/i.test(a)) {
      return "Rewrite Section 4 so provider retains IP with a broad license to the client for deliverables.";
    }
    return "Rewrite Section 4 Ownership and Work Product to match the selected allocation explicitly.";
  }
  if (/confidential|nda|security/i.test(id)) {
    return "Rewrite Section 3 Confidentiality with practical duties, permitted disclosures, and survival period from the answer.";
  }
  if (/terminat|renewal/i.test(id)) {
    return "Rewrite Section 6 Term and Termination with notice period and exit mechanics from the answer.";
  }
  return null;
}

const COMBINED_FORBIDDEN_TARGET: GuidedRevisionTarget = {
  questionKey: "bulk",
  sectionNumber: null,
  sectionLabel: "Full agreement",
  instructionSectionLine: "the full agreement",
  headingPatterns: [/^\s*\d+\.\s+/i],
  forbiddenBeforeSection1: [
    /\b(?:uptime|sla|service\s+level)\b/i,
    /\b(?:intellectual\s+property|work\s+product|ownership\s+of\s+deliverables)\b/i,
    /\b(?:total\s+fee|invoic(?:e|ing)|net\s+\d+)\b/i,
    /\bbuild\s+and\b/i,
    /\bmaintain\s+such\s+systems\b/i,
  ],
};

export function buildConsolidatedGuidedRegenerationPrompt(args: {
  intakeText: string;
  session: GuidedCompletionSession;
}): string {
  const intake = (args.intakeText || "").trim();
  const lines: string[] = [
    "Apply ALL guided answers below in ONE clean regeneration of the Pro agreement.",
    "Rewrite affected sections coherently — do NOT patch orphan fragments, duplicate party recitals, or insert operative clauses before Section 1.",
    "Preserve the agreement title, party block, preamble, signature block, and numbered section structure unless a guided answer requires a change.",
    "",
    "Section map:",
    "- Fees / payment / phases → Section 2 Fees and Payment and/or Schedule A Commercial Terms",
    "- Confidentiality → Section 3 Confidentiality",
    "- IP / deliverables → Section 4 Ownership and Work Product",
    "- SLA / support → Section 5 Support Expectations",
    "- Termination → Section 6 Term and Termination",
    "",
    "Original intake:",
    intake || "(not provided)",
    "",
    "Guided answers to implement:",
  ];

  for (const id of args.session.queue) {
    const answer = (args.session.answered[id] || "").trim();
    if (!answer) continue;
    const variable = args.session.variables.find((v) => v.id === id);
    const target = resolveGuidedQuestionTarget(id);
    const materialHint = materialRewriteHintForGuidedAnswer(id, answer);
    lines.push(
      `- ${variable?.label ?? id} → ${target.instructionSectionLine}: ${answer}${
        materialHint ? ` [REWRITE: ${materialHint}]` : ""
      }`,
    );
  }

  lines.push(
    "",
    "Return the complete updated agreement text. Ensure consistent numbering, no duplicate recitals, and no stray fragments such as \"build and\" or \"maintain such systems\" outside their sections.",
  );

  return lines.join("\n");
}

/** Validate full-document output after bulk guided regeneration (lenient — not surgical placement). */
export function validateGuidedBulkRegeneration(beforeText: string, afterText: string) {
  const before = (beforeText || "").trim();
  const after = (afterText || "").trim();
  const reasons: string[] = [];
  if (after.length < Math.max(500, before.length * 0.45)) {
    reasons.push("output_too_short");
  }
  if (before.length >= 800 && after.length < before.length * 0.72) {
    reasons.push("output_shrunk_unexpectedly");
  }
  return { ok: reasons.length === 0, reasons };
}

/** @deprecated Surgical placement rules — use only for per-answer patch refine, not bulk regen. */
export function validateGuidedBulkRegenerationStrictPlacement(beforeText: string, afterText: string) {
  return validateGuidedPatchPlacement(beforeText, afterText, COMBINED_FORBIDDEN_TARGET);
}

export function buildAppliedChangesFromSession(session: GuidedCompletionSession): GuidedAppliedChange[] {
  const out: GuidedAppliedChange[] = [];
  for (const id of session.queue) {
    const answer = (session.answered[id] || "").trim();
    if (!answer) continue;
    const meta = session.answeredMeta?.[id];
    const cfg = resolveGuidedQuestionConfig(id);
    const sectionLabel = meta?.targetSectionLabel ?? cfg.targetSectionLabel;
    out.push({
      questionKey: id,
      answerLabel: answer,
      recommendationReason: meta?.recommendationReason ?? null,
      targetSectionLabel: sectionLabel,
      summary: meta?.implementationPreview ?? resolveImplementationPreview(id, answer),
      anchorFound: true,
      changedSnippet: "",
      timestamp: session.answeredAt?.[id] ?? Date.now(),
    });
  }
  return out;
}

export function logGuidedAllAnswersReady(session: GuidedCompletionSession): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-all-answers-ready]", {
    answered: Object.keys(session.answered).length,
    total: session.frozenTotalQuestions ?? session.queue.length,
  });
}

export function logGuidedBulkRegenerationStart(): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-start]");
}

export function logGuidedBulkRegenerationSuccess(len: number): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-success]", { len });
}

export function logGuidedBulkRegenerationFailed(reasons: string[]): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-failed]", { reasons });
}

export function sessionReadyForBulkApply(session: GuidedCompletionSession): boolean {
  return getCurrentVariable(session) === null && Object.keys(session.answered).length > 0;
}
