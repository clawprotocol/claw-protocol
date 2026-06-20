/**
 * Paid Pro signer metadata authority diagnostics — review, copy, export, signing-prep parity.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractExecutionBlockSignerLines } from "./paidProSignerMetadataHandoffExtract";
import {
  readConsumedPaidProSignerMetadataAuthority,
  type LiveSignerMetadataUiState,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderSource } from "./paidProReviewRenderCorpus";

/** Contact authority: notice email/address live in signer metadata and Notices clause — not execution blocks. */
export const PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY = {
  emailAddressVisibleInExecutionBlock: false,
  physicalAddressVisibleInExecutionBlock: false,
  emailAddressVisibleInAgreementBody: false,
  physicalAddressVisibleInAgreementBody: false,
  emailAddressRequiredForSigningPayload: true,
  physicalAddressRequiredForSigningPayload: false,
  noticeContactGovernedByNoticesClause: true,
} as const;

export type PaidProSignerAuthorityDiagnosticPayload = {
  entityNames: string[];
  signerNames: string[];
  signerTitles: string[];
  signerEmails: string[];
  signerAddresses: string[];
  source: string;
  visibleBodyPolicy: typeof PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY;
};

export type PaidProFinalDisplayCopyParityPayload = {
  displayHash: string;
  copyHash: string;
  exportHash: string;
  signerPrepHash: string;
  signerNamesPresent: boolean;
  signerTitlesPresent: boolean;
  signerEmailsPresentInBody: boolean;
  signerAddressesPresentInBody: boolean;
  signerEmailsPresentInAuthority: boolean;
  signerAddressesPresentInAuthority: boolean;
  source: string;
};

export type PaidProHydrationAuthorityPayload = {
  hydratedSignerCount: number;
  hydratedTitleCount: number;
  hydratedEmailCount: number;
  hydratedAddressCount: number;
  source: string;
  selectedCorpusSource: string;
};

export type CollectPaidProSignerAuthorityDiagnosticsArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  liveSignerMetadataUi?: LiveSignerMetadataUiState | null;
  reviewPlain?: string | null;
  copyPlain?: string | null;
  exportPlain?: string | null;
  signerPrepPlain?: string | null;
};

function partiesFromArgs(args: CollectPaidProSignerAuthorityDiagnosticsArgs) {
  return resolvePartiesForReviewRender(args);
}

function bodyHasEmail(corpus: string, email: string): boolean {
  const e = email.trim();
  return e.length >= 3 && corpus.includes(e);
}

function bodyHasAddress(corpus: string, address: string): boolean {
  const a = address.trim();
  return a.length >= 4 && corpus.includes(a);
}

export function buildPaidProSignerAuthorityDiagnosticPayload(
  args: CollectPaidProSignerAuthorityDiagnosticsArgs,
): PaidProSignerAuthorityDiagnosticPayload {
  const parties = partiesFromArgs(args);
  const renderSource = resolvePaidProReviewRenderSource(args);
  return {
    entityNames: parties.map((p) => p.partyLegalName.trim()),
    signerNames: parties.map((p) => p.signerName.trim()),
    signerTitles: parties.map((p) => p.signerTitle.trim()),
    signerEmails: parties.map((p) => p.signerEmail.trim()),
    signerAddresses: parties.map((p) => p.partyAddress.trim()),
    source: renderSource.source,
    visibleBodyPolicy: PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY,
  };
}

export function buildPaidProFinalDisplayCopyParityPayload(
  args: CollectPaidProSignerAuthorityDiagnosticsArgs,
): PaidProFinalDisplayCopyParityPayload {
  const parties = partiesFromArgs(args);
  const review = (args.reviewPlain ?? "").trim();
  const copy = (args.copyPlain ?? review).trim();
  const exportPlain = (args.exportPlain ?? copy).trim();
  const signerPrep = (args.signerPrepPlain ?? copy).trim();
  const renderSource = resolvePaidProReviewRenderSource(args);
  const authority = readConsumedPaidProSignerMetadataAuthority()?.parties ?? parties;

  const signerNamesPresent = parties.every((p) => {
    const name = p.signerName.trim();
    return !name || review.includes(name);
  });
  const signerTitlesPresent = parties.every((p) => {
    const title = p.signerTitle.trim();
    return !title || review.includes(title);
  });

  return {
    displayHash: hashPaidProCorpus(review),
    copyHash: hashPaidProCorpus(copy),
    exportHash: hashPaidProCorpus(exportPlain),
    signerPrepHash: hashPaidProCorpus(signerPrep),
    signerNamesPresent,
    signerTitlesPresent,
    signerEmailsPresentInBody: parties.some((p) => bodyHasEmail(review, p.signerEmail)),
    signerAddressesPresentInBody: parties.some((p) => bodyHasAddress(review, p.partyAddress)),
    signerEmailsPresentInAuthority: authority.some((p) => p.signerEmail.trim().length >= 3),
    signerAddressesPresentInAuthority: authority.some((p) => p.partyAddress.trim().length >= 4),
    source: renderSource.source,
  };
}

export function buildPaidProHydrationAuthorityPayload(
  args: CollectPaidProSignerAuthorityDiagnosticsArgs,
): PaidProHydrationAuthorityPayload {
  const parties = partiesFromArgs(args);
  const review = (args.reviewPlain ?? "").trim();
  const renderSource = resolvePaidProReviewRenderSource(args);
  let hydratedSignerCount = 0;
  let hydratedTitleCount = 0;
  let hydratedEmailCount = 0;
  let hydratedAddressCount = 0;

  parties.forEach((party, index) => {
    const exec = extractExecutionBlockSignerLines(review, index);
    if (party.signerName.trim() && exec.nameLine === party.signerName.trim()) hydratedSignerCount += 1;
    if (party.signerTitle.trim() && exec.titleLine === party.signerTitle.trim()) hydratedTitleCount += 1;
    if (party.signerEmail.trim().length >= 3) hydratedEmailCount += 1;
    if (party.partyAddress.trim().length >= 4) hydratedAddressCount += 1;
  });

  return {
    hydratedSignerCount,
    hydratedTitleCount,
    hydratedEmailCount,
    hydratedAddressCount,
    source: renderSource.source,
    selectedCorpusSource: renderSource.source,
  };
}

export function logPaidProSignerAuthorityDiagnostics(
  args: CollectPaidProSignerAuthorityDiagnosticsArgs & { surface: string },
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-authority]", buildPaidProSignerAuthorityDiagnosticPayload(args));
  // eslint-disable-next-line no-console
  console.info(
    "[paid-pro-final-display-copy-parity]",
    buildPaidProFinalDisplayCopyParityPayload(args),
  );
  // eslint-disable-next-line no-console
  console.info("[paid-pro-hydration-authority]", buildPaidProHydrationAuthorityPayload(args));
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-contact-policy]", PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY);
}
