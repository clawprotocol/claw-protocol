/**
 * Final display-layer polish for paid Pro agreement text (review, copy, signing handoff).
 * Runs after canonicalization so numbering, openings, and boilerplate stay professional.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  type CanonicalPartyIdentityRecord,
  repairCanonicalPartyIdentityInCorpus,
  repairDuplicateAgreementOpening,
  resolveCanonicalPartyIdentitiesFromSources,
  stripDanglingPartyMetadataFragments,
  stripIrrelevantFixedFeeBoilerplate,
  intakeSpecifiesSimpleFixedFee,
} from "./canonicalPartyIdentityResolver";
import { normalizeProAgreementSectionContinuity } from "./normalizeProAgreementSectionContinuity";
import { appendProExecutionBlockIfMissing } from "./proExecutionBlockAppend";
import {
  getAcceptedPremiumDisplayText,
  isAcceptedPremiumCanonicalEstablished,
} from "./acceptedPremiumCanonicalCorpus";
import {
  coalesceAuthoritativePremiumBody,
  wouldMateriallyShrinkAuthoritativeBody,
} from "./premiumAuthoritativeBodyPreservation";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { repairPaidProSignatureSectionOrdering } from "./paidProSignatureSectionOrdering";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
} from "./paidProAcceptedCorpusPartyRoles";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { detectProReviewDisplaySanityViolations } from "./paidProReviewDisplaySanity";
import { shouldBlockPaidProStructuralMutationAfterAcceptance } from "./paidProAuthoritativeRenderGate";
import {
  logExecutionBlockCount,
  logExecutionBlockLocation,
  logPostFreezeCorpusDrift,
} from "./paidProExecutionBlockInstrumentation";
import {
  resolvePaidProFrozenAuthoritativePlain,
  resolvePaidProFrozenDisplayPlain,
  shouldSkipPostFreezeDriftForReadonlyHtmlStrip,
} from "./paidProPostFreezeCorpusInvariant";

export { detectProReviewDisplaySanityViolations } from "./paidProReviewDisplaySanity";
export type { PaidProDisplaySanityExecutionContext } from "./paidProReviewDisplaySanity";
export {
  analyzePaidProDisplaySanityExecutionContext,
  isAllowedExecutionTailLine,
} from "./paidProReviewDisplaySanity";

export type PolishProAgreementDisplayLayerOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  /** Review/share surfaces: strip execution residue and skip appending signature blocks. */
  reviewDisplayMode?: boolean;
  /** When true with reviewDisplayMode, keep signer execution blocks that were hydrated into the corpus. */
  retainSignatureExecutionBlock?: boolean;
};

export type PolishProAgreementDisplayLayerResult = {
  text: string;
  repairs: string[];
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function basicNormalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalPartyNamesFromDraft(draft: ParsedDraftShape | null | undefined): string[] {
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, 2);
}

/** Remove duplicate confidentiality paragraphs (normalized content match). */
export function dedupeConfidentialityParagraphs(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const parts = head.split(/\n\n+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const isConf = /\bconfidential/i.test(t) && t.length >= 80;
    if (!isConf) {
      kept.push(t);
      continue;
    }
    const key = t
      .toLowerCase()
      .replace(/^\d+(?:\.\d+)?\s+/, "")
      .replace(/\s+/g, " ")
      .replace(/[^\w\s$.,]/g, "")
      .slice(0, 220);
    if (seen.has(key)) {
      repairs.push("display:dedupe_confidentiality_paragraph");
      continue;
    }
    seen.add(key);
    kept.push(t);
  }
  const merged = kept.join("\n\n").trim();
  return { text: tail ? `${merged}\n\n${tail.trim()}` : merged, repairs };
}

/** Strip monthly-arrears / contractor invoice lines that survive section passes. */
export function stripFixedFeeDisplayBoilerplateLines(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repairs: string[] } {
  if (!intakeSpecifiesSimpleFixedFee(intakeRaw, text)) return { text, repairs: [] };
  const repairs: string[] = [];
  const lineRes = [
    /\bContractor\s+will\s+invoice\s+Company\s+monthly\s+in\s+arrears\b/i,
    /\b(?:will\s+)?invoice\s+Company\s+monthly\s+in\s+arrears\b/i,
    /\binvoice\s+.*\bmonthly\s+in\s+arrears\b/i,
    /\bmonthly\s+in\s+arrears\b/i,
    /\bfees?\s+(?:and\s+)?rates?\s+(?:are|is)\s+to\s+be\s+documented\b/i,
  ];
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    for (const re of lineRes) {
      if (re.test(t)) {
        repairs.push("display:strip_fixed_fee_boilerplate_line");
        return false;
      }
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

/** Remove generic party/address placeholders that were not supplied by the intake. */
export function stripUnsuppliedPartyAddressPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repairs: string[] } {
  const intake = String(intakeRaw || "");
  const allowAddress = /\b(address|notice\s+address|mailing\s+address|principal\s+office)\b/i.test(intake);
  const repairs: string[] = [];
  const lineRes = [
    /\b(?:corporation|limited liability company|company)\s+organized\s+under\s+the\s+laws\s+of\s+\[?[A-Za-z\s]*\]?/i,
    /\b(?:principal\s+office|mailing\s+address|notice\s+address)\s*(?:is|:)?\s*(?:\[.*?\]|to\s+be\s+provided|not\s+supplied|________________)/i,
    /\b(?:at|located\s+at)\s+\[?(?:address|principal office|mailing address)\]?/i,
    /\b\[?(?:corporation|entity type|address|principal office|mailing address)\]?\b/i,
  ];
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (allowAddress && !/\[.*?\]|to\s+be\s+provided|________________/i.test(t)) return true;
    for (const re of lineRes) {
      if (re.test(t)) {
        repairs.push("display:strip_unsupplied_party_placeholder");
        return false;
      }
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

const SERVICES_DUPLICATE_OPENING_RE =
  /This\s+Services\s+Agreement\s*\(\s*(?:the\s+)?["']Agreement["']\s*\)\s+is\s+This\s+Agreement\s+is\s+between/gi;

/** Title + Agreement") is This Agreement is between — any descriptive title prefix. */
const FUSED_TITLE_OPENING_RE =
  /(\bThis\s+[\w\s]+Agreement\s*\(\s*(?:the\s+)?["']Agreement["']\s*\))\s+is\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/gi;

function isAgreementTitleParagraph(part: string): boolean {
  const t = part.trim();
  return t.length <= 90 && /\bAGREEMENT\b/i.test(t) && !/[.!?]$/.test(t);
}

function isOpeningParagraph(part: string): boolean {
  return /\bThis\s+(?:Services\s+)?Agreement\b/i.test(part) && /\bbetween\b/i.test(part);
}

function isBodySectionParagraph(part: string): boolean {
  return /^(?:#{1,3}\s+)?(?:\d+(?:\.\d+)?\.?\s+|[A-Z][A-Za-z\s]{2,60}:)/.test(part.trim());
}

function isExecutionParagraph(part: string): boolean {
  return /\b(?:IN\s+WITNESS\s+WHEREOF|EXECUTION|SIGNATURES?|By:\s*_{2,}|Name:\s*(?:_{2,}|\S)|Title:\s*(?:_{2,}|\S)|^CLIENT\s*:|^SERVICE\s+PROVIDER\s*:)\b/im.test(
    part,
  );
}

function normalizedOpeningParagraph(
  part: string,
  records: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = part.trim();
  const duplicate = repairDuplicateAgreementOpening(out, records);
  out = duplicate.text;
  repairs.push(...duplicate.repairs);
  if (/\bThis\s+Agreement\s+is\s+entered\s+into\b[\s\S]{0,180}?\bThis\s+Agreement\s+is\s+between\b/i.test(out)) {
    out = out.replace(
      /\bThis\s+Agreement\s+is\s+entered\s+into\b[\s\S]{0,180}?\bThis\s+Agreement\s+is\s+between\b/i,
      "This Agreement is between",
    );
    repairs.push("opening:collapse_entered_into_between_duplicate");
  }
  if (SERVICES_DUPLICATE_OPENING_RE.test(out)) {
    SERVICES_DUPLICATE_OPENING_RE.lastIndex = 0;
    out = out.replace(
      SERVICES_DUPLICATE_OPENING_RE,
      'This Services Agreement (the "Agreement") is entered into by and between',
    );
    repairs.push("opening:collapse_services_duplicate");
  }
  return { text: out.trim(), repairs };
}

export function normalizeAgreementOpeningStructure(
  text: string,
  opts?: {
    records?: readonly CanonicalPartyIdentityRecord[];
    reviewDisplayMode?: boolean;
  /** When true with reviewDisplayMode, keep signer execution blocks that were hydrated into the corpus. */
  retainSignatureExecutionBlock?: boolean;
  },
): { text: string; repairs: string[] } {
  const input = basicNormalize(text);
  if (!input) return { text: "", repairs: [] };
  const repairs: string[] = [];
  const parts = input.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { text: input, repairs };

  const records = opts?.records ?? [];
  let title = "";
  let start = 0;
  if (isAgreementTitleParagraph(parts[0]!)) {
    title = parts[0]!;
    start = 1;
  }

  const body: string[] = [];
  const execution: string[] = [];
  let opening = "";
  let inExecution = false;

  for (let i = start; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (isExecutionParagraph(part)) {
      inExecution = true;
    }
    if (inExecution) {
      execution.push(part);
      continue;
    }
    if (isOpeningParagraph(part)) {
      const normalized = normalizedOpeningParagraph(part, records);
      repairs.push(...normalized.repairs);
      if (!opening) {
        opening = normalized.text;
      } else {
        repairs.push("opening:remove_duplicate_opening_phase");
      }
      continue;
    }
    if (opening && !isBodySectionParagraph(part) && isOpeningParagraph(part)) {
      repairs.push("opening:remove_duplicate_opening_fragment");
      continue;
    }
    body.push(part);
  }

  const stripExecutionForReview =
    Boolean(opts?.reviewDisplayMode) && !opts?.retainSignatureExecutionBlock;
  if (stripExecutionForReview && execution.length > 0) {
    repairs.push("display:strip_execution_phase_for_review");
  }

  const outputParts = [
    title,
    opening,
    ...body,
    ...(stripExecutionForReview ? [] : execution),
  ].filter(Boolean);
  const out = outputParts.join("\n\n").replace(/\.signature\./gi, "").trim();
  if (out !== outputParts.join("\n\n").trim()) repairs.push("display:strip_signature_residue");
  return { text: out, repairs: [...new Set(repairs)] };
}

/** Display-only cleanup for malformed Pro review openings and signature residue. */
export function stripMalformedProReviewDisplayArtifacts(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  if (FUSED_TITLE_OPENING_RE.test(out)) {
    FUSED_TITLE_OPENING_RE.lastIndex = 0;
    out = out.replace(FUSED_TITLE_OPENING_RE, "$1 is between");
    repairs.push("display:collapse_fused_title_opening");
  }
  if (/entered\s+into\s+as\s+of\s+the\s+effective\s+date\s+This\s+Agreement\s+is\s+between/i.test(out)) {
    out = out.replace(
      /entered\s+into\s+as\s+of\s+the\s+effective\s+date\s+This\s+Agreement\s+is\s+between/gi,
      "is between",
    );
    repairs.push("display:collapse_effective_date_duplicate_opening");
  }
  if (SERVICES_DUPLICATE_OPENING_RE.test(out)) {
    SERVICES_DUPLICATE_OPENING_RE.lastIndex = 0;
    out = out.replace(
      SERVICES_DUPLICATE_OPENING_RE,
      'This Services Agreement (the "Agreement") is entered into by and between',
    );
    repairs.push("display:repair_services_duplicate_opening");
  }
  if (/\.signature\./i.test(out)) {
    out = out.replace(/\.signature\./gi, "");
    repairs.push("display:strip_signature_residue");
  }
  if (/\)\.signature\s+below\.?/i.test(out)) {
    out = out.replace(/\)\.signature\s+below\.?/gi, ").");
    repairs.push("display:strip_signature_below_paren");
  }
  if (/\.signature\s+below\.?/i.test(out)) {
    out = out.replace(/\.signature\s+below\.?/gi, ".");
    repairs.push("display:strip_signature_below");
  }
  if (/\bsignature\s+below\b/i.test(out)) {
    out = out.replace(/\bsignature\s+below\b\.?/gi, "");
    repairs.push("display:strip_signature_below_phrase");
  }
  if (/\)\.signature\.?/i.test(out)) {
    out = out.replace(/\)\.signature\.?/gi, ")");
    repairs.push("display:strip_signature_paren_residue");
  }
  if (/\("Service Provider"\)\.signature/i.test(out)) {
    out = out.replace(/\("Service Provider"\)\.signature[\s.]*(?:below)?\.?/gi, '("Service Provider").');
    repairs.push("display:strip_service_provider_signature_residue");
  }
  return { text: out.trim(), repairs };
}

export function logProReviewDisplaySanityBlocked(payload: {
  reason: string;
  source: string;
  hash: string;
}): void {
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "pro-review-display-sanity-blocked",
      surface: payload.source,
      hash: payload.hash,
      source: payload.reason,
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn("[pro-review-display-sanity-blocked]", payload);
}

export type SanitizeProReviewDisplayTextOpts = {
  records?: readonly CanonicalPartyIdentityRecord[];
  /** Diagnostic label for sanity-block logging. */
  source?: string;
  /** Keep hydrated signer execution blocks (witness + signature lines) on final review. */
  retainSignatureExecutionBlock?: boolean;
};

export type SanitizeProReviewDisplayTextResult = {
  text: string;
  repairs: string[];
  sanityBlocked: boolean;
  inputHash: string;
  outputHash: string;
};

/**
 * Final display-only sanitizer for Pro review surfaces. Never mutates authoritative storage.
 * Strips execution phase, collapses fused openings, and removes signature residue.
 */
export function sanitizeProReviewDisplayText(
  raw: string,
  opts?: SanitizeProReviewDisplayTextOpts,
): SanitizeProReviewDisplayTextResult {
  const input = trim(raw);
  const inputHash = fingerprintAgreementBody(input);
  if (!input) {
    return { text: "", repairs: [], sanityBlocked: false, inputHash, outputHash: inputHash };
  }
  if (shouldBlockPaidProStructuralMutationAfterAcceptance() && !opts?.retainSignatureExecutionBlock) {
    const readonlyStrip = shouldSkipPostFreezeDriftForReadonlyHtmlStrip(opts?.source);
    const out = readonlyStrip
      ? input
      : resolvePaidProFrozenAuthoritativePlain() || resolvePaidProFrozenDisplayPlain(input);
    const outputHash = fingerprintAgreementBody(out);
    if (!readonlyStrip) {
      logPostFreezeCorpusDrift({
        surface: opts?.source ?? "pro_review_display_passthrough",
        renderedText: out,
      });
    }
    return {
      text: out,
      repairs: readonlyStrip
        ? ["display:readonly_signature_strip_passthrough"]
        : ["display:sot_sanitize_passthrough"],
      sanityBlocked: false,
      inputHash,
      outputHash,
    };
  }
  const inputViolations = detectProReviewDisplaySanityViolations(input);
  const source = opts?.source ?? "pro_review_display";
  let sanityBlocked = inputViolations.length > 0;
  if (sanityBlocked) {
    for (const reason of inputViolations) {
      logProReviewDisplaySanityBlocked({ reason, source, hash: inputHash });
    }
  }
  const repairs: string[] = [];
  let out = basicNormalize(input);

  const artifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = artifacts.text;
  repairs.push(...artifacts.repairs);

  const structured = normalizeAgreementOpeningStructure(out, {
    records: opts?.records,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: opts?.retainSignatureExecutionBlock,
  });
  out = structured.text;
  repairs.push(...structured.repairs);

  const opening = repairDuplicateAgreementOpening(out, opts?.records);
  out = opening.text;
  repairs.push(...opening.repairs);

  if (!opts?.retainSignatureExecutionBlock) {
    const witnessIdx = findSignatureRegionStart(out);
    if (witnessIdx >= 0) {
      out = out.slice(0, witnessIdx).trimEnd();
      repairs.push("display:strip_witness_execution_region");
    }

    const withoutExecLines = out
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^\s*(?:By|Name|Title|Date|Email|Signature)\s*:\s*_{2,}/i.test(t)) {
          repairs.push("display:strip_execution_field_line");
          return false;
        }
        if (/^\s*(?:CLIENT|SERVICE PROVIDER|PROVIDER|COMPANY|CONTRACTOR)\s*:/i.test(t) && t.length < 80) {
          repairs.push("display:strip_execution_party_header");
          return false;
        }
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (withoutExecLines !== out) out = withoutExecLines;
  }

  const tailArtifacts = stripMalformedProReviewDisplayArtifacts(out);
  out = tailArtifacts.text;
  repairs.push(...tailArtifacts.repairs);

  const dangling = stripDanglingPartyMetadataFragments(out);
  out = dangling.text;
  repairs.push(...dangling.repairs);

  let violations = detectProReviewDisplaySanityViolations(out);
  if (violations.length > 0 && !opts?.retainSignatureExecutionBlock) {
    sanityBlocked = true;
    for (const reason of violations) {
      logProReviewDisplaySanityBlocked({ reason, source, hash: inputHash });
    }
    out = out
      .replace(FUSED_TITLE_OPENING_RE, "$1 is between")
      .replace(/\.signature[\s.]*(?:below)?\.?/gi, ".")
      .replace(/\bsignature\s+below\b\.?/gi, "")
      .replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "")
      .replace(/^\s*(?:By|Name|Title|Date|Email|Signature)\s*:\s*.*$/gim, "")
      .trim();
    violations = detectProReviewDisplaySanityViolations(out);
    if (violations.length > 0) {
      repairs.push("display:sanity_aggressive_fallback");
    }
  } else if (violations.length > 0) {
    repairs.push("display:sanity_violations_retained_signer_block");
  }

  const outputHash = fingerprintAgreementBody(out);
  return {
    text: out,
    repairs: [...new Set(repairs)],
    sanityBlocked,
    inputHash,
    outputHash,
  };
}

/**
 * Polish authoritative Pro text for display, copy, and signing without material shrink.
 */
export function polishProAgreementDisplayLayer(
  raw: string,
  opts?: PolishProAgreementDisplayLayerOpts,
): PolishProAgreementDisplayLayerResult {
  const input = trim(raw);
  if (!input) return { text: "", repairs: [] };
  if (shouldBlockPaidProStructuralMutationAfterAcceptance() && !opts?.retainSignatureExecutionBlock) {
    const out = resolvePaidProFrozenDisplayPlain(input);
    logPostFreezeCorpusDrift({ surface: "polishProAgreementDisplayLayer", renderedText: out });
    logExecutionBlockLocation(out, "polishProAgreementDisplayLayer:passthrough");
    logExecutionBlockCount(out, "polishProAgreementDisplayLayer:passthrough");
    return { text: out, repairs: ["display:authoritative_sot_passthrough"] };
  }
  const repairs: string[] = [];
  let out = basicNormalize(input);

  const partyNames = canonicalPartyNamesFromDraft(opts?.draft);
  const records = resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: opts?.intakeText ?? null,
    starterNames: partyNames,
    generatedBody: input,
  });

  const structuredOpening = normalizeAgreementOpeningStructure(out, {
    records,
    reviewDisplayMode: opts?.reviewDisplayMode,
    retainSignatureExecutionBlock: opts?.retainSignatureExecutionBlock,
  });
  out = structuredOpening.text;
  repairs.push(...structuredOpening.repairs);

  const opening = repairDuplicateAgreementOpening(out, records);
  out = opening.text;
  repairs.push(...opening.repairs);

  if (records.length >= 2) {
    const party = repairCanonicalPartyIdentityInCorpus(out, records, {
      intakeRaw: opts?.intakeText ?? null,
      partyNames,
    });
    out = party.text;
    repairs.push(...party.repairs);
  }

  const opening2 = repairDuplicateAgreementOpening(out, records);
  out = opening2.text;
  repairs.push(...opening2.repairs);

  if (opts?.reviewDisplayMode) {
    const reviewArtifacts = stripMalformedProReviewDisplayArtifacts(out);
    out = reviewArtifacts.text;
    repairs.push(...reviewArtifacts.repairs);
  }

  const danglingPartyMeta = stripDanglingPartyMetadataFragments(out);
  out = danglingPartyMeta.text;
  repairs.push(...danglingPartyMeta.repairs);

  const placeholders = stripUnsuppliedPartyAddressPlaceholders(out, opts?.intakeText ?? null);
  out = placeholders.text;
  repairs.push(...placeholders.repairs);

  if (intakeSpecifiesSimpleFixedFee(opts?.intakeText, out)) {
    out = stripIrrelevantFixedFeeBoilerplate(out, opts?.intakeText ?? null).text;
    const lines = stripFixedFeeDisplayBoilerplateLines(out, opts?.intakeText ?? null);
    out = lines.text;
    repairs.push(...lines.repairs);
  }

  const conf = dedupeConfidentialityParagraphs(out);
  out = conf.text;
  repairs.push(...conf.repairs);

  const sigOrder = repairPaidProSignatureSectionOrdering(out);
  out = sigOrder.text;
  repairs.push(...sigOrder.repairs);

  if (records.length >= 2) {
    const execution = enforcePaidProSingleExecutionBlock(out);
    if (execution.text !== out) {
      out = execution.text;
      repairs.push(...execution.repairs);
    }
  }

  if (!opts?.retainSignatureExecutionBlock) {
    const sections = normalizeProAgreementSectionContinuity(out);
    out = sections.text;
    repairs.push(...sections.repairs);
  }

  if (records.length >= 2 && !opts?.reviewDisplayMode) {
    out = appendProExecutionBlockIfMissing(out, records).text;
  }

  if (opts?.reviewDisplayMode) {
    const sanitized = sanitizeProReviewDisplayText(out, {
      records,
      source: "polishProAgreementDisplayLayer",
      retainSignatureExecutionBlock: opts?.retainSignatureExecutionBlock,
    });
    out = sanitized.text;
    repairs.push(...sanitized.repairs);
    if (sanitized.sanityBlocked) repairs.push("display:pro_review_sanity_guard");
  }

  if (
    !opts?.retainSignatureExecutionBlock &&
    wouldMateriallyShrinkAuthoritativeBody(input.length, out.length)
  ) {
    const coalesced = coalesceAuthoritativePremiumBody({
      preservedBody: input,
      candidateBody: out,
      preservedSource: "accepted_server_full_draft",
      candidateSource: "display_layer_polish",
    });
    return { text: coalesced.text, repairs: [...repairs, ...(coalesced.downgradePrevented ? ["display:shrink_blocked"] : [])] };
  }

  if (records.length >= 2 && detectExecutionBlockRoleInversion(out)) {
    const identities = buildCorpusRoleIdentitiesForExecutionReconcile(out);
    const reconciled = reconcileExecutionBlockToRoleIdentities(out, identities);
    if (reconciled.repairs > 0) {
      out = reconciled.text;
      repairs.push("display:reconcile_execution_block_roles");
    }
  }

  return { text: out, repairs: [...new Set(repairs)] };
}

/** Plain text for copy/export — must match accepted canonical display when established. */
export function polishedAuthoritativeProPlainForCopy(
  candidates: readonly (string | null | undefined)[],
  opts?: PolishProAgreementDisplayLayerOpts & {
    acceptedAuthoritativeBody?: string | null;
    minLen?: number;
  },
): string {
  if (isAcceptedPremiumCanonicalEstablished()) {
    return getAcceptedPremiumDisplayText();
  }
  const minLen = opts?.minLen ?? 1_500;
  const accepted = trim(opts?.acceptedAuthoritativeBody);
  if (accepted.length >= 500) return accepted;
  let best = "";
  for (const c of candidates) {
    const t = trim(c);
    if (t.length > best.length) best = t;
  }
  const polished = polishProAgreementDisplayLayer(best, opts);
  return polished.text.length >= minLen ? polished.text : polished.text.length > best.length ? polished.text : best;
}
