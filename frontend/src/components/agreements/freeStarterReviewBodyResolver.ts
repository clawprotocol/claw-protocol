/**
 * Canonical Free Starter review body — intake-preserved repairs always win over API/hydrated fallback.
 */

import {
  buildStarterAgreementPreviewForReview,
  type AgreementPreviewBuildOptions,
} from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { readAgreementCreatorIntakeStorage } from "./agreementIntakeStorage";
import {
  draftPaymentTermsLoseIntakeInstallmentCadence,
  formatInstallmentPaymentTermsFromIntake,
  intakeDeclaresMonthlyInstallments,
  repairStarterPaymentCadenceInPreviewPlain,
  resolveStarterPreviewIntakeText,
} from "./intakeCurrencyParse";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { starterCorpusContainsRawIntakeInstruction } from "./canonicalPartyRoleAuthority";
import { readOriginalUserIntakeRaw } from "./originalUserIntakeRawStorage";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import { isolateLegalEntityFromContaminatedName } from "./starterPartyIdentityIsolation";
import { sanitizeStarterPartyNameForDisplay } from "./starterPreviewProseSanitize";
import { normalizeFreeStarterSectionRender } from "./freeStarterSectionRenderNormalize";
import { SHORT_STALE_PREMIUM_INTAKE_THRESHOLD } from "./premiumCheckoutIntakeCorpus";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import {
  validateFreeStarterGeneratedBody,
  logFreeStarterBodyValidation,
} from "./freeStarterBodyValidation";
import {
  starterPreviewHasGluedSectionHeadings,
  starterPreviewHasParagraphSectionBreaks,
} from "./starterPreviewFormatting";

export type FreeStarterRenderSource =
  | "repaired_starter_preview"
  | "authoritative_hydrated_repaired"
  | "api_payload_repaired"
  | "current_preview_repaired"
  | "free_openai_direct";

/**
 * Returns true if the free document validation indicates we should redirect to Pro
 * instead of showing a broken free page.
 */
export function shouldRedirectFreeToProForValidation(validation: string | null | undefined): boolean {
  const v = (validation ?? "").trim();
  if (!v || v === "ok") return false;
  // Redirect for all failure cases: missing_parties, missing_tenets, incomplete_sentences, generation_failed
  return true;
}

/**
 * Returns true if the free one-pager from OpenAI is valid and usable.
 */
export function isFreeOnePagerValid(text: string | null | undefined, validation: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  const v = (validation ?? "").trim();
  return t.length >= 200 && v === "ok";
}

/**
 * When Pro generation fails, use the validated free one-pager as a fallback body.
 * Returns the free document text if it's valid, otherwise returns empty string.
 * This prevents empty Pro review pages when we have a valid free document.
 */
export function getFreeOnePagerFallbackForProFailure(
  draft: { free_document_text?: string | null; free_document_validation?: string | null } | null | undefined,
): string {
  if (!draft) return "";
  const text = (draft.free_document_text ?? "").trim();
  const validation = (draft.free_document_validation ?? "").trim();
  if (isFreeOnePagerValid(text, validation)) {
    return text;
  }
  return "";
}

export type HollowBodyTenet = "parties" | "payment" | "term" | "governing_law";

export type HollowBodyGateResult = {
  isHollow: boolean;
  missingTenets: HollowBodyTenet[];
  shouldAskQuestions: boolean;
  shouldRedirectToPro: boolean;
  reasons: string[];
};

export type ProtectedFactKind = "payment_cadence" | "party_identity" | "term" | "governing_law";

export type ResolveFreeStarterReviewBodyArgs = {
  draft: ParsedDraftShape | null;
  rawIntake?: string | null;
  apiPayload?: {
    document_text?: string | null;
    payment_terms?: string | null;
    server_full_document_text?: string | null;
  } | null;
  currentPreview?: string | null;
  authoritativeBody?: string | null;
  placeholderGate?: AgreementPreviewBuildOptions["placeholderGate"];
  /** POST /draft returned a payload — prefer clean server/hydrated preview over local rebuild. */
  hasDraftPayload?: boolean;
  /** When true, allow a longer alternate body (only when intake is unavailable). */
  preferAlternate?: boolean;
  /**
   * Direct one-pager from OpenAI free parse. When validation is "ok",
   * paint this body directly instead of building from structured fields.
   */
  freeDocumentText?: string | null;
  freeDocumentValidation?: string | null;
};

export type ResolveFreeStarterReviewBodyResult = {
  body: string;
  source: FreeStarterRenderSource;
  rawIntakeResolved: string;
  usedOriginalRaw: boolean;
  usedStorageRaw: boolean;
  apiPaymentTerms: string;
  repairedPaymentTerms: string;
  finalPaymentTerms: string;
  protectedFactRepairCount: number;
  /** Validation result — when bodyValidation.valid is false, the body is hollow and should not be displayed. */
  bodyValidation: import("./freeStarterBodyValidation").FreeStarterBodyValidationResult | null;
};

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logFreeStarterRenderSource(payload: {
  source: FreeStarterRenderSource;
  rawIntakeResolved: number;
  usedOriginalRaw: boolean;
  usedStorageRaw: boolean;
  apiPaymentTerms: string;
  repairedPaymentTerms: string;
  finalPaymentTerms: string;
  protectedFactRepairCount: number;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-render-source]", payload);
}

export function logFreeStarterProtectedFactRepair(payload: {
  fact: ProtectedFactKind;
  before: string;
  after: string;
  reason: string;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-protected-fact-repair]", payload);
}

function looksLikeStructuredDraftCoercion(hint: string, draft: ParsedDraftShape | null): boolean {
  const t = hint.trim();
  if (t.length < 80) return false;
  if (/\b(?:Client|Service Provider):\s*/i.test(t)) return false;
  if (draft) {
    const coerced = buildReviewCoercionRawIntakeFromDraft(draft, "").trim();
    if (coerced.length >= 80 && t.length >= coerced.length - 24 && t.length <= coerced.length + 24) {
      return true;
    }
  }
  return t.length >= SHORT_STALE_PREMIUM_INTAKE_THRESHOLD;
}

function resolveIntakeWithMeta(
  passed?: string | null,
  draft?: ParsedDraftShape | null,
): {
  text: string;
  usedOriginalRaw: boolean;
  usedStorageRaw: boolean;
} {
  const hint = String(passed ?? "").trim();
  const session = readOriginalUserIntakeRaw().trim();
  if (session.length >= 20) {
    if (!hint || hint.length < 20) {
      return { text: session, usedOriginalRaw: true, usedStorageRaw: false };
    }
    if (
      /\b(?:Client|Service Provider):\s*/i.test(session) &&
      !/\b(?:Client|Service Provider):\s*/i.test(hint)
    ) {
      return { text: session, usedOriginalRaw: true, usedStorageRaw: false };
    }
    if (looksLikeStructuredDraftCoercion(hint, draft ?? null)) {
      return { text: session, usedOriginalRaw: true, usedStorageRaw: false };
    }
  }
  if (hint.length >= 20) return { text: hint, usedOriginalRaw: false, usedStorageRaw: false };
  if (session.length >= 20) return { text: session, usedOriginalRaw: true, usedStorageRaw: false };
  try {
    const storage = readAgreementCreatorIntakeStorage().trim();
    if (storage.length >= 20) return { text: storage, usedOriginalRaw: false, usedStorageRaw: true };
  } catch {
    /* ignore */
  }
  return { text: hint || session, usedOriginalRaw: session.length >= 20, usedStorageRaw: false };
}

export function extractFreeStarterPaymentTermsLine(text: string): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  const section = trimmed.match(/(?:^|\n)\s*(?:\d+\.\s*)?Payment Terms\s*\n([^\n]+)/i);
  if (section?.[1]) return section[1].trim();
  const amountLine = trimmed.match(/\$[\d,]+(?:\.\d{2})?[^\n.]*/i);
  return amountLine?.[0]?.trim() ?? "";
}

function repairPartyIdentityInPlain(
  body: string,
  intake: string,
  draft: ParsedDraftShape | null,
): { text: string; repairs: number } {
  let out = body;
  let repairs = 0;
  const legalEntities = labeledPartyLegalEntities(intake);
  if (legalEntities.length < 2) return { text: out, repairs: 0 };

  for (const party of draft?.parties ?? []) {
    const rawName = String(party?.name ?? "").trim();
    if (!rawName) continue;
    const isolated = isolateLegalEntityFromContaminatedName(rawName);
    const clean = sanitizeStarterPartyNameForDisplay(isolated || rawName);
    if (!clean || clean === rawName || !out.includes(rawName)) continue;
    logFreeStarterProtectedFactRepair({
      fact: "party_identity",
      before: rawName,
      after: clean,
      reason: "signer_contamination_in_legal_entity",
    });
    out = out.split(rawName).join(clean);
    repairs += 1;
  }

  for (const legal of legalEntities) {
    const short = legal.split(/\s+/).slice(0, 2).join(" ");
    if (short.length < 4 || !out.includes(short) || out.includes(legal)) continue;
    if (!new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(out)) continue;
    logFreeStarterProtectedFactRepair({
      fact: "party_identity",
      before: short,
      after: legal,
      reason: "expand_short_legal_entity_from_intake",
    });
    out = out.replace(new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), legal);
    repairs += 1;
  }

  return { text: out, repairs };
}

/** Block/repair protected intake facts on any candidate Free review body. */
export function guardFreeStarterProtectedFacts(
  body: string,
  repairedPreview: string,
  intake: string,
  draft: ParsedDraftShape | null,
): { text: string; repairCount: number } {
  const resolvedIntake = resolveStarterPreviewIntakeText(intake);
  if (!body.trim() || !resolvedIntake.trim()) return { text: body, repairCount: 0 };

  let out = body;
  let repairCount = 0;

  if (intakeDeclaresMonthlyInstallments(resolvedIntake)) {
    const before = extractFreeStarterPaymentTermsLine(out);
    const cadenceRepaired = repairStarterPaymentCadenceInPreviewPlain(out, resolvedIntake);
    if (cadenceRepaired !== out) {
      logFreeStarterProtectedFactRepair({
        fact: "payment_cadence",
        before,
        after: extractFreeStarterPaymentTermsLine(cadenceRepaired),
        reason: "intake_monthly_installments_over_api_completion",
      });
      out = cadenceRepaired;
      repairCount += 1;
    } else if (/\bupon completion of services\b/i.test(out)) {
      const installment =
        formatInstallmentPaymentTermsFromIntake(resolvedIntake) ||
        extractFreeStarterPaymentTermsLine(repairedPreview);
      if (installment) {
        logFreeStarterProtectedFactRepair({
          fact: "payment_cadence",
          before,
          after: installment,
          reason: "force_repaired_preview_payment",
        });
        out = repairStarterPaymentCadenceInPreviewPlain(repairedPreview || out, resolvedIntake);
        repairCount += 1;
      }
    }
  }

  const partyRepair = repairPartyIdentityInPlain(out, resolvedIntake, draft);
  out = partyRepair.text;
  repairCount += partyRepair.repairs;

  if (
    repairedPreview.trim() &&
    draftPaymentTermsLoseIntakeInstallmentCadence(extractFreeStarterPaymentTermsLine(out), resolvedIntake)
  ) {
    const before = extractFreeStarterPaymentTermsLine(out);
    out = repairStarterPaymentCadenceInPreviewPlain(repairedPreview, resolvedIntake);
    logFreeStarterProtectedFactRepair({
      fact: "payment_cadence",
      before,
      after: extractFreeStarterPaymentTermsLine(out),
      reason: "repaired_preview_payment_authority",
    });
    repairCount += 1;
  }

  return { text: out.trim(), repairCount };
}

function needsPaymentCadenceRepair(body: string, intake: string): boolean {
  if (!intakeDeclaresMonthlyInstallments(intake)) return false;
  return draftPaymentTermsLoseIntakeInstallmentCadence(extractFreeStarterPaymentTermsLine(body), intake);
}

/** True when hydrated/server starter preview is structured and free of known collapse artifacts. */
export function isCleanFreeStarterServerPreview(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length < 200) return false;
  if (starterCorpusContainsRawIntakeInstruction(t)) return false;
  if (starterPreviewHasGluedSectionHeadings(t)) return false;
  if (!starterPreviewHasParagraphSectionBreaks(t)) return false;
  if (/\bTerm:\s*\d+\s*\nmonths\s+Effective Date:/i.test(t)) return false;
  if (/Term:\s*\d+\s*$/m.test(t) && /\nmonths\s+Effective Date:/i.test(t)) return false;
  if (/Term:\s*\d+\s+months\s+Effective Date:/i.test(t)) return false;
  return true;
}

function buildRepairedStarterPreview(
  draft: ParsedDraftShape,
  intake: string,
  placeholderGate?: AgreementPreviewBuildOptions["placeholderGate"],
): string {
  const draftForBuild = intake.length > 0 ? enrichStarterPreviewPartiesFromIntake(draft, intake) : draft;
  return buildStarterAgreementPreviewForReview(draftForBuild, {
    intakeText: intake,
    placeholderGate,
  }).trim();
}

/**
 * Single canonical resolver for visible Free Starter review body text.
 * Priority order:
 * 1. Direct OpenAI free_document_text (when validation is "ok")
 * 2. Repaired starter preview (when intake is available)
 * 3. Authoritative/API alternates
 */
export function resolveFreeStarterReviewBody(
  args: ResolveFreeStarterReviewBodyArgs,
): ResolveFreeStarterReviewBodyResult {
  const draft = args.draft;
  const intakeMeta = resolveIntakeWithMeta(args.rawIntake, draft);
  const rawIntakeResolved = intakeMeta.text;

  const repairedPreview = draft ? buildRepairedStarterPreview(draft, rawIntakeResolved, args.placeholderGate) : "";

  const apiPaymentTerms = String(args.apiPayload?.payment_terms ?? draft?.payment_terms ?? "").trim();
  const repairedPaymentTerms = extractFreeStarterPaymentTermsLine(repairedPreview);

  // Check for direct OpenAI one-pager (highest priority when validation is "ok")
  const freeDocText = String(args.freeDocumentText ?? draft?.free_document_text ?? "").trim();
  const freeDocValidation = String(args.freeDocumentValidation ?? draft?.free_document_validation ?? "").trim();
  
  // If we have a valid free document from OpenAI, use it directly
  if (freeDocText && freeDocText.length >= 200 && freeDocValidation === "ok") {
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
      console.info("[free-starter-render-source]", {
        source: "free_openai_direct",
        rawIntakeResolved: rawIntakeResolved.length,
        usedOriginalRaw: intakeMeta.usedOriginalRaw,
        usedStorageRaw: intakeMeta.usedStorageRaw,
        apiPaymentTerms,
        repairedPaymentTerms,
        finalPaymentTerms: extractFreeStarterPaymentTermsLine(freeDocText),
        protectedFactRepairCount: 0,
        freeDocValidation,
      });
    }
    
    const normalized = normalizeFreeStarterSectionRender(freeDocText, {
      intake: rawIntakeResolved,
      draft,
    });

    const draftInputForDirectValidation = draft
      ? {
          title: draft.title,
          parties: (draft.parties || []).map((p) => ({ name: p.name })),
          purpose: draft.purpose,
          payment_terms: draft.payment_terms,
          duration: draft.duration,
          due_date: draft.due_date,
          effective_date: draft.effective_date,
          jurisdiction: draft.jurisdiction,
          payment: draft.payment ? { amount: draft.payment.amount } : null,
        }
      : null;
    const directValidation = validateFreeStarterGeneratedBody(
      normalized.text,
      rawIntakeResolved,
      draftInputForDirectValidation,
    );
    
    return {
      body: normalized.text.trim(),
      source: "free_openai_direct",
      rawIntakeResolved,
      usedOriginalRaw: intakeMeta.usedOriginalRaw,
      usedStorageRaw: intakeMeta.usedStorageRaw,
      apiPaymentTerms,
      repairedPaymentTerms,
      finalPaymentTerms: extractFreeStarterPaymentTermsLine(normalized.text),
      protectedFactRepairCount: 0,
      bodyValidation: directValidation,
    };
  }

  const authoritative = String(args.authoritativeBody ?? "").trim();
  const apiDoc = String(
    args.apiPayload?.document_text ?? args.apiPayload?.server_full_document_text ?? "",
  ).trim();
  const current = String(args.currentPreview ?? "").trim();

  const alternates: { text: string; source: FreeStarterRenderSource }[] = [];
  if (current) alternates.push({ text: current, source: "current_preview_repaired" });
  if (apiDoc && apiDoc !== current) alternates.push({ text: apiDoc, source: "api_payload_repaired" });
  if (authoritative && authoritative !== current && authoritative !== apiDoc) {
    alternates.push({ text: authoritative, source: "authoritative_hydrated_repaired" });
  }

  let body = repairedPreview;
  let source: FreeStarterRenderSource = "repaired_starter_preview";
  let protectedFactRepairCount = 0;

  const intakeBacked = rawIntakeResolved.length >= 20;
  const serverDraftReady = Boolean(args.hasDraftPayload);
  const cleanServerCandidate = alternates.find(
    (c) => isCleanFreeStarterServerPreview(c.text) && !starterCorpusContainsRawIntakeInstruction(c.text),
  );

  if (
    serverDraftReady &&
    cleanServerCandidate &&
    !needsPaymentCadenceRepair(cleanServerCandidate.text, rawIntakeResolved) &&
    !args.preferAlternate
  ) {
    body = cleanServerCandidate.text;
    source = cleanServerCandidate.source;
  } else if (intakeBacked && repairedPreview.trim() && !args.preferAlternate) {
    body = repairedPreview;
    source = "repaired_starter_preview";
  } else if (!body.trim() && alternates.length > 0) {
    const longest = alternates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    body = longest.text;
    source = longest.source;
  } else if (alternates.length > 0 && args.preferAlternate) {
    const longest = alternates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    body = longest.text;
    source = longest.source;
  }

  if (body.trim() && intakeBacked) {
    const guarded = guardFreeStarterProtectedFacts(body, repairedPreview, rawIntakeResolved, draft);
    body = guarded.text;
    protectedFactRepairCount += guarded.repairCount;

    if (
      repairedPreview.trim() &&
      intakeDeclaresMonthlyInstallments(rawIntakeResolved) &&
      draftPaymentTermsLoseIntakeInstallmentCadence(extractFreeStarterPaymentTermsLine(body), rawIntakeResolved)
    ) {
      body = repairedPreview;
      source = "repaired_starter_preview";
      protectedFactRepairCount += 1;
    }
  }

  const result: ResolveFreeStarterReviewBodyResult = {
    body: body.trim(),
    source,
    rawIntakeResolved,
    usedOriginalRaw: intakeMeta.usedOriginalRaw,
    usedStorageRaw: intakeMeta.usedStorageRaw,
    apiPaymentTerms,
    repairedPaymentTerms,
    finalPaymentTerms: extractFreeStarterPaymentTermsLine(body),
    protectedFactRepairCount,
    bodyValidation: null,
  };

  const normalized = normalizeFreeStarterSectionRender(result.body, {
    intake: rawIntakeResolved,
    draft,
  });
  result.body = normalized.text;
  result.finalPaymentTerms = extractFreeStarterPaymentTermsLine(result.body);

  const draftInput = draft
    ? {
        title: draft.title,
        parties: (draft.parties || []).map((p) => ({ name: p.name })),
        purpose: draft.purpose,
        payment_terms: draft.payment_terms,
        duration: draft.duration,
        due_date: draft.due_date,
        effective_date: draft.effective_date,
        jurisdiction: draft.jurisdiction,
        payment: draft.payment ? { amount: draft.payment.amount } : null,
      }
    : null;
  const validation = validateFreeStarterGeneratedBody(result.body, rawIntakeResolved, draftInput);
  result.bodyValidation = validation;

  logFreeStarterBodyValidation({
    stage: "resolve_free_starter_body",
    valid: validation.valid,
    reasons: validation.reasons,
    intakeTenets: validation.intakeScore,
    bodyLen: result.body.length,
  });

  logFreeStarterRenderSource({
    source: result.source,
    rawIntakeResolved: result.rawIntakeResolved.length,
    usedOriginalRaw: result.usedOriginalRaw,
    usedStorageRaw: result.usedStorageRaw,
    apiPaymentTerms: result.apiPaymentTerms,
    repairedPaymentTerms: result.repairedPaymentTerms,
    finalPaymentTerms: result.finalPaymentTerms,
    protectedFactRepairCount: result.protectedFactRepairCount,
  });

  return result;
}

/**
 * Evaluate whether a resolved free starter body is too hollow to display.
 *
 * When isHollow is true:
 * - shouldAskQuestions: show 2-5 simple missing-tenet questions (parties, payment, term, law)
 * - shouldRedirectToPro: when too many issues, redirect to Pro instead of questions
 *
 * A thin dump (like "Need someone to paint my fence") should never show an empty
 * Payment Terms or Governing Law section. It should ask for those details or redirect.
 */
export function evaluateHollowBodyGate(
  resolveResult: ResolveFreeStarterReviewBodyResult,
): HollowBodyGateResult {
  const validation = resolveResult.bodyValidation;

  if (!validation || validation.valid) {
    return {
      isHollow: false,
      missingTenets: [],
      shouldAskQuestions: false,
      shouldRedirectToPro: false,
      reasons: [],
    };
  }

  const missingTenets: HollowBodyTenet[] = [];

  if (validation.rolePlaceholderParties || validation.missingNamedParties.length > 0) {
    missingTenets.push("parties");
  }

  for (const hollow of validation.hollowSections) {
    if (hollow.includes("payment") && !missingTenets.includes("payment")) {
      missingTenets.push("payment");
    }
    if (hollow.includes("term") && !missingTenets.includes("term")) {
      missingTenets.push("term");
    }
    if (hollow.includes("governing_law") && !missingTenets.includes("governing_law")) {
      missingTenets.push("governing_law");
    }
  }

  if (!validation.intakeScore.parties && !missingTenets.includes("parties")) {
    missingTenets.push("parties");
  }
  if (!validation.intakeScore.payment && !missingTenets.includes("payment")) {
    if (validation.hollowSections.some((h) => h.includes("payment"))) {
      missingTenets.push("payment");
    }
  }
  if (!validation.intakeScore.term && !missingTenets.includes("term")) {
    if (validation.hollowSections.some((h) => h.includes("term"))) {
      missingTenets.push("term");
    }
  }
  if (!validation.intakeScore.governingLaw && !missingTenets.includes("governing_law")) {
    if (validation.hollowSections.some((h) => h.includes("governing_law"))) {
      missingTenets.push("governing_law");
    }
  }

  const issueCount = missingTenets.length;
  const shouldRedirectToPro = issueCount >= 4;
  const shouldAskQuestions = !shouldRedirectToPro && issueCount > 0;

  return {
    isHollow: true,
    missingTenets,
    shouldAskQuestions,
    shouldRedirectToPro,
    reasons: validation.reasons,
  };
}

export function logHollowBodyGate(payload: {
  isHollow: boolean;
  missingTenets: HollowBodyTenet[];
  shouldAskQuestions: boolean;
  shouldRedirectToPro: boolean;
  reasons: string[];
  bodyLen: number;
  intakeLen: number;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-hollow-body-gate]", payload);
}
