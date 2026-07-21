/**
 * Free Starter supports lightweight 1–2 party drafts only.
 * Complex intakes route to Pro before parseDraft, snapshots, or signer metadata.
 */
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { parseLabeledPartyBlocks, resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import { maxNumberedListPartyIndex } from "./partySlotIdentityNormalize";
import { countRealParties } from "./starterPartyLimits";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  readLegalPartyNamesFromAuthority,
} from "./legalPartyAuthority";
import { resolveLegalPartyAuthorityForIntake } from "./legalPartyAuthoritySession";

const COORDINATOR_BLOCK_HEADER_RE = /^\s*coordinator\s*[:\-]?\s*$/i;
const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;

export type StarterComplexityGateReason =
  | "three_plus_legal_parties"
  | "revenue_share_or_allocation"
  | "coordinator_or_non_party_actor"
  | "multi_signer_workflow"
  | "review_approval_workflow"
  | "joint_venture_or_multi_vendor_structure"
  | "multi_provider_payment";

/** @deprecated Use StarterComplexityGateReason */
export type StarterMultiPartyProGateReason = StarterComplexityGateReason;

export type StarterComplexityGateAssessment = {
  required: boolean;
  reasons: StarterComplexityGateReason[];
  parties: string[];
  coordinatorName: string | null;
  keyTerms: string[];
  partyCount: number;
  hasRevenueShare: boolean;
  hasCoordinator: boolean;
  hasReviewWorkflow: boolean;
  hasMultiProviderPayment: boolean;
};

/** @deprecated Use StarterComplexityGateAssessment */
export type StarterMultiPartyProGateAssessment = StarterComplexityGateAssessment;

const EMPTY_PAYMENT = { amount: null as number | null, cadence: null as string | null, valid: false };

export function emptyStarterCheckoutPendingShell(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

/** Parse coordinator name from a labeled Coordinator block (not a signing party). */
export function parseCoordinatorNameFromIntake(raw: string): string | null {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let inCoordinator = false;
  let name = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (COORDINATOR_BLOCK_HEADER_RE.test(line)) {
      inCoordinator = true;
      continue;
    }
    if (PARTY_BLOCK_HEADER_RE.test(line)) {
      if (inCoordinator) break;
      inCoordinator = false;
      continue;
    }
    if (inCoordinator) {
      const nameMatch = line.match(/^\s*name\s*[:\-]\s*(.+)$/i);
      if (nameMatch?.[1]) {
        name = nameMatch[1].replace(/\s+/g, " ").trim();
      }
    }
  }
  return name.length >= 2 ? name : null;
}

export function intakeHasCoordinatorBlock(raw: string): boolean {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  return lines.some((line) => COORDINATOR_BLOCK_HEADER_RE.test(line.trim()));
}

function maxIndexedPartyOrSigner(raw: string): number {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  let max = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const party = line.match(/^party\s*(\d+)\s*[:\-]?\s*$/i);
    if (party?.[1]) max = Math.max(max, Number.parseInt(party[1], 10));
    const signer = line.match(/^signer\s*(\d+)\s*[:\-]/i);
    if (signer?.[1]) max = Math.max(max, Number.parseInt(signer[1], 10));
  }
  return max;
}

function countSignerDetailSlots(raw: string): number {
  const labeled = parseLabeledPartyBlocks(raw).filter((b) => b.legalEntity.trim().length >= 2);
  const withSigner = labeled.filter((b) => b.signerName || b.signerEmail || b.signerTitle).length;
  const signerNameLines = (raw.match(/^\s*signer\s+name\s*[:\-]/gim) ?? []).length;
  return Math.max(withSigner, signerNameLines, labeled.length, maxIndexedPartyOrSigner(raw));
}

export function detectRevenueShareLanguage(raw: string): boolean {
  return (
    /\b(?:revenue|profit|royalt(?:y|ies))\s*(?:share|sharing|split|allocation)\b/i.test(raw) ||
    /\b(?:revenue|profit)\s+share\b/i.test(raw) ||
    /\brevenue\b[\s\S]{0,160}\bshared\b/i.test(raw) ||
    /\b\d+(?:\.\d+)?\s*%\s*(?:of\s+)?(?:revenue|profit|royalt)/i.test(raw) ||
    /\bpercentage\s+allocation\b/i.test(raw) ||
    /\b(?:split|allocated|distributed)\s+(?:as\s+)?\d+(?:\.\d+)?\s*%/i.test(raw)
  );
}

/** Count distinct percentage allocations in revenue-share context (multi-party split signal). */
export function countRevenueSharePercentages(raw: string): number {
  const text = String(raw || "");
  const revenueSlice =
    text.match(/\b(?:revenue|profit|royalt(?:y|ies))[\s\S]{0,1600}/i)?.[0] ?? text;
  const hits = revenueSlice.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  return hits.length;
}

export function detectMultiPartyCollaborationProse(raw: string): boolean {
  const text = String(raw || "");
  return (
    /\b(?:four|4|three|3|five|5)\s+(?:companies|parties|entities|organizations|firms)\b/i.test(text) ||
    /\b(?:all|each)\s+parties\b/i.test(text) ||
    /\bjointly\s+(?:market|develop|own|operate|license)\b/i.test(text) ||
    /\bpartnership\s+among\b/i.test(text) ||
    /\bcollaboration\s+agreement\b/i.test(text) ||
    /\bjointly\s+developed\s+(?:ip|intellectual\s+property|platform|software)\b/i.test(text) ||
    /\b(?:platform|logistics)\s+(?:partnership|collaboration)\b/i.test(text) ||
    /\b(?:multi[\s-]party|multiple\s+parties)\s+(?:partnership|agreement|collaboration|revenue)\b/i.test(text) ||
    /\b(?:quadripartite|tripartite)\b/i.test(text)
  );
}

const DURATION_COUNT_RE =
  /\b(?:one|two|three|3|four|4|five|5|six|6)\s+(?:months?|weeks?|days?|years?)\b/i;

export function detectSignerCandidateOverflow(raw: string): boolean {
  const text = String(raw || "");
  const hasExplicitSignerCount =
    /\b(?:three|3|four|4|five|5)\s+authorized\s+representatives?\b/i.test(text) ||
    /\b(?:three|3|four|4|five|5)\s+(?:signers?|signatories)\b/i.test(text);
  const indexed = maxIndexedPartyOrSigner(text);
  const slots = countSignerDetailSlots(text);
  if (!hasExplicitSignerCount && indexed < 3 && slots < 3 && DURATION_COUNT_RE.test(text)) {
    return false;
  }
  return hasExplicitSignerCount || indexed >= 3 || slots >= 3;
}

function detectCoordinatorOrNonPartyActor(raw: string): boolean {
  if (intakeHasCoordinatorBlock(raw)) return true;
  return (
    /\bnot\s+signing\s+as\s+a\s+party\b/i.test(raw) ||
    /\bcoordinator(?:ing)?\s+this\s+agreement\b/i.test(raw) ||
    /\b(?:project|agreement)\s+coordinator\b/i.test(raw)
  );
}

function detectReviewApprovalWorkflow(raw: string): boolean {
  return (
    /\b(?:review\s+(?:and\s+)?approv|approval\s+workflow|request(?:ed)?\s+changes|review\s+link|counterparty\s+review)\b/i.test(
      raw,
    ) || /\b(?:approve|approval)\s+(?:before|prior\s+to)\s+(?:sign|send|execution)\b/i.test(raw)
  );
}

function detectJointVentureOrMultiVendorStructure(raw: string): boolean {
  return (
    /\b(?:joint\s+venture|consortium|multi[\s-]vendor|implementation\s+partner|quadripartite|tripartite)\b/i.test(
      raw,
    ) ||
    /\b(?:multi[\s-]party|multiple\s+parties|among\s+the\s+parties)\b/i.test(raw)
  );
}

function isGenericInstallmentPaymentLanguage(raw: string): boolean {
  return /\b(?:monthly\s+payment|monthly\s+payments|paid\s+monthly|payment\s+monthly|per\s+month)\b/i.test(
    raw,
  );
}

function detectMultiProviderPayment(raw: string, resolvedPartyCount: number): boolean {
  if (resolvedPartyCount < 2) return false;

  if (isGenericInstallmentPaymentLanguage(raw)) {
    const explicitMultiProvider =
      /\b(?:each\s+(?:party|provider|vendor|contractor)|multiple\s+(?:providers|vendors|contractors)|multi[\s-]provider|multi[\s-]vendor)\b/i.test(
        raw,
      );
    if (!explicitMultiProvider) return false;
  }

  if (
    /\b(?:each\s+(?:party|provider|vendor|contractor)|multiple\s+(?:providers|vendors|contractors)|multi[\s-]provider|multi[\s-]vendor)\b/i.test(
      raw,
    ) &&
    /\b(?:payment|fee|fees|payable|invoice|compensation)\b/i.test(raw)
  ) {
    return true;
  }

  return (
    /\b(?:each\s+party|all\s+parties)\b/i.test(raw) &&
    /\b(?:fee|payment|payable)\b/i.test(raw) &&
    resolvedPartyCount >= 3
  );
}

/** @deprecated */
export function hasRevenueShareAcrossThreePlusNamedEntities(raw: string, partyNames: string[]): boolean {
  if (!detectRevenueShareLanguage(raw)) return false;
  const revenueSlice = raw.match(/\brevenue\s*(?:share|sharing|split)\b[\s\S]{0,800}/i)?.[0] ?? raw;
  const pctHits = revenueSlice.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  if (pctHits.length >= 3) return true;
  const low = raw.toLowerCase();
  let namedWithShare = 0;
  for (const party of partyNames) {
    const tokens = party
      .replace(/\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|LP|Ltd\.?)\.?$/i, "")
      .trim()
      .toLowerCase();
    if (tokens.length < 4) continue;
    if (low.includes(party.toLowerCase()) || low.includes(tokens)) namedWithShare += 1;
  }
  return namedWithShare >= 3 && pctHits.length >= 1;
}

function extractKeyTermsSummary(raw: string, flags: {
  hasRevenueShare: boolean;
  hasReviewWorkflow: boolean;
  hasMultiProviderPayment: boolean;
}): string[] {
  const terms: string[] = [];
  const text = String(raw || "");

  const termLine =
    text.match(/\bterm\s*[:\-]\s*([^\n.]{4,80})/i)?.[1] ??
    text.match(/\b(?:twenty|thirty|forty|fifty|\d+)[^\n.]{0,40}months?\b/i)?.[0];
  if (termLine) {
    const cleaned = termLine.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (cleaned) terms.push(cleaned.toLowerCase().includes("month") ? cleaned : `${cleaned} term`);
  }

  const law =
    text.match(/\b(?:governing law|jurisdiction)\s*[:\-]\s*([^\n.]{3,40})/i)?.[1] ??
    text.match(/\b([A-Za-z][A-Za-z\s]{2,24})\s+law\s+governs\b/i)?.[1];
  if (law) {
    const lawLabel = law.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    terms.push(lawLabel.toLowerCase().includes("law") ? lawLabel : `${lawLabel} law`);
  }

  if (flags.hasMultiProviderPayment || (/\$[\d,]+/i.test(text) && /\b(?:payment|fee|milestone|monthly)\b/i.test(text))) {
    terms.push("provider fees");
  }

  if (flags.hasRevenueShare) {
    terms.push("third-party licensing revenue share");
  }

  if (flags.hasReviewWorkflow) {
    terms.push("review workflow");
  }

  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, 6);
}

export function assessStarterComplexityGate(raw: string): StarterComplexityGateAssessment {
  const intake = String(raw || "").trim();
  const legalAuthority = resolveLegalPartyAuthorityForIntake(intake);
  const authorityPartyNames = readLegalPartyNamesFromAuthority(legalAuthority.parties);
  const parties =
    authorityPartyNames.length >= 2 ? authorityPartyNames : resolveStarterGatePartyLegalEntities(intake);
  const extractedEntityCount = parties.length;
  const indexedPartyMax = maxIndexedPartyOrSigner(intake);
  const numberedPartyMax = maxNumberedListPartyIndex(intake);
  const signerSlots = countSignerDetailSlots(intake);
  const partyCount = Math.max(extractedEntityCount, indexedPartyMax, numberedPartyMax);
  const revenuePctCount = countRevenueSharePercentages(intake);
  const hasRevenueShare = detectRevenueShareLanguage(intake);
  const hasCoordinator = detectCoordinatorOrNonPartyActor(intake);
  const hasReviewWorkflow = detectReviewApprovalWorkflow(intake);
  const hasMultiProviderPayment = detectMultiProviderPayment(intake, partyCount);
  const hasMultiPartyProse = detectMultiPartyCollaborationProse(intake);
  const hasSignerOverflow = detectSignerCandidateOverflow(intake);
  const reasons: StarterComplexityGateReason[] = [];

  if (extractedEntityCount > 2 || indexedPartyMax >= 3 || numberedPartyMax >= 3) {
    reasons.push("three_plus_legal_parties");
  }
  if (hasRevenueShare && (partyCount >= 2 || revenuePctCount >= 3)) {
    reasons.push("revenue_share_or_allocation");
  }
  if (revenuePctCount >= 3) {
    reasons.push("revenue_share_or_allocation");
  }
  if (hasCoordinator && partyCount >= 2) {
    reasons.push("coordinator_or_non_party_actor");
  }
  if (hasSignerOverflow) {
    reasons.push("multi_signer_workflow");
  }
  if (hasReviewWorkflow) {
    reasons.push("review_approval_workflow");
  }
  if (hasMultiPartyProse && (extractedEntityCount > 2 || revenuePctCount >= 3 || indexedPartyMax >= 3)) {
    reasons.push("joint_venture_or_multi_vendor_structure");
  }
  if (detectJointVentureOrMultiVendorStructure(intake) && partyCount >= 2) {
    reasons.push("joint_venture_or_multi_vendor_structure");
  }
  if (hasMultiProviderPayment) {
    reasons.push("multi_provider_payment");
  }

  const uniqueReasons = [...new Set(reasons)];

  const assessment: StarterComplexityGateAssessment = {
    required: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    parties,
    coordinatorName: parseCoordinatorNameFromIntake(intake),
    keyTerms: extractKeyTermsSummary(intake, { hasRevenueShare, hasReviewWorkflow, hasMultiProviderPayment }),
    partyCount,
    hasRevenueShare,
    hasCoordinator,
    hasReviewWorkflow,
    hasMultiProviderPayment,
  };

  if (import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[starter-complexity-gate]", {
      blocked: assessment.required,
      reasons: assessment.reasons,
      reasonCodes: assessment.reasons,
      partyCount: assessment.partyCount,
      extractedEntityCount,
      signerSlots,
      revenuePctCount,
      hasMultiPartyProse,
      hasSignerOverflow,
      resolvedParties: assessment.parties,
      hasRevenueShare: assessment.hasRevenueShare,
      hasCoordinator: assessment.hasCoordinator,
      hasReviewWorkflow: assessment.hasReviewWorkflow,
      hasMultiProviderPayment: assessment.hasMultiProviderPayment,
      rawLen: intake.length,
    });
  }

  return assessment;
}

/** @deprecated Use assessStarterComplexityGate */
export const assessStarterMultiPartyProRequirement = assessStarterComplexityGate;

/** Post-parse safety: reject starter drafts that slipped past pre-generation gate. */
export function rejectIneligibleStarterDraftAfterParse(
  rawIntake: string,
  parsed: ParsedDraftShape,
): boolean {
  const gate = assessStarterComplexityGate(rawIntake);
  if (gate.required) return true;
  if (countRealParties(parsed.parties) > 2) return true;
  try {
    const preview = buildAgreementPreviewText(parsed, {
      starterPreview: true,
      intakeText: rawIntake,
    });
    if (starterPreviewHasCorruptedPartyPlaceholderText(preview)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Hard invariant: starter output must never show ORG overflow / percentage party garbage. */
export function starterPreviewHasCorruptedPartyPlaceholderText(text: string): boolean {
  const body = String(text || "");
  if (!body.trim()) return false;
  if (/\bParty\s+[c^TO]%/i.test(body)) return true;
  if (/\bapplicable Party\s*[%^TO]/i.test(body)) return true;
  if (/\bParty\s+[a-z]\s*%/i.test(body)) return true;
  if (/\[ORG_[34]\]/i.test(body)) return true;
  if (/\bthe applicable Party\b/i.test(body) && /\d+(?:\.\d+)?\s*%/.test(body)) return true;
  return false;
}

export const STARTER_PREPARING_OVERLAY_DISPLAY_PHASES = [
  "preparing_review",
  "generating_draft",
  "hydrating_generated",
] as const;

export function isThreePlusLegalPartyGate(assessment: StarterComplexityGateAssessment): boolean {
  return (
    assessment.partyCount >= 3 ||
    assessment.parties.length >= 3 ||
    assessment.reasons.includes("three_plus_legal_parties")
  );
}

export function resolveMultiPartyProGatePartyCount(assessment: StarterComplexityGateAssessment): number {
  return Math.max(assessment.partyCount, assessment.parties.length, 3);
}

export function buildMultiPartyProGateTitle(assessment: StarterComplexityGateAssessment): string {
  const count = resolveMultiPartyProGatePartyCount(assessment);
  return `This agreement includes ${count} parties and requires Pro.`;
}

export const MULTI_PARTY_PRO_GATE_BODY =
  "Starter drafts support simple 1–2 party agreements. Pro supports multi-party agreements, custom roles, review, signing, and proof records.";

export const MULTI_PARTY_PRO_GATE_PRIMARY_CTA = "Continue with Pro";

export const LEGACY_COMPLEXITY_GATE_TITLE = "Complex agreement detected";
export const LEGACY_COMPLEXITY_GATE_BODY =
  "This looks like a multi-party or advanced agreement. LawDog Pro is required to preserve all parties, signer roles, revenue-share terms, review steps, and signature blocks.";

export function resolveStarterMultiPartyProGatePresentation(assessment: StarterComplexityGateAssessment): {
  title: string;
  body: string;
  primaryCtaLabel: string;
  showSimplifiedStarterOption: boolean;
  hideStarterReviewCta: boolean;
} {
  if (isThreePlusLegalPartyGate(assessment)) {
    return {
      title: buildMultiPartyProGateTitle(assessment),
      body: MULTI_PARTY_PRO_GATE_BODY,
      primaryCtaLabel: MULTI_PARTY_PRO_GATE_PRIMARY_CTA,
      showSimplifiedStarterOption: false,
      hideStarterReviewCta: true,
    };
  }
  return {
    title: LEGACY_COMPLEXITY_GATE_TITLE,
    body: LEGACY_COMPLEXITY_GATE_BODY,
    primaryCtaLabel: "Build Pro agreement",
    showSimplifiedStarterOption: false,
    hideStarterReviewCta: true,
  };
}

export function shouldHideStarterReviewCtaForCreateFlowPhase(createFlowPhase: string): boolean {
  return createFlowPhase === "multi_party_pro_required";
}

/** Dismiss home/create transition once Pro gate is ready without a starter draft. */
export function shouldResolveStarterHomeTransitionToReviewReady(input: {
  draft: unknown;
  createUiStage: string;
  createFlowPhase: string;
  isGenerating: boolean;
  starterMultiPartyProGate?: unknown;
}): boolean {
  if (
    input.createFlowPhase === "multi_party_pro_required" &&
    Boolean(input.starterMultiPartyProGate)
  ) {
    return true;
  }
  if (input.createFlowPhase === "complexity_choice_required") {
    return true;
  }
  return (
    Boolean(input.draft) &&
    input.createUiStage === "DRAFT" &&
    (input.createFlowPhase === "draft_ready_for_review" || (!input.isGenerating && Boolean(input.draft)))
  );
}

/** Safety: dismiss "Preparing your agreement" overlay once Pro gate is applied without a draft. */
export function shouldDismissStarterPreparingOverlayForProGate(input: {
  createFlowPhase: string;
  hasDraft: boolean;
  displayPhase: string;
}): boolean {
  if (input.createFlowPhase !== "multi_party_pro_required" || input.hasDraft) return false;
  return (STARTER_PREPARING_OVERLAY_DISPLAY_PHASES as readonly string[]).includes(input.displayPhase);
}

export function logStarterComplexityGateApplied(): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[starter-complexity-gate-applied]", {
    phase: "multi_party_pro_required",
    draftNull: true,
    hasDraftPayload: false,
  });
}

/** Labeled-party draft for Pro checkout — only after user chooses Build Pro. */
export function buildStarterProCheckoutPendingDraft(rawIntake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(emptyStarterCheckoutPendingShell(), rawIntake.trim(), true, defaultIntakePartyRoleLabels());
}

/** Party lines for the gate summary UI. */
export function formatStarterMultiPartyGatePartyLines(parties: string[]): string[] {
  return parties.map((name, i) => `${i + 1}. ${name}`);
}
