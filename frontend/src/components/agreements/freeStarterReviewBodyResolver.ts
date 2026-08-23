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
  // Redirect for all failure cases: missing_parties, missing_tenets, incomplete_sentences, generation_failed, hollow_body
  return true;
}

/**
 * Role-only placeholder names that are NOT real legal parties.
 * These should never appear as the actual party name in a painted free page.
 */
const HOLLOW_PARTY_NAMES = new Set([
  "client", "service provider", "serviceprovider", "service_provider",
  "contractor", "vendor", "provider", "consultant", "freelancer",
  "buyer", "seller", "lessor", "lessee", "landlord", "tenant",
  "employer", "employee", "hirer", "worker", "agency", "agent",
  "licensor", "licensee", "franchisor", "franchisee",
  "party", "parties", "party a", "party b", "party 1", "party 2",
  "first party", "second party", "the party", "the parties",
  "person", "company", "business", "entity", "organization", "org",
  "individual", "corporation", "firm",
]);

/**
 * Question-opener words that get scraped as party names from thin dumps like
 * "Can someone watch my dog?" -> "Can" becomes the party name.
 */
const SCRAPED_QUESTION_WORDS = new Set([
  "can", "need", "looking", "please", "someone", "anyone", "help",
  "want", "would", "could", "should", "will", "does", "has", "have",
  "who", "what", "where", "when", "how", "why", "which",
  "hi", "hello", "hey", "thanks", "thank", "i", "we", "my", "our",
  "the", "a", "an", "this", "that", "it", "is", "are", "was", "were",
]);

/**
 * Returns true if a party name is hollow (role placeholder or scraped question word).
 */
export function isHollowPartyName(name: string | null | undefined): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
  if (!normalized) return true;
  if (HOLLOW_PARTY_NAMES.has(normalized)) return true;
  if (SCRAPED_QUESTION_WORDS.has(normalized)) return true;
  // Single short word is suspicious
  if (normalized.length <= 3 && /^[a-z]+$/i.test(normalized)) return true;
  return false;
}

/**
 * Detects hollow/empty section patterns in free document body.
 * Returns true if Payment Terms or Governing Law sections exist but have no content.
 */
function hasHollowSections(body: string): boolean {
  const lines = body.split("\n");
  const sectionHeadings = ["payment terms", "governing law"];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    const isSection = sectionHeadings.some(
      h => line === h || line.match(new RegExp(`^\\d+\\.\\s*${h}\\s*$`))
    );
    
    if (isSection) {
      // Look at next few lines for content
      let hasContent = false;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;
        // If next non-empty line is another section heading, this section is empty
        if (/^\d+\.\s*\w/.test(nextLine)) break;
        if (sectionHeadings.some(h => nextLine.toLowerCase().startsWith(h))) break;
        // Check for placeholder content
        const placeholders = [
          /^to be agreed/i,
          /^as stated in the agreement/i,
          /^as agreed/i,
          /^tbd/i,
          /^n\/a/i,
          /^none/i,
          /^commercial arrangement to be agreed/i,
          /^terms to be agreed/i,
          /^termination terms to be agreed/i,
        ];
        if (placeholders.some(p => p.test(nextLine))) continue;
        hasContent = true;
        break;
      }
      if (!hasContent) return true;
    }
  }
  return false;
}

/**
 * Known truncation/corruption patterns that indicate broken AI output.
 * These should NEVER appear in a valid free document.
 */
const CORRUPTED_OUTPUT_PATTERNS = [
  /\bcovers\s+due\.\s*Work/i,
  /\bdue\.\s+Work\b/i,
  /\bThis agreement covers\s*\.\s/i,
  /\bScope:\s*\.\s/i,
  /\bPurpose:\s*\.\s/i,
];

/**
 * Check if body contains corrupted/truncated AI output patterns.
 */
function hasCorruptedOutput(body: string): boolean {
  return CORRUPTED_OUTPUT_PATTERNS.some(p => p.test(body));
}

/**
 * Extract named parties from intake text (common patterns).
 */
function extractNamedPartiesFromIntake(intake: string): string[] {
  const names: string[] = [];
  
  // Pattern: "Name of Company hires/hiring Name"
  const hiresMatch = intake.match(
    /\b([A-Z][a-zA-Z\s]+(?:\s+(?:LLC|Inc\.?|Corp\.?|Studio|Company|Co\.?))?)\s+(?:of\s+[A-Za-z\s]+?)?\s*(?:is\s+)?(?:hires?|hiring)\s+([A-Z][a-zA-Z\s]+)/i
  );
  if (hiresMatch) {
    const p1 = hiresMatch[1].trim().replace(/\s+of\s*$/i, "");
    const p2 = hiresMatch[2].trim();
    if (p1 && !isHollowPartyName(p1)) names.push(p1);
    if (p2 && !isHollowPartyName(p2)) names.push(p2);
  }
  
  // Pattern: "between A and B"
  const betweenMatch = intake.match(
    /\bbetween\s+([A-Z][a-zA-Z\s]+(?:\s+(?:LLC|Inc\.?|Corp\.?|Studio|Company|Co\.?))?)\s+and\s+([A-Z][a-zA-Z\s]+)/i
  );
  if (betweenMatch && names.length === 0) {
    const p1 = betweenMatch[1].trim();
    const p2 = betweenMatch[2].trim();
    if (p1 && !isHollowPartyName(p1)) names.push(p1);
    if (p2 && !isHollowPartyName(p2)) names.push(p2);
  }
  
  // Pattern: "my friend/colleague Name"
  const friendMatch = intake.match(
    /\bmy\s+(?:friend|colleague|neighbor|partner|associate)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/i
  );
  if (friendMatch) {
    const name = friendMatch[1].trim();
    if (name && !isHollowPartyName(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  
  // Pattern: "Name is the client/designer/provider"
  const roleMatch = intake.matchAll(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+is\s+the\s+(?:client|designer|provider|contractor|consultant)/gi
  );
  for (const match of roleMatch) {
    const name = match[1].trim();
    if (name && !isHollowPartyName(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  
  return names.slice(0, 4);
}

/**
 * Extract jurisdiction/state from intake text.
 */
function extractJurisdictionFromIntake(intake: string): string | null {
  const intakeLower = intake.toLowerCase();
  const states = [
    "texas", "california", "new york", "delaware", "florida", "arizona",
    "nevada", "washington", "illinois", "colorado", "georgia", "north carolina",
    "virginia", "pennsylvania", "ohio", "michigan", "massachusetts", "tennessee",
    "oregon", "new jersey", "maryland", "minnesota", "wisconsin", "indiana",
    "missouri", "connecticut", "kentucky", "alabama", "south carolina", "louisiana",
    "oklahoma", "iowa", "utah", "kansas", "arkansas", "nebraska", "mississippi",
    "new mexico", "west virginia", "idaho", "hawaii", "maine", "new hampshire",
    "rhode island", "montana", "vermont", "alaska", "south dakota", "north dakota",
    "wyoming"
  ];
  
  const lawMatch = intake.match(/\bgoverning\s+law\s+(?:is|:)?\s*([a-zA-Z\s]+)/i);
  if (lawMatch) {
    const candidate = lawMatch[1].trim().toLowerCase();
    if (states.includes(candidate)) return candidate;
  }
  
  for (const state of states) {
    if (intakeLower.includes(state)) return state;
  }
  
  return null;
}

/**
 * Simple frontend-side hollow body check for direct body/parties input.
 * Used as belt-and-suspenders check in case backend validation passes but body is still hollow.
 */
export function evaluateSimpleHollowBodyGate(
  body: string | null | undefined,
  parties: { name: string; role: string }[] | null | undefined,
  options?: {
    intake?: string | null;
    jurisdiction?: string | null;
  },
): { isHollow: boolean; reason: string | null } {
  const text = (body ?? "").trim();
  if (!text || text.length < 200) {
    return { isHollow: true, reason: "body_too_short" };
  }
  
  // Check for corrupted/truncated output patterns (e.g., "covers due. Work.")
  if (hasCorruptedOutput(text)) {
    return { isHollow: true, reason: "corrupted_output" };
  }
  
  // Check for role-only party names in the opening
  const openingMatch = text.match(
    /entered into by and between[:\s]*([^()\n]+?)\s*(?:\([^)]*\))?\s*and\s*([^()\n]+?)(?:\s*\([^)]*\))?(?:\s*\(collectively|\.|\n)/i
  );
  if (openingMatch) {
    const p1 = openingMatch[1].trim().replace(/^["']|["']$/g, "");
    const p2 = openingMatch[2].trim().replace(/^["']|["']$/g, "");
    if (isHollowPartyName(p1) && isHollowPartyName(p2)) {
      return { isHollow: true, reason: "role_only_parties_in_body" };
    }
    
    // If intake has named parties, body must have real names (not role placeholders)
    const intake = options?.intake ?? "";
    if (intake.length >= 20) {
      const intakeNames = extractNamedPartiesFromIntake(intake);
      if (intakeNames.length >= 2) {
        // Intake has named parties - body should not have hollow party names
        if (isHollowPartyName(p1) || isHollowPartyName(p2)) {
          return { isHollow: true, reason: "intake_named_parties_but_body_has_placeholders" };
        }
      }
    }
  }
  
  // Check parties array from draft
  if (parties && parties.length >= 2) {
    const hollowCount = parties.filter(p => isHollowPartyName(p.name)).length;
    if (hollowCount >= 2) {
      return { isHollow: true, reason: "role_only_parties_in_draft" };
    }
  }
  
  // Check for hollow Payment/Law sections
  if (hasHollowSections(text)) {
    return { isHollow: true, reason: "hollow_sections" };
  }
  
  // Check for missing payment amount AND missing governing law
  const hasPaymentAmount = /\$[\d,]+/.test(text);
  const knownStates = /(texas|california|new york|delaware|florida|arizona|nevada|washington|illinois|colorado|georgia|north carolina|virginia|pennsylvania|ohio|michigan|massachusetts|tennessee)/i;
  const hasGoverningLaw = knownStates.test(text);
  
  if (!hasPaymentAmount && !hasGoverningLaw) {
    return { isHollow: true, reason: "missing_payment_and_law" };
  }
  
  // Check if intake specified a jurisdiction but body doesn't have it
  const intakeJurisdiction = options?.jurisdiction || (options?.intake ? extractJurisdictionFromIntake(options.intake) : null);
  if (intakeJurisdiction) {
    const bodyLower = text.toLowerCase();
    if (!bodyLower.includes(intakeJurisdiction.toLowerCase())) {
      // Body is missing the jurisdiction from intake
      // Check if body has "to be agreed" or similar placeholder for governing law
      if (/governing law[:\s]*\n?\s*(?:to be agreed|tbd|n\/a)/i.test(text)) {
        return { isHollow: true, reason: "intake_jurisdiction_dropped" };
      }
    }
  }
  
  return { isHollow: false, reason: null };
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
  /** When true, the body is hollow and should NOT paint on the free page. */
  hollowBodyBlocked: boolean;
  /** Reason why the hollow body gate blocked, or null if not blocked. */
  hollowBodyReason: string | null;
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
  console.info("[hollow-body-gate]", payload);
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
    
    // Run validation on the direct free document
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
    
    // Simple hollow body gate (belt and suspenders) - catches role-only parties and empty sections
    const simpleHollowGate = evaluateSimpleHollowBodyGate(normalized.text, draft?.parties ?? null, {
      intake: rawIntakeResolved,
      jurisdiction: draft?.jurisdiction ?? null,
    });
    
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
      hollowBodyBlocked: simpleHollowGate.isHollow,
      hollowBodyReason: simpleHollowGate.reason,
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

  const normalized = normalizeFreeStarterSectionRender(body.trim(), {
    intake: rawIntakeResolved,
    draft,
  });

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
  const validation = validateFreeStarterGeneratedBody(normalized.text, rawIntakeResolved, draftInput);

  logFreeStarterBodyValidation({
    stage: "resolve_free_starter_body",
    valid: validation.valid,
    reasons: validation.reasons,
    intakeTenets: validation.intakeScore,
    bodyLen: normalized.text.length,
  });

  // Simple hollow body gate (belt and suspenders) - catches role-only parties and empty sections
  const simpleHollowGate = evaluateSimpleHollowBodyGate(normalized.text, draft?.parties ?? null, {
    intake: rawIntakeResolved,
    jurisdiction: draft?.jurisdiction ?? null,
  });

  const result: ResolveFreeStarterReviewBodyResult = {
    body: normalized.text,
    source,
    rawIntakeResolved,
    usedOriginalRaw: intakeMeta.usedOriginalRaw,
    usedStorageRaw: intakeMeta.usedStorageRaw,
    apiPaymentTerms,
    repairedPaymentTerms,
    finalPaymentTerms: extractFreeStarterPaymentTermsLine(normalized.text),
    protectedFactRepairCount,
    bodyValidation: validation,
    hollowBodyBlocked: simpleHollowGate.isHollow,
    hollowBodyReason: simpleHollowGate.reason,
  };

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
    // Also check simple hollow gate
    if (!resolveResult.hollowBodyBlocked) {
      return {
        isHollow: false,
        missingTenets: [],
        shouldAskQuestions: false,
        shouldRedirectToPro: false,
        reasons: [],
      };
    }
  }

  const missingTenets: HollowBodyTenet[] = [];
  const reasons: string[] = [];

  if (validation) {
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
      if (hollow.includes("governing") && !missingTenets.includes("governing_law")) {
        missingTenets.push("governing_law");
      }
    }

    reasons.push(...validation.reasons);
  }

  // Also add reasons from simple hollow gate if present
  if (resolveResult.hollowBodyReason && !reasons.includes(resolveResult.hollowBodyReason)) {
    reasons.push(resolveResult.hollowBodyReason);
  }

  const shouldAskQuestions = missingTenets.length >= 1 && missingTenets.length <= 3;
  const shouldRedirectToPro = missingTenets.length >= 4 || reasons.length >= 4;

  return {
    isHollow: true,
    missingTenets,
    shouldAskQuestions,
    shouldRedirectToPro,
    reasons,
  };
}
