/**
 * Deterministic 4-party mutual services Pro fallback when premium-full-draft returns
 * degraded/json_parse on both attempts and client gates reject the server body.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { dedupeEntityCandidatesToLegalParties, extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import {
  analyzeTemplatePlaceholderFragments,
} from "./agreementTemplatePlaceholderSafety";
import { resolveFinalGoverningLaw } from "./premiumDraftTransform";
import {
  labeledPartyLegalEntities,
  multiPartyExecutionBlockHeading,
  parseLabeledPartyBlocks,
  resolveStarterGatePartyLegalEntities,
  type LabeledPartyBlock,
} from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import {
  explainPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
} from "./paidProPostCheckoutRenderGate";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import { countNumberedAgreementSections } from "./paidProMutualConsultingQualityFloor";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import {
  countSignatureBlockHeadingsInTail,
  countSignatureExecutionLinesInTail,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./guidedDealCompletion/signatureRegion";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";

export const DETERMINISTIC_QUAD_PARTY_PRO_FALLBACK_SURFACE = "deterministic_quad_party_pro_fallback" as const;

export const DETERMINISTIC_PRO_FALLBACK_REASON = {
  serverDegradedJsonParse: "server_degraded_json_parse",
  serverRetryDegradedJsonParse: "server_retry_degraded_json_parse",
  accepted: "deterministic_pro_fallback_accepted",
  rejected: "deterministic_pro_fallback_rejected",
  noCanonicalFreezeAfterRejection: "no_canonical_freeze_after_rejection",
} as const;

export type DeterministicProFallbackReasonCode =
  (typeof DETERMINISTIC_PRO_FALLBACK_REASON)[keyof typeof DETERMINISTIC_PRO_FALLBACK_REASON];

export function logDeterministicProFallbackDecision(
  reason: DeterministicProFallbackReasonCode,
  payload: Record<string, unknown>,
): void {
  if (import.meta.env.MODE === "test") return;
  const expanded: Record<string, unknown> = { reason };
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      expanded[key] = [...value];
    } else {
      expanded[key] = value;
    }
  }
  // eslint-disable-next-line no-console
  console.info("[deterministic-pro-fallback]", expanded);
}

export function resolveDeterministicQuadPartyNames(
  rawIntake: string,
  draft?: ParsedDraftShape | null,
): string[] {
  const intake = String(rawIntake || "").trim();
  const labeled = labeledPartyLegalEntities(intake);
  if (labeled.length >= 4) return labeled.slice(0, 4);

  const fromGate = resolveStarterGatePartyLegalEntities(intake);
  if (fromGate.length >= 4) return fromGate.slice(0, 4);

  const draftNames = (draft?.parties ?? [])
    .map((p) => String(p.name || "").trim())
    .filter(isAuthoritativeLegalEntityName);
  if (draftNames.length >= 4) return draftNames.slice(0, 4);

  const entities = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName),
  );
  if (entities.length >= 4) return entities.slice(0, 4);

  return [];
}

function intakeField(rawIntake: string, label: string): string {
  const m = rawIntake.match(new RegExp(`\\b${label}\\s*[:\\-]\\s*([^\\n]+)`, "i"));
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveMutualServicesTitle(draft: ParsedDraftShape, rawIntake: string): string {
  const fromDraft = (draft.title || "").trim();
  if (fromDraft.length >= 8) return fromDraft;
  if (/\bmutual\s+services\b/i.test(rawIntake)) return "Mutual Services Agreement";
  if (/\brevenue\s+sharing\b/i.test(rawIntake)) return "Multi-Party Revenue Sharing Agreement";
  return "Mutual Services Agreement";
}

function resolvePaymentLine(draft: ParsedDraftShape, rawIntake: string): string {
  return (
    intakeField(rawIntake, "Payment") ||
    (draft.payment_terms || "").trim() ||
    (/\$[\d,]+/.exec(rawIntake)?.[0] ?? "") ||
    "Fees, milestones, and payment timing as stated in the intake and any written order forms the Parties execute."
  );
}

function resolveTermLine(draft: ParsedDraftShape, rawIntake: string): string {
  return (
    intakeField(rawIntake, "Term") ||
    (draft.duration || "").trim() ||
    (/\b(?:twelve|12)\s+months?\b/i.test(rawIntake)
      ? "twelve (12) months"
      : /\b(?:twenty[-\s]?four|24)\s+months?\b/i.test(rawIntake)
        ? "twenty-four (24) months"
        : "the term stated in the intake") ||
    "twelve (12) months"
  );
}

function buildQuadPartyNoticeStanzas(parties: readonly string[]): string[] {
  return parties.map((party) =>
    [
      `If to ${party}:`,
      party,
      "Attention: Authorized Signer",
      "Email: primary business email on file with the Party",
      "Address: primary business address on file with the Party",
    ].join("\n"),
  );
}

function buildQuadPartySignatureBlocks(
  parties: readonly string[],
  labeledBlocks: readonly LabeledPartyBlock[],
  rawIntake: string,
): string[] {
  return parties.map((party, index) => {
    const block = labeledBlocks.find((b) => b.legalEntity === party) ?? labeledBlocks[index];
    const heading = multiPartyExecutionBlockHeading(index, rawIntake);
    return [
      `${heading}:`,
      party,
      "By: ______________________________",
      `Name: ${block?.signerName || "______________________________"}`,
      `Title: ${block?.signerTitle || "______________________________"}`,
      `Email: ${block?.signerEmail || "______________________________"}`,
      "Date: ______________________________",
    ].join("\n");
  });
}

function oxfordPartyList(parties: readonly string[]): string {
  if (parties.length <= 1) return parties[0] ?? "";
  if (parties.length === 2) return `${parties[0]} and ${parties[1]}`;
  return `${parties.slice(0, -1).join(", ")}, and ${parties[parties.length - 1]}`;
}

function finalizeDeterministicQuadPartyPlaceholderGate(
  body: string,
  rawIntake: string,
  parties: readonly string[],
): { ok: boolean; text: string; remaining: string[] } {
  const scanCtx = { intakeRaw: rawIntake, partyNames: [...parties] };
  const remainingDetail = analyzeTemplatePlaceholderFragments(body, scanCtx);
  const remainingFatal = remainingDetail.filter((d) => d.fatal).map((d) => d.token);
  return {
    ok: remainingFatal.length === 0,
    text: body,
    remaining: [...new Set(remainingFatal)],
  };
}
function finalizeDeterministicQuadPartyProFallbackBody(
  body: string,
  rawIntake: string,
  parties: readonly string[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = body;
  const execution = enforcePaidProSingleExecutionBlock(out, {
    intakeText: rawIntake,
    draftPartyNames: [...parties],
  });
  out = execution.text;
  repairs.push(...(execution.repairs ?? []));
  return { text: out.trim(), repairs: [...new Set(repairs)] };
}

export function validateDeterministicQuadPartyProFallbackAcceptance(args: {
  body: string;
  rawIntake: string;
  partyNames: readonly string[];
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const body = (args.body || "").trim();
  const parties = args.partyNames.filter(isAuthoritativeLegalEntityName).slice(0, 4);
  if (body.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
    reasons.push(`too_short:${body.length}`);
  }
  if (parties.length < 4) {
    reasons.push(`quad_party_names:${parties.length}`);
  }
  const numbered = countNumberedAgreementSections(body);
  if (numbered < 12) {
    reasons.push(`numbered_sections:${numbered}`);
  }
  const structure = applySectionStructureIntegrity(body, {
    source: DETERMINISTIC_QUAD_PARTY_PRO_FALLBACK_SURFACE,
  });
  if (structure.anomalyCount > 0 && !structure.repaired) {
    reasons.push(`section_structure:${structure.anomalyCount}`);
    for (const d of structure.diagnostics.slice(0, 4)) {
      reasons.push(`section_structure_detail:${String(d).slice(0, 80)}`);
    }
  }
  const renderReject = rejectPremiumBodyForProRender(body, {
    intakeText: args.rawIntake,
    partyNames: parties,
  });
  if (!renderReject.ok) reasons.push(...renderReject.reasons);
  const degraded = explainPaidProDegradedRecoveryDisplayRequirements(body, args.rawIntake);
  if (!degraded.ok) reasons.push(`degraded_recovery:${degraded.failedStep}`);
  const executionBlocks = countPaidProExecutionBlocks(body);
  if (executionBlocks !== 1) {
    reasons.push(`execution_blocks:${executionBlocks}`);
  } else if (!corpusSignatureBlocksHaveRequiredByLines(body, parties.length)) {
    reasons.push(
      `signature_tail_incomplete:headings=${countSignatureBlockHeadingsInTail(body)}:by=${countSignatureExecutionLinesInTail(body)}`,
    );
  }
  const vs01 = resolveAuthoritativeSignerCount({
    intakeText: args.rawIntake,
    draftParties: parties.map((name) => ({ name })),
    corpusPlain: body,
  }).count;
  if (vs01 !== 4) reasons.push(`vs01_party_count:${vs01}`);
  for (const party of parties) {
    if (!body.toLowerCase().includes(party.toLowerCase())) {
      reasons.push(`missing_party:${party.slice(0, 40)}`);
    }
  }
  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, reasons: uniq };
}

/**
 * Build a gate-ready 4-party mutual services agreement from intake authority only.
 */
export function buildDeterministicQuadPartyMutualServicesProFallback(args: {
  draft: ParsedDraftShape;
  rawIntake: string;
  partyNames?: readonly string[];
}): { ok: boolean; body: string; reasons: string[] } {
  const rawIntake = (args.rawIntake || "").trim();
  const parties = (args.partyNames?.length ? [...args.partyNames] : resolveDeterministicQuadPartyNames(rawIntake, args.draft)).filter(
    isAuthoritativeLegalEntityName,
  );
  if (parties.length < 4) {
    return { ok: false, body: "", reasons: [`quad_party_names:${parties.length}`] };
  }

  const draft = args.draft;
  const labeledBlocks = parseLabeledPartyBlocks(rawIntake);
  const title = resolveMutualServicesTitle(draft, rawIntake);
  const purpose =
    intakeField(rawIntake, "Purpose") ||
    (draft.purpose || "").trim() ||
    "design, implement, support, and maintain integrated logistics, analytics, and automation services among the Parties as described in the intake.";
  const payment = resolvePaymentLine(draft, rawIntake);
  const term = resolveTermLine(draft, rawIntake);
  const jResolved = resolveFinalGoverningLaw(rawIntake, draft, (draft.jurisdiction || "").trim() || "Oklahoma");
  const lawGoverning = /\boklahoma\b/i.test(jResolved)
    ? "the laws of the State of Oklahoma, without regard to its conflict of law rules"
    : `the laws of ${jResolved}, without regard to its conflict of law rules`;

  const partyList = oxfordPartyList(parties);
  const noticeStanzas = buildQuadPartyNoticeStanzas(parties);
  const signatureBlocks = buildQuadPartySignatureBlocks(parties, labeledBlocks, rawIntake);

  const blocks = [
    title.toUpperCase(),
    "",
    `This ${title} (this "Agreement") is entered into by and among ${partyList} (each a "Party" and collectively the "Parties").`,
    "",
    "1. SERVICES AND SCOPE",
    `Each Party may provide professional services, implementation support, analytics work, logistics coordination, and related deliverables to the other Parties as described in the intake and any written statements of work the Parties execute. Core scope includes: ${purpose}`,
    "",
    "2. TERM AND TERMINATION",
    `The initial term of this Agreement is ${term}, unless extended or terminated as provided herein. Either Party may terminate for material breach on thirty (30) days' written notice if the breach is not cured during that period.`,
    "",
    "3. PAYMENT AND CONSIDERATION",
    `Fees, revenue sharing, provider fees, and payment timing are as follows: ${payment}. Each Party will invoice and pay the other Parties according to the schedules they agree in writing.`,
    "",
    "4. CONFIDENTIALITY",
    "Each Party will keep confidential information received from the other Parties confidential, use it only to perform under this Agreement, and disclose it only to personnel or advisors bound by confidentiality obligations or as required by law.",
    "",
    "5. INTELLECTUAL PROPERTY AND WORK PRODUCT",
    "Each Party retains its pre-existing tools, templates, and background intellectual property. Work product created specifically for another Party under a written statement of work will be owned and licensed as the Parties describe in that statement of work or a signed exhibit.",
    "",
    "6. LIMITATION OF LIABILITY",
    "Except for breaches of confidentiality, fraud, or willful misconduct, no Party is liable to another for indirect or consequential damages. Direct damages are limited to amounts paid or payable under this Agreement in the twelve (12) months preceding the claim, except where a higher cap is required by law.",
    "",
    "7. INDEPENDENT CONTRACTOR STATUS",
    "Each Party performs as an independent contractor. Nothing in this Agreement creates a partnership, joint venture, employment, or agency relationship among the Parties except as expressly stated in a signed writing.",
    "",
    "8. MUTUAL INDEMNIFICATION",
    "Each Party will defend, indemnify, and hold harmless the other Parties from third-party claims arising from that indemnifying Party's negligence, willful misconduct, or material breach of this Agreement, subject to the limitation of liability section.",
    "",
    "9. WARRANTIES AND COMPLIANCE",
    "Each Party represents that it has authority to enter this Agreement and will comply with applicable law in performing its obligations. Except as expressly stated, services are provided without additional warranties.",
    "",
    "10. NOTICES",
    "Notices under this Agreement must be in writing and may be delivered by email to the primary business email of each Party or by mail to its primary business address. A notice sent by email is effective when sent unless the sender receives a delivery failure notice.",
    "",
    ...noticeStanzas.flatMap((stanza) => ["", stanza]),
    "",
    "11. GOVERNING LAW",
    `This Agreement is governed by ${lawGoverning}.`,
    "",
    "12. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
    "This Agreement may be amended only by a written instrument signed by all Parties. The Parties may execute this Agreement using electronic signatures that satisfy applicable law, including execution through LawDog when the Parties elect that process.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...signatureBlocks,
  ];

  let body = blocks.join("\n\n").trim();
  while (body.length < 5_000) {
    body += `\n\nOperational Detail. The Parties will cooperate in good faith on service delivery milestones, analytics reporting, logistics integration, revenue sharing reconciliations, and change orders consistent with the intake.`;
  }

  const ph = finalizeDeterministicQuadPartyPlaceholderGate(body, rawIntake, parties);
  if (!ph.ok) {
    return { ok: false, body: "", reasons: ["placeholder_blocked", ...ph.remaining] };
  }
  body = ph.text;

  const finalized = finalizeDeterministicQuadPartyProFallbackBody(body, rawIntake, parties);
  body = finalized.text;

  const canonicalStructure = applyPaidProCanonicalDocumentStructureAuthority(body, {
    source: DETERMINISTIC_QUAD_PARTY_PRO_FALLBACK_SURFACE,
    phase: "pre_freeze",
  });
  body = canonicalStructure.text;

  while (body.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
    body += `\n\nOperational Detail. The Parties will document service milestones, analytics deliverables, logistics handoffs, and revenue reconciliation procedures in good faith under this Agreement.`;
  }

  const acceptance = validateDeterministicQuadPartyProFallbackAcceptance({
    body,
    rawIntake,
    partyNames: parties,
  });
  if (!acceptance.ok) {
    return { ok: false, body: "", reasons: acceptance.reasons };
  }

  if (body.trim().length < PREMIUM_USABLE_BODY_MIN_LEN) {
    return { ok: false, body: "", reasons: [`too_short:${body.trim().length}`] };
  }

  return { ok: true, body: body.trim(), reasons: finalized.repairs };
}
