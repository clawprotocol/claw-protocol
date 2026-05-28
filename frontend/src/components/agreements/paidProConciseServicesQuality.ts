/**
 * Quality floor for concise but complete commercial services Pro bodies (e.g. Red Mesa AI workflow).
 * Prevents rejecting valid server output solely for length/section-count vs. stitched live preview.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  isCommercialServicesIntake,
  validationMinimumContractElementsSatisfied,
  type ValidationMinimumElementsInput,
} from "./agreementIntentContract";
import {
  repairDuplicateAgreementOpening,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { stripMalformedProReviewDisplayArtifacts } from "./polishProAgreementDisplayLayer";

export type ConciseCommercialServicesFactId =
  | "party_names"
  | "services_scope"
  | "payment"
  | "acceptance_review"
  | "governing_law"
  | "electronic_signatures"
  | "termination"
  | "ownership_work_product"
  | "confidentiality";

export type ProMinimumSubstanceSection = ConciseCommercialServicesFactId;

export type ConciseCommercialServicesQualityAssessment = {
  applies: boolean;
  ok: boolean;
  docLen: number;
  requiredFactsFound: ConciseCommercialServicesFactId[];
  requiredFactsMissing: ConciseCommercialServicesFactId[];
  missingSections: ProMinimumSubstanceSection[];
  malformedOpening: boolean;
};

const MALFORMED_OPENING_RES = [
  /effective\s+date\s+This\s+Agreement\s+is\s+between/i,
  /entered\s+into\s+as\s+of\s+the\s+effective\s+date\s+This\s+Agreement\s+is\s+between/i,
  /Agreement["']?\s*\)\s+is\s+This\s+Agreement\s+is\s+between/i,
  /\.signature\b/i,
  /\bsignature\s+below\b/i,
];

function normPartyToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function partyNameInBody(bodyLow: string, name: string): boolean {
  const n = normPartyToken(name);
  if (!n || n.length < 4) return false;
  if (bodyLow.includes(n)) return true;
  const parts = n.split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length >= 2) {
    return parts.every((p) => bodyLow.includes(p));
  }
  return false;
}

function resolvePartyNames(
  draft: ParsedDraftShape | null | undefined,
  rawIntake: string,
): string[] {
  const fromDraft = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 3);
  if (fromDraft.length >= 2) return fromDraft.slice(0, 2);
  const m = rawIntake.match(
    /\b([A-Z][A-Za-z0-9&.'\-\s]{2,60}?\s+(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.))\b/g,
  );
  return (m ?? []).map((x) => x.trim()).slice(0, 2);
}

function intakeMentionsTexas(intakeLow: string): boolean {
  return /\btexas\b/i.test(intakeLow);
}

function intakePaymentAmount(intakeLow: string): number | null {
  const m = intakeLow.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bodyHasPayment(bodyLow: string, intakeLow: string): boolean {
  const amt = intakePaymentAmount(intakeLow);
  if (amt != null) {
    const plain = String(amt);
    const withComma = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (bodyLow.includes(plain) || bodyLow.includes(withComma)) return true;
    if (amt === 5000 && /(?:five\s+thousand|5,000|5000)/i.test(bodyLow)) return true;
  }
  return /\$\s*[\d,]+|(?:total|fee|consideration|pay(?:ment)?)\b/i.test(bodyLow);
}

export function assessConciseCommercialServicesProQuality(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  agreementValidation?: ValidationMinimumElementsInput | null;
}): ConciseCommercialServicesQualityAssessment {
  const text = (args.text || "").trim();
  const rawIntake = (args.rawIntake || "").trim();
  const intakeLow = rawIntake.toLowerCase();
  const bodyLow = text.toLowerCase();
  const docLen = text.length;
  const parties = resolvePartyNames(args.draft ?? null, rawIntake);
  const knownServicesDealFacts =
    /\b(?:ai|artificial intelligence|workflow|automation|setup|implementation|integration)\b/i.test(rawIntake) ||
    /\$\s*[\d,]+/.test(rawIntake) ||
    /\b(?:texas|electronic\s+signatures?|e-?sign)\b/i.test(rawIntake);
  const applies =
    isCommercialServicesIntake(rawIntake) &&
    knownServicesDealFacts &&
    parties.length >= 2 &&
    parties.every((p) => /\b(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.)\b/i.test(p));

  const requiredFactsFound: ConciseCommercialServicesFactId[] = [];
  const requiredFactsMissing: ConciseCommercialServicesFactId[] = [];

  if (!applies) {
    return {
      applies: false,
      ok: false,
      docLen,
      requiredFactsFound,
      requiredFactsMissing,
      missingSections: [],
      malformedOpening: false,
    };
  }

  const malformedOpening = MALFORMED_OPENING_RES.some((re) => re.test(text));

  const partyOk = parties.every((p) => partyNameInBody(bodyLow, p));
  (partyOk ? requiredFactsFound : requiredFactsMissing).push("party_names");

  const scopeOk =
    /\b(?:ai\s+workflow|workflow\s+setup|professional\s+services|scope\s+of\s+services|services\s+agreement)\b/i.test(
      bodyLow,
    );
  (scopeOk ? requiredFactsFound : requiredFactsMissing).push("services_scope");

  const payOk = bodyHasPayment(bodyLow, intakeLow);
  (payOk ? requiredFactsFound : requiredFactsMissing).push("payment");

  const acceptanceOk =
    /\b(?:acceptance|acceptance\s+review|demo(?:nstration)?|review\s+period|nonconformity|defect|material\s+conform)/i.test(
      bodyLow,
    );
  (acceptanceOk ? requiredFactsFound : requiredFactsMissing).push("acceptance_review");

  const lawOk = intakeMentionsTexas(intakeLow)
    ? /\btexas\b|state of texas|laws of texas/i.test(bodyLow)
    : /\b(?:governing\s+law|governed\s+by|laws\s+of)\b/i.test(bodyLow);
  (lawOk ? requiredFactsFound : requiredFactsMissing).push("governing_law");

  const esignOk = /\belectronic\s+signatures?\b|\be-?sign\b|\bcounterparts?\b/i.test(bodyLow);
  (esignOk ? requiredFactsFound : requiredFactsMissing).push("electronic_signatures");

  const termOk = /\bterminat(?:ion|e)?\b/i.test(bodyLow);
  (termOk ? requiredFactsFound : requiredFactsMissing).push("termination");

  const ownershipOk =
    /\b(?:work\s+product|ownership|own(?:s|ership)?\s+(?:final\s+)?(?:deliverables?|work)|intellectual\s+property|assign(?:s|ment)?|client\s+owns)\b/i.test(
      bodyLow,
    );
  (ownershipOk ? requiredFactsFound : requiredFactsMissing).push("ownership_work_product");

  const confidentialityOk = /\bconfidential(?:ity)?\b|non-?public|trade secret|proprietary/i.test(bodyLow);
  (confidentialityOk ? requiredFactsFound : requiredFactsMissing).push("confidentiality");

  const factsOk = requiredFactsMissing.length === 0;
  void validationMinimumContractElementsSatisfied(args.agreementValidation);
  const ok = !malformedOpening && docLen >= 400 && factsOk;

  return {
    applies: true,
    ok,
    docLen,
    requiredFactsFound,
    requiredFactsMissing,
    missingSections: requiredFactsMissing,
    malformedOpening,
  };
}

export function validateProMinimumSubstance(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  source?: string | null;
}): ConciseCommercialServicesQualityAssessment {
  const decision = assessConciseCommercialServicesProQuality({
    text: args.text,
    rawIntake: args.rawIntake,
    draft: args.draft ?? null,
  });
  logProMinimumSubstanceDecision({
    accepted: !decision.applies || decision.ok,
    missingSections: decision.missingSections,
    docLen: decision.docLen,
    source: args.source ?? null,
  });
  return decision;
}

export function logProMinimumSubstanceDecision(payload: {
  accepted: boolean;
  missingSections: string[];
  docLen: number;
  source?: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-minimum-substance-decision]", payload);
}

export function logPaidProValidationDecision(payload: {
  accepted: boolean;
  reasons: string[];
  docLen: number;
  source?: string | null;
  serverFullDocExists?: boolean;
  requiredFactsFound?: string[];
  requiredFactsMissing?: string[];
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-validation-decision]", payload);
}

/** Repair malformed openings and expand thin AI workflow services bodies before acceptance gates. */
export function preparePaidProServerDocumentForAcceptance(
  raw: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText: string,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (raw || "").replace(/\r\n?/g, "\n").trim();
  const partyNames = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2)
    .slice(0, 2);
  const records =
    partyNames.length >= 2
      ? resolveCanonicalPartyIdentitiesFromIntake(intakeText, partyNames)
      : [];

  const headArtifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = headArtifacts.text;
  repairs.push(...headArtifacts.repairs);

  const opening = repairDuplicateAgreementOpening(out, records.length >= 2 ? records : undefined);
  out = opening.text;
  repairs.push(...opening.repairs);

  const floored = applyAiWorkflowServicesQualityFloorToFallback(out, draft ?? null, intakeText);
  if (floored !== out) {
    repairs.push("quality:ai_workflow_services_floor");
    out = floored;
  }

  const tailArtifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = tailArtifacts.text;
  repairs.push(...tailArtifacts.repairs);

  return { text: out.trim(), repairs: [...new Set(repairs)] };
}
