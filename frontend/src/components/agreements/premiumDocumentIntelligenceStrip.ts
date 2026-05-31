/**
 * Internal QA / situation intelligence lines must not appear inside rendered Pro agreement bodies.
 */

import { CONTRADICTION_DOC_NOTES } from "./premiumSituationIntelligence";
import type { PremiumDocumentRenderHints } from "./premiumDocumentRenderHints";

/** Situation executive lines and contradiction notes — document body only, never in final review paper. */
const INTELLIGENCE_CALLOUT_LINE_RES: readonly RegExp[] = [
  /^Professional services shape —[^\n]*$/gim,
  /^Employee and contractor signals both appeared —[^\n]*$/gim,
  /^Built for a paid creator or brand collaboration —[^\n]*$/gim,
  /^Software-style commercial terms —[^\n]*$/gim,
  /^Independent contractor framing —[^\n]*$/gim,
  /^Confidentiality-first —[^\n]*$/gim,
  /^Release-and-payment structure —[^\n]*$/gim,
  /^License-focused —[^\n]*$/gim,
  /^Collaboration terms —[^\n]*$/gim,
  /^Employment-style terms —[^\n]*$/gim,
  /^Drafted from your deal description —[^\n]*$/gim,
  /^Neutral, professional framing for a sensitive situation —[^\n]*$/gim,
  /^A few instructions pointed in different directions —[^\n]*$/gim,
  ...Object.values(CONTRADICTION_DOC_NOTES).map(
    (line) => new RegExp(`^${escapeRegExp(line)}$`, "gim"),
  ),
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripPremiumIntelligenceCalloutsFromCorpus(text: string): string {
  let out = (text || "").replace(/\r\n/g, "\n");
  for (const re of INTELLIGENCE_CALLOUT_LINE_RES) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function premiumRenderHintsWithoutDocumentCallouts(
  hints: PremiumDocumentRenderHints | null | undefined,
): PremiumDocumentRenderHints | null {
  if (!hints) return null;
  return {
    ...hints,
    executiveFramingLine: null,
    contradictionDocumentNote: null,
  };
}
