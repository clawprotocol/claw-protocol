import type { AgreementParty } from "../agreement/agreementTypes";
import { countRequiredSignersFromParties } from "../agreement/resolveRequiredSignerCount";
import { extractTitleFromCorpusPlain } from "../components/agreements/paidProUniversalDisplayTitle";

function displayTitle(title: string): string {
  const t = (title || "").trim();
  if (t.length <= 2) return "Untitled agreement";
  return t;
}

export type SignedRecordDisplayTitleSource = "corpus-title-line" | "corpus-recital" | "draft";

export type SignedRecordDisplayTitleResolution = {
  title: string;
  source: SignedRecordDisplayTitleSource;
};

/**
 * Chrome title for a completed / signed record.
 * Prefer the accepted or signed corpus heading over a stale intake/draft title.
 * Does not rewrite the stored paper.
 */
export function resolveSignedRecordDisplayTitle(args: {
  draftTitle?: string | null;
  corpusText?: string | null;
}): SignedRecordDisplayTitleResolution {
  const fromCorpus = extractTitleFromCorpusPlain(args.corpusText);
  if (fromCorpus?.title) {
    const source: SignedRecordDisplayTitleSource =
      fromCorpus.source === "corpus-recital" ? "corpus-recital" : "corpus-title-line";
    return { title: displayTitle(fromCorpus.title), source };
  }
  return { title: displayTitle(args.draftTitle ?? ""), source: "draft" };
}

export type OwnerSignedSignatureSummaryArgs = {
  signerPartyCount?: number | null;
  signaturesRecorded?: number | null;
  fullyExecuted?: boolean | null;
  parties?: readonly AgreementParty[] | null;
};

/**
 * Final-page signature summary.
 * Required count is the larger of public-verify signer_party_count and
 * independently counted signing parties. Completed signatures never become
 * the required denominator. Missing required information is not fabricated
 * as "1 of 1".
 */
export function formatOwnerSignedSignatureSummary(args: OwnerSignedSignatureSummaryArgs): string | null {
  const fromParties = countRequiredSignersFromParties(args.parties);
  const fromApi =
    typeof args.signerPartyCount === "number" &&
    Number.isFinite(args.signerPartyCount) &&
    args.signerPartyCount > 0
      ? args.signerPartyCount
      : 0;
  const required = Math.max(fromApi, fromParties);
  const recorded = Math.max(0, args.signaturesRecorded ?? 0);

  if (required <= 0) {
    if (args.fullyExecuted) return "Fully signed";
    if (recorded > 0) return `${recorded} signatures recorded`;
    return null;
  }

  if (args.fullyExecuted && recorded >= required) {
    return `Fully signed (${required} of ${required})`;
  }
  if (args.fullyExecuted && recorded === 0) {
    return `Fully signed (${required} of ${required})`;
  }
  if (recorded > 0) return `${recorded} of ${required} signed`;
  return null;
}
