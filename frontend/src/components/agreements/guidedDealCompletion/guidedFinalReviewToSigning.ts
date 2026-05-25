/**
 * Guided Pro final review → signature track (not review-share / generic send).
 */

import {
  applyCanonicalManifestPlaceholdersToCorpus,
  manifestToCanonicalPartyIdentities,
  type CanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN, type CanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import {
  rebuildSignatureBlocksWithPartyIdentities,
  shouldRejectSignerIdentityCorpusShrink,
  type CanonicalPartyIdentity,
} from "./signerPartyIdentity";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./signatureRegion";
import {
  renumberGuidedTopLevelSectionsSequentially,
  stripGuidedInstructionLeakLines,
  stripOrphanNumberedHeadingLines,
  stripStaleExecutionPlacementCorpusCopy,
} from "./guidedCorpusLineRepairs";
import { repairFinalGradeGuidedCorpus } from "./guidedFinalGradeCorpus";

export type ResolveGuidedSigningAuthoritativeArgs = {
  snapshot?: string;
  accepted?: string;
  finalReviewCorpus?: string;
  guidedAuthoritative?: string;
  renderedPreview?: string;
  minLen?: number;
};

export type GuidedSignatureTrackCorpusSource =
  | "finalized_signer_applied_guided_corpus"
  | "finalized_signing_corpus"
  | "accepted_review";

export type GuidedSignatureTrackCorpusSelection = {
  source: GuidedSignatureTrackCorpusSource | "none";
  body: string;
  hash: string;
};

export type GuidedSignatureTrackFailureReason =
  | "corpus_not_selected"
  | "corpus_cleanup_failed"
  | "signer_manifest_missing"
  | "transition_not_ready"
  | "persist_failed"
  | "vs01_route_failed";

/** Hydrated/preview-only sources — must not win when a frozen final corpus exists. */
export const GUIDED_HYDRATED_PREVIEW_CORPUS_SOURCES = new Set<GuidedSignatureTrackCorpusSource>([]);

export const GUIDED_FINALIZER_HYDRATED_ONLY_SOURCES = new Set([
  "hydrated_premium",
  "hydrated_premium_with_signers",
  "picker_authoritative",
  "agreement_document",
  "last_known_good_authoritative",
]);

export const GUIDED_PLACEHOLDER_BRACKET_RES: readonly RegExp[] = [
  /\[?\s*Your Company Name\s*\]?/gi,
  /\[?\s*Service Provider Name\s*\]?/gi,
  /\[Client(?:'s)?(?:\s+Full)?\s+Legal Name\]/gi,
  /\[Client Name\]/gi,
  /\[Provider Name\]/gi,
  /\[Your Company(?:'s)? Address\]/gi,
  /\[Service Provider(?:'s)? Address\]/gi,
  /\[Client Email Address\]/gi,
  /\[Service Provider Email Address\]/gi,
];

export function stripGuidedPlaceholderBracketArtifacts(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  for (const re of GUIDED_PLACEHOLDER_BRACKET_RES) {
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, "");
      repairs.push(`strip_placeholder:${re.source.slice(0, 32)}`);
    }
    re.lastIndex = 0;
  }
  out = out.replace(/\[\s*[^\]]{2,80}\s*\]/g, () => {
    repairs.push("strip_bracket");
    return "";
  });
  return { text: out.replace(/\n{3,}/g, "\n\n"), repairs };
}

export function removeDraftTemplateBannerFromCorpus(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  const banner =
    /Draft Agreement\s*\(\s*non[- ]binding template\s*\)/gi;
  if (banner.test(out)) {
    banner.lastIndex = 0;
    out = out.replace(banner, "AI Automation Services Agreement");
    repairs.push("title:ai_automation_services_agreement");
  }
  return { text: out, repairs };
}

export function shouldShowPacketSignerMetaLine(args: {
  partyName: string;
  signerName: string | null | undefined;
  isEntityParty: boolean;
}): boolean {
  const party = (args.partyName || "").trim();
  const signer = (args.signerName || "").trim();
  if (!signer) return false;
  if (!args.isEntityParty) return false;
  return signer.toLowerCase() !== party.toLowerCase();
}

export function normLoosePartyName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

const GUIDED_ANSWER_DEDUPE_RES: readonly { re: RegExp; label: string }[] = [
  {
    re: /\b(?:invoices?\s+(?:are\s+)?(?:due|payable).{0,80}(?:net\s*30|30\s+days?))/i,
    label: "net_30",
  },
  { re: /\bbuild-heavy\b/i, label: "phase_allocation" },
  { re: /\b99\.9\s*%/i, label: "uptime" },
  {
    re: /\b(?:company|client)\s+owns?\s+(?:the\s+)?(?:project\s+)?deliverables?\b/i,
    label: "ip_ownership",
  },
  {
    re: /\b(?:pre-existing|background)\s+(?:tools|materials|technology|ip|intellectual property|know-how)/i,
    label: "preexisting_carveout",
  },
  { re: /\b(?:30|thirty)\s+days?.{0,30}(?:written\s+)?notice\b/i, label: "termination_notice" },
];

/** Prefer frozen signer-applied corpus by priority — never a longer stale server/picker draft. */
export function resolveGuidedSigningAuthoritativePlain(
  args: ResolveGuidedSigningAuthoritativeArgs,
): string {
  const minLen = args.minLen ?? 500;
  const priorityOrder: Array<string | null | undefined> = [
    args.snapshot,
    args.finalReviewCorpus,
    args.accepted,
    args.guidedAuthoritative,
  ];
  for (const raw of priorityOrder) {
    const body = (raw || "").trim();
    if (body.length >= minLen && !isGuidedSigningPlaceholderPreviewBody(body)) {
      return body;
    }
  }
  const rendered = (args.renderedPreview || "").trim();
  return rendered.length >= minLen ? rendered : "";
}

export { resolvePersistAgreementIdAfterHydrate as resolveGuidedSigningPersistAgreementId } from "./guidedFinalCorpusPin";

/** True when body still carries guided pre-signer placeholder tokens (must not enter signing track). */
export function isGuidedSigningPlaceholderPreviewBody(body: string): boolean {
  const t = (body || "").trim();
  if (!t) return true;
  return (
    /\[(?:Your Company Name|Service Provider Name|Client(?:'s)?(?:\s+Full)?\s+Legal Name|Client Name|Provider Name)\]/i.test(t) ||
    /\bYour Company Name\b/i.test(t) ||
    /\bService Provider Name\b/i.test(t)
  );
}

/** Only frozen signer-applied / signing / accepted-review corpora may enter the signature track. */
export function selectGuidedSignatureTrackCorpus(args: {
  finalizedSignerApplied?: string | null;
  finalizedSigning?: string | null;
  acceptedReview?: string | null;
  minLen?: number;
}): GuidedSignatureTrackCorpusSelection {
  const minLen = args.minLen ?? GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN;
  const order: Array<[GuidedSignatureTrackCorpusSource, string | null | undefined]> = [
    ["finalized_signer_applied_guided_corpus", args.finalizedSignerApplied],
    ["finalized_signing_corpus", args.finalizedSigning],
    ["accepted_review", args.acceptedReview],
  ];
  for (const [source, raw] of order) {
    const body = (raw || "").trim();
    if (body.length >= minLen && !isGuidedSigningPlaceholderPreviewBody(body)) {
      return { source, body, hash: fingerprintAgreementBody(body) };
    }
  }
  return { source: "none", body: "", hash: "" };
}

export function normalizePartyNameSpacingInCorpus(text: string): string {
  return text
    .replace(/\bbetween(?=[A-Za-z\[])/g, "between ")
    .replace(/\band(?=[A-Za-z\[])/g, "and ")
    .replace(/([A-Za-z0-9\])])(\("(Client|Service Provider))/gi, '$1 $2')
    .replace(/([A-Za-z0-9\])])(\(")/g, "$1 $2")
    .replace(/ {2,}/g, " ");
}

/** Strip guided-merge markdown heading artifacts and normalize party parentheticals. */
export function stripPhantomGuidedSectionMarkers(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (/^\d+\.\d+\.?\s*$/.test(t)) {
      repairs.push(`phantom_subsection:${t}`);
      continue;
    }
    if (/^\*{1,2}\s*\d+(?:\.\d+)*\.?\s*\*{0,2}\s*$/.test(t)) {
      repairs.push(`phantom_markdown_heading:${t}`);
      continue;
    }
    if (/^\d+\.\s*$/.test(t)) {
      repairs.push(`phantom_section_number:${t}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

export function normalizeGuidedCorpusHeadingArtifacts(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const phantom = stripPhantomGuidedSectionMarkers(text);
  let out = phantom.text;
  repairs.push(...phantom.repairs);
  out = out
    .replace(/\*\*(\d+(?:\.\d+)*\.)\s+/g, (_, n) => {
      repairs.push("heading_leading_markdown");
      return `${n} `;
    })
    .replace(/^(\s*)\d+\.\d+\.\s*(\d+)\.\s*/gm, (_, indent, n) => {
      repairs.push("malformed_section_number");
      return `${indent}${n}. `;
    })
    .replace(/^(\s*\d+\.)\s*(?=[A-Z])/gm, (_, n) => {
      repairs.push("section_heading_spacing");
      return `${n} `;
    })
    .replace(/(\d+(?:\.\d+)*\.)\s+([^*\n]+)\*\*/g, (_, n, title) => {
      repairs.push("heading_trailing_markdown");
      return `${n} ${String(title).trim()}`;
    })
    .replace(/\n{3,}/g, "\n\n");
  out = normalizePartyNameSpacingInCorpus(out);
  if (repairs.length > 0) repairs.push("heading_artifacts");
  return { text: out, repairs };
}

export function dedupeGuidedAnswerClauses(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    let label: string | null = null;
    for (const { re, label: l } of GUIDED_ANSWER_DEDUPE_RES) {
      if (re.test(trimmed)) {
        label = l;
        break;
      }
    }
    if (label && seen.has(label)) {
      repairs.push(`dedupe:${label}`);
      continue;
    }
    if (label) seen.add(label);
    out.push(block);
  }
  return { text: out.join("\n\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function canonicalIdentityNeedles(identities: readonly CanonicalPartyIdentity[]): Set<string> {
  const needles = new Set<string>();
  for (const id of identities) {
    for (const raw of [id.partyDisplayName, id.representativeName ?? "", id.title ?? ""]) {
      const norm = normLoosePartyName(raw);
      if (norm) needles.add(norm);
    }
  }
  return needles;
}

function looksLikeSignatureIdentityFragmentLine(line: string, needles: Set<string>): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*/i.test(t)) return true;
  if (/^(?:Name|Title|Date|Email)\s*:/i.test(t)) return true;
  if (/^By\s*:/i.test(t)) return true;
  if (/^_{4,}$/.test(t)) return true;
  const withoutLabel = t.replace(/^(?:Name|Title|Date|Email)\s*:\s*/i, "");
  const norm = normLoosePartyName(withoutLabel);
  return needles.has(norm);
}

/**
 * Some model outputs place a partial identity/signature fragment immediately before
 * the canonical witness block. Remove only that terminal fragment so VS01 anchors
 * see a single execution block and the PDF has clean whitespace before it.
 */
export function stripDuplicatePreWitnessIdentityFragment(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; repairs: string[] } {
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness <= 0 || identities.length < 1) return { text, repairs: [] };
  const before = text.slice(0, witness).trimEnd();
  const after = text.slice(witness).trimStart();
  const lines = before.replace(/\r\n/g, "\n").split("\n");
  const needles = canonicalIdentityNeedles(identities);
  let start = lines.length;
  let meaningful = 0;
  let hasSigLabel = false;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!looksLikeSignatureIdentityFragmentLine(line, needles)) break;
    start = i;
    if (trimmed) {
      meaningful += 1;
      if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+|Name|Title|Date|Email)\s*:?/i.test(trimmed)) {
        hasSigLabel = true;
      }
    }
  }

  if (meaningful < 2 || !hasSigLabel || start >= lines.length) {
    return { text, repairs: [] };
  }
  const kept = lines.slice(0, start).join("\n").trimEnd();
  return {
    text: `${kept}\n\n${after}`.replace(/\n{3,}/g, "\n\n"),
    repairs: ["signature:pre_witness_identity_fragment_removed"],
  };
}

/** Final corpus cleanup before signing: spacing, placeholders, dedupe, signature block. */
export function prepareGuidedSigningCorpusCleanup(args: {
  body: string;
  partyManifest: CanonicalFinalPartyManifest;
  signerIdentities?: readonly CanonicalPartyIdentity[];
  /** When true, skip guided re-merge/final-grade rebuild so user-saved final review text stays authoritative. */
  preserveUserEdits?: boolean;
}): { body: string; repairs: string[]; hash: string } {
  const identities =
    args.signerIdentities ?? manifestToCanonicalPartyIdentities(args.partyManifest);
  const repairs: string[] = [];
  let out = normalizePartyNameSpacingInCorpus((args.body || "").trim());
  repairs.push("spacing:party_names");

  const heading = normalizeGuidedCorpusHeadingArtifacts(out);
  out = heading.text;
  repairs.push(...heading.repairs);

  const banner = removeDraftTemplateBannerFromCorpus(out);
  out = banner.text;
  repairs.push(...banner.repairs);

  const stripped = stripGuidedPlaceholderBracketArtifacts(out);
  out = stripped.text;
  repairs.push(...stripped.repairs);

  const manifestPatch = applyCanonicalManifestPlaceholdersToCorpus(out, args.partyManifest);
  out = manifestPatch.text;
  repairs.push(...manifestPatch.repairs);

  if (!args.preserveUserEdits) {
    const dedupe = dedupeGuidedAnswerClauses(out);
    out = dedupe.text;
    repairs.push(...dedupe.repairs);
  }

  const instructionLeak = stripGuidedInstructionLeakLines(out);
  out = instructionLeak.text;
  repairs.push(...instructionLeak.repairs);

  if (!args.preserveUserEdits) {
    const finalGrade = repairFinalGradeGuidedCorpus(out, {
      signerIdentities: identities,
      authoritativePartyNames: identities.map((id) => id.partyDisplayName).filter(Boolean),
    });
    out = finalGrade.text;
    repairs.push(...finalGrade.repairs.map((r) => `final_grade:${r}`));
  }

  const executionFooter = stripStaleExecutionPlacementCorpusCopy(out);
  out = executionFooter.text;
  repairs.push(...executionFooter.repairs);

  if (!args.preserveUserEdits) {
    const finalRenumber = renumberGuidedTopLevelSectionsSequentially(out);
    out = finalRenumber.text;
    repairs.push(...finalRenumber.repairs);
  }

  const preWitnessIdentity = stripDuplicatePreWitnessIdentityFragment(out, identities);
  out = preWitnessIdentity.text;
  repairs.push(...preWitnessIdentity.repairs);

  out = normalizePartyNameSpacingInCorpus(out);
  repairs.push("spacing:post_manifest");

  const needsSignatureTail =
    !/\bIN WITNESS WHEREOF\b/i.test(out) ||
    /name\s*:\s*_{4,}/i.test(out.slice(-1800)) ||
    /\[?\s*(?:your company name|service provider name)\s*\]?/i.test(out.slice(-1800));
  const lacksByAnchors =
    identities.length >= 2 && !corpusSignatureBlocksHaveRequiredByLines(out, identities.length);
  if ((needsSignatureTail || lacksByAnchors) && identities.length >= 2) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(out, identities);
    if (!shouldRejectSignerIdentityCorpusShrink(out.length, rebuilt.text.length)) {
      out = rebuilt.text;
      if (rebuilt.count > 0) repairs.push(lacksByAnchors ? "signature:by_lines_added" : "signature:block_rebuilt");
    }
  }

  if (identities.length >= 2 && !corpusSignatureBlocksHaveRequiredByLines(out, identities.length)) {
    repairs.push("signature:by_lines_still_missing");
  }

  const handoffRenumber = renumberGuidedTopLevelSectionsSequentially(out);
  out = handoffRenumber.text;
  repairs.push(...handoffRenumber.repairs.map((r) => `handoff:${r}`));

  const orphanStrip = stripOrphanNumberedHeadingLines(out);
  out = orphanStrip.text;
  repairs.push(...orphanStrip.repairs.map((r) => `handoff:${r}`));

  return { body: out, repairs, hash: fingerprintAgreementBody(out) };
}

export function buildGuidedSignaturePacketFromManifest(
  manifest: CanonicalFinalPartyManifest,
  signFirst: boolean,
): CanonicalSignerManifest {
  const identities = manifestToCanonicalPartyIdentities(manifest);
  return {
    signFirst,
    entries: identities
      .filter((id) => id.partyDisplayName.trim().length > 0)
      .map((id, index) => ({
        partyName: id.partyDisplayName.trim(),
        signerName:
          id.representativeName?.trim() &&
          normLoosePartyName(id.representativeName) !== normLoosePartyName(id.partyDisplayName)
            ? id.representativeName.trim()
            : id.isIndividual
              ? id.partyDisplayName.trim()
              : id.representativeName?.trim() || id.partyDisplayName.trim(),
        title: id.title?.trim() || null,
        email: id.email.trim(),
        signingOrder: signFirst ? index : identities.length - index - 1,
        reviewStatus: "pending" as const,
        signatureStatus: "pending" as const,
      })),
  };
}

export function shouldBypassGenericOnGenerateForGuidedSignature(args: {
  createFlowPhase: string;
  signatureIntentActive: boolean;
  finalReviewSendPathChosen: boolean;
}): boolean {
  return (
    args.createFlowPhase === "guided_final_review" &&
    args.signatureIntentActive &&
    args.finalReviewSendPathChosen
  );
}

export function shouldBypassGenericOnGenerateForGuidedReview(args: {
  createFlowPhase: string;
  reviewIntentActive: boolean;
  finalReviewSendPathChosen: boolean;
}): boolean {
  return (
    args.createFlowPhase === "guided_final_review" &&
    args.reviewIntentActive &&
    args.finalReviewSendPathChosen
  );
}

export function logGuidedReviewGenericSendBypassed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-review-generic-send-bypassed]", payload);
}

export function logReviewFirstClick(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-click]", payload);
}

export function logReviewFirstHandoffStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-handoff-start]", payload);
}

export function logReviewFirstLinkCreated(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-link-created]", payload);
}

export function logReviewFirstNavigateDone(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-navigate-done]", payload);
}

export function logReviewFirstError(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-error]", payload);
}

export function logReviewFirstMarkerWritten(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-marker-written]", payload);
}

export function logReviewFirstPersistStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-persist-start]", payload);
}

export function logReviewFirstPersistComplete(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-persist-complete]", payload);
}

export function logReviewFirstMintStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-mint-start]", payload);
}

export function logReviewFirstMintSuccess(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-mint-success]", payload);
}

export function logReviewFirstMintError(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-mint-error]", payload);
}

export function logReviewFirstLegacySendBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-legacy-send-blocked]", payload);
}

export function logGuidedSignatureTrackStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-track-start]", payload);
}

export function logGuidedSignatureCorpusSelected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-corpus-selected]", payload);
}

export function logGuidedSignaturePacketBuilt(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-packet-built]", payload);
}

export function logGuidedSignatureRouteEntered(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-route-entered]", payload);
}

export function logGuidedSignatureTrackFailed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-track-failed]", payload);
}

export function logGuidedSignatureGenericSendBypassed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signature-generic-send-bypassed]", payload);
}

export const GUIDED_VS01_ALLOWED_CORPUS_SOURCES = new Set<GuidedSignatureTrackCorpusSource>([
  "finalized_signer_applied_guided_corpus",
  "finalized_signing_corpus",
  "accepted_review",
]);

export type GuidedVs01HandoffAssertion = {
  ok: boolean;
  reason?: string;
};

/** Hard gate before VS01 route — manifest + frozen corpus source only. */
export function assertGuidedVs01SigningHandoffReady(args: {
  manifest: CanonicalFinalPartyManifest;
  corpusSource: GuidedSignatureTrackCorpusSource | "none";
  corpusBody?: string;
}): GuidedVs01HandoffAssertion {
  const parties = args.manifest.parties.filter((p) => p.partyName.trim().length >= 2);
  if (parties.length < 2) {
    return { ok: false, reason: "manifest_party_count" };
  }
  if (args.corpusSource === "none" || !GUIDED_VS01_ALLOWED_CORPUS_SOURCES.has(args.corpusSource)) {
    return { ok: false, reason: "corpus_source_not_allowed" };
  }
  const body = (args.corpusBody || "").trim();
  if (body.length < GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN) {
    return { ok: false, reason: "corpus_too_short" };
  }
  if (!corpusHasVisibleSignatureExecutionLines(body)) {
    return { ok: false, reason: "missing_witness_block" };
  }
  const partyCount = Math.max(2, parties.length);
  if (!corpusSignatureBlocksHaveRequiredByLines(body, partyCount)) {
    return { ok: false, reason: "missing_by_signature_lines" };
  }
  const p0 = parties[0]!;
  const p1 = parties[1]!;
  if (p0.isIndividual && !p0.isSenderSide) {
    return { ok: false, reason: "sender_must_be_entity_or_primary" };
  }
  if (
    p0.signerName &&
    normLoosePartyName(p0.signerName) === normLoosePartyName(p1.partyName)
  ) {
    return { ok: false, reason: "party_nesting_detected" };
  }
  if (
    p1.signerName &&
    normLoosePartyName(p1.signerName) === normLoosePartyName(p0.partyName) &&
    normLoosePartyName(p1.partyName) !== normLoosePartyName(p1.signerName)
  ) {
    return { ok: false, reason: "counterparty_entity_mismatch" };
  }
  if (p1.isIndividual && p1.signerTitle?.trim() && !p1.signerName?.trim()) {
    return { ok: false, reason: "individual_title_without_signer" };
  }
  return { ok: true };
}
