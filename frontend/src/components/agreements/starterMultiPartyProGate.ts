/**
 * Free Starter supports lightweight 1–2 party drafts only.
 * Complex intakes route to Pro before parseDraft, snapshots, or signer metadata.
 */
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";

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
  const labeled = parseLabeledPartyBlocks(raw);
  const withSigner = labeled.filter((b) => b.signerName || b.signerEmail || b.signerTitle).length;
  const signerNameLines = (raw.match(/^\s*signer\s+name\s*[:\-]/gim) ?? []).length;
  return Math.max(withSigner, signerNameLines, labeled.length, maxIndexedPartyOrSigner(raw));
}

export function detectRevenueShareLanguage(raw: string): boolean {
  return (
    /\b(?:revenue|profit|royalt(?:y|ies))\s*(?:share|sharing|split|allocation)\b/i.test(raw) ||
    /\b(?:revenue|profit)\s+share\b/i.test(raw) ||
    /\b\d+(?:\.\d+)?\s*%\s*(?:of\s+)?(?:revenue|profit|royalt)/i.test(raw) ||
    /\bpercentage\s+allocation\b/i.test(raw)
  );
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

function detectMultiProviderPayment(raw: string): boolean {
  const low = raw.toLowerCase();
  const providerHits =
    (low.match(/\b(?:provider|vendor|consultant|contractor|implement(?:er|ation))\w*\b/g) ?? []).length;
  const paymentContext = /\b(?:payment|fee|payable|invoice|milestone|monthly)\b/i.test(raw);
  if (!paymentContext) return false;
  if (providerHits >= 2) return true;
  return (
    /\b(?:each\s+party|all\s+parties)\b/i.test(raw) &&
    /\b(?:fee|payment|payable)\b/i.test(raw) &&
    (labeledPartyLegalEntities(raw).length >= 2 || maxIndexedPartyOrSigner(raw) >= 2)
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
  const parties = labeledPartyLegalEntities(intake);
  const partyCount = Math.max(parties.length, maxIndexedPartyOrSigner(intake), countSignerDetailSlots(intake));
  const hasRevenueShare = detectRevenueShareLanguage(intake);
  const hasCoordinator = detectCoordinatorOrNonPartyActor(intake);
  const hasReviewWorkflow = detectReviewApprovalWorkflow(intake);
  const hasMultiProviderPayment = detectMultiProviderPayment(intake);
  const reasons: StarterComplexityGateReason[] = [];

  if (parties.length > 2 || maxIndexedPartyOrSigner(intake) >= 3) {
    reasons.push("three_plus_legal_parties");
  }
  if (hasRevenueShare && (partyCount >= 2 || parties.length >= 2)) {
    reasons.push("revenue_share_or_allocation");
  }
  if (hasCoordinator && (parties.length >= 2 || partyCount >= 2)) {
    reasons.push("coordinator_or_non_party_actor");
  }
  if (countSignerDetailSlots(intake) >= 3 || maxIndexedPartyOrSigner(intake) >= 3) {
    reasons.push("multi_signer_workflow");
  }
  if (hasReviewWorkflow) {
    reasons.push("review_approval_workflow");
  }
  if (detectJointVentureOrMultiVendorStructure(intake) && partyCount >= 2) {
    reasons.push("joint_venture_or_multi_vendor_structure");
  }
  if (hasMultiProviderPayment) {
    reasons.push("multi_provider_payment");
  }

  const assessment: StarterComplexityGateAssessment = {
    required: reasons.length > 0,
    reasons,
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
      partyCount: assessment.partyCount,
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
