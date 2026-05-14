/**
 * Lightweight conversational draft + single “next question” engine (no flow trees).
 * Client heuristics only — server parse on submit stays authoritative.
 */

import type { LivePreviewModel } from "./liveDraftHeuristics";
import { buildLiveDraftPreview, tidyPartiesLineForPreview } from "./liveDraftHeuristics";
import { extractBetweenPartyPair } from "./partyBetweenParse";
import { extractIntakePayment } from "./intakeCurrencyParse";
import { isUsablePartialIntakeStructure, meetsMinimalIntakeProgress } from "./intakeGuidedHints";
import {
  getCaptureAcknowledgement,
  getGuidedFlowConfig,
  type GuidedFieldKey,
  type GuidedFlowId,
} from "./guidedFlowConfig";

export type { GuidedFieldKey, GuidedFlowId } from "./guidedFlowConfig";
export { getCaptureAcknowledgement, getGuidedFlowConfig } from "./guidedFlowConfig";

/** @deprecated use GuidedFieldKey */
export type IntakeDraftField = GuidedFieldKey;

export type AgreementIntakeDraft = {
  type: string;
  parties: string;
  scope: string;
  payment: string;
  term: string;
};

export function resolveGuidedFlowId(rawIntake: string, live: LivePreviewModel): GuidedFlowId {
  const low = rawIntake.toLowerCase();
  const dt = (live.docTitle || "").toLowerCase();

  const consultingSignals =
    /\bconsult(?:ing|ant)?\b|\bretainer\b|\bsow\b|statement\s+of\s+work/.test(low) || dt.includes("consult");
  const contractorSignals =
    /\bcontractor\b|\b1099\b|\bindependent\s+contractor\b|\bsubcontractor\b/.test(low) || dt.includes("contractor");

  const ndaStrong =
    /\bnda\b/i.test(low) ||
    /\bnon[-\s]?disclosure\b/i.test(low) ||
    /\bconfidentiality\s+agreement\b/i.test(low);

  const ndaFromContextualConfidentiality =
    !consultingSignals &&
    !contractorSignals &&
    (/\bmutual\s+(?:confidentiality|nda)\b/i.test(low) ||
      /\bconfidential\s+(?:information|materials|data|records)\b/i.test(low) ||
      (/\bconfidentiality\b/i.test(dt) && !dt.includes("consult")));

  /** SaaS / B2B / reseller intakes often mention milestone payments — must not route to payment_plan. */
  const primaryCommercialDraftingSignals =
    /\b(saas|reseller|white[-\s]?label|services?\s+agreement|master\s+service|msa|vendor|supplier|b2b|software|workflow|subscription|license|partnership)\b/i.test(
      low,
    ) || /\bagreement\s+between\b/i.test(low);

  /** Commercial / consulting beats thin confidentiality substring matches (ranking: consulting → contractor → payment plan → NDA). */
  if (consultingSignals) return "consulting";
  if (contractorSignals) return "contractor";
  if (
    /\bpayment\s*plan\b|\binstallments?\b|\bmilestone\s+payments?\b|\bpayment\s+schedule\b/.test(low) &&
    !consultingSignals &&
    !primaryCommercialDraftingSignals
  ) {
    return "payment_plan";
  }
  if (ndaStrong || ndaFromContextualConfidentiality) return "nda";
  if (/\bemploy|hire|salary|w-2|w2\b/.test(low) || dt.includes("employment")) return "default";
  if (/\bservice|saas|subscription\b/.test(low) || dt.includes("service")) return "default";
  return "default";
}

/** @deprecated use resolveGuidedFlowId */
export function agreementTypeKey(rawIntake: string, live: LivePreviewModel): string {
  return resolveGuidedFlowId(rawIntake, live);
}

function looksLikeGenericPartyToken(s: string): boolean {
  const x = s.trim().toLowerCase();
  return (
    /^(two parties|the parties|party a|party b|both parties|the two parties)$/.test(x) ||
    /^\[[^\]]+\]$/.test(x.trim()) ||
    x.length < 2
  );
}

function hasPartyDetail(text: string, model: LivePreviewModel): boolean {
  const betweenPair = extractBetweenPartyPair(text);
  if (betweenPair) {
    const a = betweenPair.left.trim();
    const b = betweenPair.right.trim();
    if (!looksLikeGenericPartyToken(a) && !looksLikeGenericPartyToken(b)) return true;
  }
  const pl = (model.partiesLine || "").trim();
  if (pl.length > 14 && !/\[Other party\]|\[counterparty\]/i.test(pl)) return true;
  if (/\bparties?\s*:\s*.{4,}\s+and\s+.{4,}/i.test(text)) return true;
  return false;
}

function hasScopeDetail(text: string, model: LivePreviewModel): boolean {
  if ((model.scopeLine || model.servicesLine || "").trim().length > 8) return true;
  if (model.extraction?.scopeSignalPresent) return true;
  const t = text.trim();
  if (/\b(scope|purpose|services?|work)\s*:/i.test(t) && t.length > 32) return true;
  if (/\b(scope\s+of\s+work|will\s+be\s+performing|will\s+provide|responsible\s+for|work\s+includes|services\s+include)\b/i.test(t))
    return true;
  if (t.length > 90) return true;
  if (t.length > 50 && /\b(for|to|regarding|protect|disclose)\b/i.test(t)) return true;
  return false;
}

function hasNdaConfidentialScope(text: string, model: LivePreviewModel): boolean {
  if (hasScopeDetail(text, model)) return true;
  const t = text.toLowerCase();
  if (
    /\b(information|data|plans?|financial|customer|source\s*code|trade\s*secret|proprietary|designs?|roadmap|metrics)\b/.test(
      t,
    )
  ) {
    return true;
  }
  return t.length > 120 && /\b(confidential|disclose|protect)\b/.test(t);
}

function hasConfidentialityStructure(text: string): boolean {
  return /\bmutual\b|\bone[\s-]?way\b|\bunilateral\b|\bbilateral\b|\bboth\s+sides\b|\bonly\s+one\s+side\b|\bdisclosing\b|\breceiving\b/i.test(
    text,
  );
}

function hasTermDetail(text: string, model: LivePreviewModel): boolean {
  if ((model.termLine || model.scheduleLine || "").trim().length > 2) return true;
  if (model.extraction?.termSignalPresent) return true;
  if (/\b\d+\s*(year|month|week|day)s?\b/i.test(text)) return true;
  if (/\b(?:until|through|ending|expires?|effective|starting|start\s+date|duration|as\s+long\s+as|monthly|ongoing)\b/i.test(text))
    return true;
  if (
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(text)
  )
    return true;
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) return true;
  return false;
}

function isNdaContext(text: string, model: LivePreviewModel): boolean {
  const low = text.toLowerCase();
  const dt = (model.docTitle || "").toLowerCase();
  const consultingSignals =
    /\bconsult(?:ing|ant)?\b|\bretainer\b|\bsow\b|statement\s+of\s+work/.test(low) || dt.includes("consult");
  if (consultingSignals) return false;
  if (
    /\bnda\b/i.test(low) ||
    /\bnon[-\s]?disclosure\b/i.test(low) ||
    /\bconfidentiality\s+agreement\b/i.test(low) ||
    /\bconfidential\s+(?:information|materials|data|records)\b/i.test(low)
  ) {
    return true;
  }
  return /\bconfidentiality\b/i.test(dt) && !dt.includes("consult");
}

function isPaymentSatisfied(raw: string, live: LivePreviewModel, draft: AgreementIntakeDraft): boolean {
  if (draft.payment.trim().length > 2) return true;
  if ((live.compensationLine || "").trim().length > 2) return true;
  const pay = extractIntakePayment(raw);
  if (pay.amount != null) return true;
  if (/\$|€|£|\bpayment|fee|invoice|retainer|salary|hourly|monthly|\d+k\b/i.test(raw)) return true;
  if (/\bno payment|unpaid|pro bono|free\b/i.test(raw)) return true;
  if (isNdaContext(raw, live) && !/\$|fee|payment|retainer|invoice/i.test(raw)) return true;
  return false;
}

function hasExtrasAnswer(raw: string, stepBuffer?: string): boolean {
  if (stepBuffer && stepBuffer.trim().length > 0) return true;
  // Primary: "draft now" (short, voice-friendly). Legacy: "draft it", "draft it now".
  if (
    /\b(draft\s+now|draft\s+it(?:\s+now)?|nothing\s+else|no\s+more|that'?s\s+all|looks\s+good|all\s+set)\b/i.test(raw)
  )
    return true;
  if (/\b(delaware|governing\s+law|jurisdiction|law\s+of\s+)/i.test(raw)) return true;
  return false;
}

export function buildAgreementIntakeDraft(rawIntake: string, live: LivePreviewModel): AgreementIntakeDraft {
  const payField = extractIntakePayment(rawIntake);
  const comp = (live.compensationLine || "").trim();
  const payment =
    comp ||
    (payField.amount != null ? String(payField.amount) : "") ||
    (/\bno payment|unpaid|pro bono\b/i.test(rawIntake) ? "No payment" : "");
  return {
    type: (live.docTitle || "Agreement").replace(/\s+/g, " ").trim(),
    parties: tidyPartiesLineForPreview(live.partiesLine ?? ""),
    scope: (live.scopeLine || live.servicesLine || "").trim(),
    payment,
    term: (live.termLine || live.scheduleLine || "").trim(),
  };
}

export function isGuidedFieldSatisfied(
  field: GuidedFieldKey,
  draft: AgreementIntakeDraft,
  rawIntake: string,
  live: LivePreviewModel,
  opts?: { stepBuffer?: string },
): boolean {
  const step = opts?.stepBuffer?.trim() ?? "";
  switch (field) {
    case "parties":
      return hasPartyDetail(rawIntake, live);
    case "confidential_scope":
      return hasNdaConfidentialScope(rawIntake, live);
    case "confidentiality_structure":
      return hasConfidentialityStructure(rawIntake);
    case "duration":
      return hasTermDetail(rawIntake, live);
    case "scope":
      return hasScopeDetail(rawIntake, live);
    case "payment":
      return isPaymentSatisfied(rawIntake, live, draft);
    case "term":
      return hasTermDetail(rawIntake, live);
    case "extras":
      return hasExtrasAnswer(rawIntake, step);
    default:
      return false;
  }
}

const BOOTSTRAP_QUESTION = {
  question: "What agreement are you creating?",
  example: "A sentence is enough — for example: “A simple NDA between two companies.”",
};

export type NextQuestion = {
  field: GuidedFieldKey;
  question: string;
  example: string;
  quickReplies?: string[];
};

export function getNextQuestion(
  rawIntake: string,
  live: LivePreviewModel,
  draft: AgreementIntakeDraft,
  opts?: { stepBuffer?: string },
): NextQuestion | null {
  const t = rawIntake.trim();
  if (t.length < 6) {
    return { field: "scope", ...BOOTSTRAP_QUESTION };
  }
  if (meetsMinimalIntakeProgress(t, live)) {
    return null;
  }
  if (!isUsablePartialIntakeStructure(live, t)) {
    return { field: "scope", ...BOOTSTRAP_QUESTION };
  }
  const flowId = resolveGuidedFlowId(t, live);
  const config = getGuidedFlowConfig(flowId);
  for (const field of config.fieldOrder) {
    if (!isGuidedFieldSatisfied(field, draft, t, live, opts)) {
      const copy = config.fields[field];
      if (!copy) continue;
      return {
        field,
        question: copy.question,
        example: copy.example,
        quickReplies: copy.quickReplies,
      };
    }
  }
  return null;
}

export function getFirstMissingField(
  rawIntake: string,
  live: LivePreviewModel,
  draft: AgreementIntakeDraft,
  opts?: { stepBuffer?: string },
): GuidedFieldKey | "bootstrap" | null {
  const t = rawIntake.trim();
  if (t.length < 6) {
    return "bootstrap";
  }
  if (meetsMinimalIntakeProgress(t, live)) {
    return null;
  }
  if (!isUsablePartialIntakeStructure(live, t)) {
    return "bootstrap";
  }
  const flowId = resolveGuidedFlowId(t, live);
  const config = getGuidedFlowConfig(flowId);
  for (const field of config.fieldOrder) {
    if (!isGuidedFieldSatisfied(field, draft, t, live, opts)) return field;
  }
  return null;
}

function rankInOrder(
  field: GuidedFieldKey | "bootstrap" | null,
  order: GuidedFieldKey[],
): number {
  if (field === null) return order.length + 1;
  if (field === "bootstrap") return -1;
  const i = order.indexOf(field);
  return i === -1 ? order.length : i;
}

/** 0–1 progress through the guided intake (for a progress bar; no step labels). */
export function getGuidedProgressRatio(
  firstMissing: GuidedFieldKey | "bootstrap" | null,
  rawIntake: string,
  live: LivePreviewModel,
): number {
  if (firstMissing === null) return 1;
  const flowId = resolveGuidedFlowId(rawIntake.trim(), live);
  const order = getGuidedFlowConfig(flowId).fieldOrder;
  const total = 1 + order.length;
  const step = firstMissing === "bootstrap" ? 1 : rankInOrder(firstMissing, order) + 2;
  if (total <= 1) return 1;
  return Math.min(1, Math.max(0, (step - 1) / (total - 1)));
}

export function firstMissingMovesForward(
  prev: GuidedFieldKey | "bootstrap" | null,
  cur: GuidedFieldKey | "bootstrap" | null,
  rawIntake: string,
  live: LivePreviewModel,
): boolean {
  const flowId = resolveGuidedFlowId(rawIntake.trim(), live);
  const order = getGuidedFlowConfig(flowId).fieldOrder;
  return rankInOrder(cur, order) > rankInOrder(prev, order);
}

/** @deprecated use getCaptureAcknowledgement from guidedFlowConfig via flow */
export function formatAckForField(
  field: GuidedFieldKey,
  _draft: AgreementIntakeDraft,
  rawIntake: string,
  live: LivePreviewModel,
): string {
  const flowId = resolveGuidedFlowId(rawIntake, live);
  return getCaptureAcknowledgement(flowId, field);
}

export function buildActionAcknowledgementLine(seedText: string): string {
  const t = seedText.trim();
  if (!t) return "✓ Got it.";
  const live = buildLiveDraftPreview(t);
  const id = resolveGuidedFlowId(t, live);
  return getGuidedFlowConfig(id).actionAcknowledgement;
}

export function getAddedValueSnippet(
  field: GuidedFieldKey,
  draft: AgreementIntakeDraft,
  rawIntake: string,
  live: LivePreviewModel,
  stepBuffer?: string,
): string {
  const clip = (s: string, n = 58) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= n) return t;
    return `${t.slice(0, n - 1)}…`;
  };
  const step = (stepBuffer || "").trim();
  if (field === "parties") return clip(draft.parties || live.partiesLine || "parties");
  if (field === "confidential_scope") return clip(draft.scope || live.scopeLine || "confidential scope");
  if (field === "confidentiality_structure") {
    const low = rawIntake.toLowerCase();
    if (/\bmutual\b|\bboth sides\b|\bbilateral\b/.test(low)) return "mutual";
    if (/\bone[\s-]?way\b|\bunilateral\b|only one side/.test(low)) return "one-way";
    return clip(step || "structure");
  }
  if (field === "duration" || field === "term") return clip(draft.term || live.termLine || "duration");
  if (field === "payment") return clip(draft.payment || live.compensationLine || "payment terms");
  if (field === "scope") return clip(draft.scope || live.scopeLine || "scope");
  if (field === "extras") return clip(step || "details");
  return "saved";
}
