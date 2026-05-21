/**
 * Universal agreement integrity validator — structural + semantic + coherence before render.
 */

import { validateAndRepairFinalRenderIntegrity } from "../agreementOutputQuality/finalRenderIntegrityValidator";
import type { AgreementOutputQualityContext } from "../agreementOutputQuality/types";
import { applyVisibleBodyQualityGate } from "../visibleBodyQualityGate";
import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import type { ProCompletenessContext } from "../proAgreementCompleteness/types";

export type IntegrityValidationIssue = {
  code: string;
  message: string;
  repaired?: boolean;
  severity: "fatal" | "warning";
};

export type AgreementIntegrityResult = {
  ok: boolean;
  text: string;
  issues: IntegrityValidationIssue[];
  repairs: string[];
  catastrophic: boolean;
};

const ORPHAN_LINE_RE =
  /^\s*(?:unless\s+a\s+different\s+period|or\s+service\s+period|to\s+enter\s+into\s+this\s+agreement)\b/i;

export function detectOrphanFragments(text: string): IntegrityValidationIssue[] {
  const issues: IntegrityValidationIssue[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t.length < 12 || t.length > 200) continue;
    if (ORPHAN_LINE_RE.test(t)) {
      issues.push({ code: "orphan_fragment", message: `Orphan line: ${t.slice(0, 80)}`, severity: "warning" });
    }
    if (/^\s*\d+\.\d+\s+[^.]+\.\s*$/.test(t) && t.length < 60) {
      issues.push({ code: "heading_only", message: `Heading-only: ${t}`, severity: "warning" });
    }
  }
  return issues;
}

/**
 * Full deterministic integrity pass for user-visible agreement bodies.
 */
export function validateAgreementIntegrity(
  text: string,
  ctx: AgreementOutputQualityContext & ProCompletenessContext,
): AgreementIntegrityResult {
  const repairs: string[] = [];
  const issues: IntegrityValidationIssue[] = [];
  let working = (text || "").trim();

  if (!working) {
    return {
      ok: false,
      text: "",
      issues: [{ code: "empty", message: "Empty document", severity: "fatal" }],
      repairs: [],
      catastrophic: true,
    };
  }

  const visible = applyVisibleBodyQualityGate(working, ctx);
  working = visible.text;
  repairs.push(...visible.repairs);

  const coherence = applyClauseCoherenceEngine(working);
  working = coherence.text;
  repairs.push(...coherence.repairs);

  const integrity = validateAndRepairFinalRenderIntegrity(working, ctx);
  working = integrity.text;
  repairs.push(...integrity.repairs);
  for (const i of integrity.issues) {
    issues.push({
      code: i.code,
      message: i.message,
      repaired: i.repaired,
      severity: i.repaired ? "warning" : "fatal",
    });
  }

  for (const o of detectOrphanFragments(working)) {
    issues.push(o);
  }

  const fatal = issues.filter((i) => i.severity === "fatal" && !i.repaired);
  const len = working.length;
  const catastrophic = len < 200 || fatal.length > 3;

  return {
    ok: fatal.length === 0 && !catastrophic,
    text: working,
    issues,
    repairs,
    catastrophic,
  };
}
