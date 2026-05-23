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
  type CanonicalPartyIdentity,
} from "./signerPartyIdentity";

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

/** Prefer longest frozen/authoritative plain text; never pick a short rendered preview over a full corpus. */
export function resolveGuidedSigningAuthoritativePlain(
  args: ResolveGuidedSigningAuthoritativeArgs,
): string {
  const minLen = args.minLen ?? 500;
  const authoritativeCandidates = [
    args.snapshot,
    args.accepted,
    args.finalReviewCorpus,
    args.guidedAuthoritative,
  ]
    .map((t) => (t || "").trim())
    .filter((t) => t.length >= minLen);
  const longest = authoritativeCandidates.sort((a, b) => b.length - a.length)[0] ?? "";
  const rendered = (args.renderedPreview || "").trim();
  if (
    longest.length >= GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN &&
    rendered.length > 0 &&
    rendered.length < longest.length * 0.8
  ) {
    return longest;
  }
  return longest || rendered;
}

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
    .replace(/ {2,}/g, " ");
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

/** Final corpus cleanup before signing: spacing, placeholders, dedupe, signature block. */
export function prepareGuidedSigningCorpusCleanup(args: {
  body: string;
  partyManifest: CanonicalFinalPartyManifest;
  signerIdentities?: readonly CanonicalPartyIdentity[];
}): { body: string; repairs: string[]; hash: string } {
  const identities =
    args.signerIdentities ?? manifestToCanonicalPartyIdentities(args.partyManifest);
  const repairs: string[] = [];
  let out = normalizePartyNameSpacingInCorpus((args.body || "").trim());
  repairs.push("spacing:party_names");

  const banner = removeDraftTemplateBannerFromCorpus(out);
  out = banner.text;
  repairs.push(...banner.repairs);

  const stripped = stripGuidedPlaceholderBracketArtifacts(out);
  out = stripped.text;
  repairs.push(...stripped.repairs);

  const manifestPatch = applyCanonicalManifestPlaceholdersToCorpus(out, args.partyManifest);
  out = manifestPatch.text;
  repairs.push(...manifestPatch.repairs);

  const dedupe = dedupeGuidedAnswerClauses(out);
  out = dedupe.text;
  repairs.push(...dedupe.repairs);

  out = normalizePartyNameSpacingInCorpus(out);
  repairs.push("spacing:post_manifest");

  const needsSignatureTail =
    !/\bIN WITNESS WHEREOF\b/i.test(out) ||
    /name\s*:\s*_{4,}/i.test(out.slice(-1800)) ||
    /\[?\s*(?:your company name|service provider name)\s*\]?/i.test(out.slice(-1800));
  if (needsSignatureTail && identities.length >= 2) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(out, identities);
    out = rebuilt.text;
    if (rebuilt.count > 0) repairs.push("signature:block_rebuilt");
  }

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
