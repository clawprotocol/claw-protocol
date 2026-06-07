/**
 * TEST307 diagnostics — final corpus source, signer contact overlay, title/opening guard.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  detectPaidProMalformedServicesOpening,
  PAID_PRO_CANONICAL_TITLE_RE,
} from "./paidProOpeningRecitalGuard";
import { canonicalPartyRecordsFromSignerIdentities } from "./canonicalPartyIdentityResolver";
import {
  authorityPartiesToCanonicalPartyIdentities,
  readConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";

export type PaidProFinalCorpusSourceDiagnostic = {
  surface: string;
  selectedSource: string;
  forcedPremiumSource: boolean;
  renderedLen: number;
  hydratedLen: number;
  signerOverlayApplied: boolean;
  contactOverlayApplied: boolean;
  blockedFallbackReason: string | null;
};

export type PaidProSignerContactOverlayDiagnostic = {
  partyCount: number;
  signerNamesPresent: boolean;
  signerTitlesPresent: boolean;
  signerEmailsPresent: boolean;
  signerAddressesPresent: boolean;
  source: string;
};

export type PaidProTitleOpeningGuardDiagnostic = {
  title: string;
  hasGenericPartyLabels: boolean;
  hasProfessionalTitle: boolean;
  legalNamesPreserved: boolean;
  repaired: boolean;
};

export function buildPaidProFinalCorpusSourceDiagnostic(args: {
  surface: string;
  selectedSource: string;
  forcedPremiumSource?: boolean;
  renderedLen: number;
  hydratedLen?: number;
  signerOverlayApplied?: boolean;
  contactOverlayApplied?: boolean;
  blockedFallbackReason?: string | null;
}): PaidProFinalCorpusSourceDiagnostic {
  return {
    surface: args.surface,
    selectedSource: args.selectedSource,
    forcedPremiumSource: Boolean(args.forcedPremiumSource),
    renderedLen: args.renderedLen,
    hydratedLen: args.hydratedLen ?? args.renderedLen,
    signerOverlayApplied: Boolean(args.signerOverlayApplied),
    contactOverlayApplied: Boolean(args.contactOverlayApplied),
    blockedFallbackReason: args.blockedFallbackReason ?? null,
  };
}

export function buildPaidProSignerContactOverlayDiagnostic(args: {
  reviewPlain: string;
  parties?: readonly PaidProSignerMetadataParty[];
  source: string;
}): PaidProSignerContactOverlayDiagnostic {
  const parties = args.parties ?? readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  const corpus = (args.reviewPlain || "").trim();
  const lower = corpus.toLowerCase();
  return {
    partyCount: parties.length,
    signerNamesPresent: parties.every((p) => {
      const name = p.signerName.trim();
      return !name || lower.includes(name.toLowerCase());
    }),
    signerTitlesPresent: parties.every((p) => {
      const title = p.signerTitle.trim();
      return !title || lower.includes(title.toLowerCase());
    }),
    signerEmailsPresent: parties.every((p) => {
      const email = p.signerEmail.trim();
      return !email || corpus.includes(email);
    }),
    signerAddressesPresent: parties.every((p) => {
      const address = p.partyAddress.trim();
      return !address || corpus.includes(address);
    }),
    source: args.source,
  };
}

export function buildPaidProTitleOpeningGuardDiagnostic(args: {
  reviewPlain: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  repaired?: boolean;
}): PaidProTitleOpeningGuardDiagnostic {
  const corpus = (args.reviewPlain || "").trim();
  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  const records =
    parties.length >= 2
      ? canonicalPartyRecordsFromSignerIdentities(
          authorityPartiesToCanonicalPartyIdentities(parties, {
            intakeText: args.intakeText ?? null,
            draftPartyNames:
              args.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ??
              null,
            acceptedCorpus: corpus,
          }),
        )
      : [];
  const titleMatch = corpus.match(PAID_PRO_CANONICAL_TITLE_RE);
  const legalNames = records.map((r) => r.fullLegalName.trim()).filter(Boolean);
  return {
    title: titleMatch?.[0] ?? corpus.split("\n").find((l) => l.trim())?.trim() ?? "",
    hasGenericPartyLabels: /\(\s*["']?party["']?\s*\)/i.test(corpus.slice(0, 6000)),
    hasProfessionalTitle: Boolean(titleMatch),
    legalNamesPreserved: legalNames.every((name) => corpus.includes(name)),
    repaired: Boolean(args.repaired),
  };
}

export function logPaidProTest307Diagnostics(args: {
  surface: string;
  selectedSource: string;
  reviewPlain: string;
  copyPlain?: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const reviewPlain = (args.reviewPlain || "").trim();
  const copyPlain = (args.copyPlain ?? reviewPlain).trim();
  const hydratedLen = hasAuthoritativeSigningSnapshot()
    ? resolvePaidProPostFinalizeReviewPlain().length
    : reviewPlain.length;
  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  const contact = buildPaidProSignerContactOverlayDiagnostic({
    reviewPlain,
    parties,
    source: args.selectedSource,
  });
  const title = buildPaidProTitleOpeningGuardDiagnostic({
    reviewPlain,
    draft: args.draft,
    intakeText: args.intakeText,
    repaired: !detectPaidProMalformedServicesOpening(
      reviewPlain,
      parties?.length >= 2
        ? canonicalPartyRecordsFromSignerIdentities(
            authorityPartiesToCanonicalPartyIdentities(parties),
          )
        : undefined,
    ),
  });
  // eslint-disable-next-line no-console
  console.info(
    "[paid-pro-final-corpus-source]",
    buildPaidProFinalCorpusSourceDiagnostic({
      surface: args.surface,
      selectedSource: args.selectedSource,
      renderedLen: reviewPlain.length,
      hydratedLen,
      signerOverlayApplied: contact.signerNamesPresent && contact.signerTitlesPresent,
      contactOverlayApplied: contact.signerEmailsPresent && contact.signerAddressesPresent,
      blockedFallbackReason: reviewPlain.length < 500 ? "empty_render" : null,
    }),
  );
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-contact-overlay]", contact);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-title-opening-guard]", title);
  if (copyPlain && hashPaidProCorpus(copyPlain) !== hashPaidProCorpus(reviewPlain)) {
    // eslint-disable-next-line no-console
    console.warn("[paid-pro-final-display-copy-parity]", {
      displayHash: hashPaidProCorpus(reviewPlain),
      copyHash: hashPaidProCorpus(copyPlain),
    });
  }
}
