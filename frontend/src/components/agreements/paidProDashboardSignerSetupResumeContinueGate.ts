/**
 * Dashboard resume Screen 2 / resume_signer_setup Continue gate.
 *
 * Live fail (4e18814c): remount restored legal entities but not authorized signer names,
 * and Continue finalize used an empty verified-GET review plain. Hydration then failed
 * `isPaidProSigningReadyHydratedCorpus` locally — "Signer details could not be applied"
 * with zero network. Fresh deals (4be31704) still work after typing names because SoT
 * is already in session.
 *
 * Bounded: restore persist/corpus/intake names into empty slots, and pick a resume
 * session corpus for finalize. Empty/invalid signers stay blocked.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  frozenSigningAuthorityToAuthorityParties,
} from "./paidProPaidReturnSignerFinalizedRestore";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import {
  isPaidProSigningReadyHydratedCorpus,
  resolvePaidProSignerFinalizeSigningReadyPlain,
} from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type LiveSignerMetadataUiState,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";

export type ResumePersistParty = {
  name?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  signerEmail?: string | null;
  email?: string | null;
};

export type DashboardSignerSetupResumeSignerFields = {
  partySignerNames: string[];
  partySignerTitles: string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyLegalNames: string[];
  extraPartyReviewEmails: string[];
  partyCount: number;
};

function cleanField(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function endTrim(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function isUsableAuthorizedSignerName(value: string): boolean {
  const v = cleanField(value);
  if (!v) return false;
  if (/^[_\s.\-–—]+$/.test(v)) return false;
  if (/^(name|title|by|date|email|address)\s*:?\s*$/i.test(v)) return false;
  if (/provided during signer setup/i.test(v)) return false;
  return true;
}

function isUsableSignerTitle(value: string): boolean {
  const v = cleanField(value);
  if (!v) return false;
  if (/^[_\s.\-–—]+$/.test(v)) return false;
  if (/^(name|title|by|date|email|address)\s*:?\s*$/i.test(v)) return false;
  return true;
}

/** Slot-isolated Name:/Title: from the execution block — never copy party 1 into party 2. */
export function extractExecutionBlockSignerFieldsBySlot(
  corpus: string,
  partyCount: number,
): { names: string[]; titles: string[] } {
  const count = Math.max(2, partyCount);
  const names = Array.from({ length: count }, () => "");
  const titles = Array.from({ length: count }, () => "");
  const witnessIdx = endTrim(corpus).search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { names, titles };
  const tail = corpus.slice(witnessIdx);
  const blocks = tail.split(/(?=^(?:CLIENT|SERVICE\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:)/im);
  let slot = 0;
  for (const block of blocks) {
    if (!/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY)/im.test(block.trim())) continue;
    if (slot >= count) break;
    const nameM = block.match(/^\s*Name:\s*(.*)$/im);
    const titleM = block.match(/^\s*Title:\s*(.*)$/im);
    const name = cleanField(nameM?.[1] ?? "");
    const title = cleanField(titleM?.[1] ?? "");
    if (isUsableAuthorizedSignerName(name)) names[slot] = name;
    if (isUsableSignerTitle(title)) titles[slot] = title;
    slot += 1;
  }
  return { names, titles };
}

function longestCorpus(candidates: readonly (string | null | undefined)[]): string {
  return candidates
    .map((t) => endTrim(t))
    .reduce((best, t) => (t.length > best.length ? t : best), "");
}

/** Longest painted / persist body available on resume remount (not verified-GET-only). */
export function resolveDashboardSignerSetupResumeSessionCorpus(args: {
  premiumFullDocumentText?: string | null;
  premiumServerFullDocumentText?: string | null;
  serverFullDocumentText?: string | null;
  acceptedPipelineReviewPlain?: string | null;
  paintedSequentialPersistPlain?: string | null;
  verifiedCommercialDisplayPlain?: string | null;
  agreementDocumentText?: string | null;
  hydratedPremiumBody?: string | null;
  lastPremiumWinningCorpus?: string | null;
  pipelineOutputBody?: string | null;
  paidProSourceOfTruthText?: string | null;
  purpose?: string | null;
}): string {
  return longestCorpus([
    args.premiumFullDocumentText,
    args.premiumServerFullDocumentText,
    args.serverFullDocumentText,
    args.acceptedPipelineReviewPlain,
    args.paintedSequentialPersistPlain,
    args.verifiedCommercialDisplayPlain,
    args.agreementDocumentText,
    args.hydratedPremiumBody,
    args.lastPremiumWinningCorpus,
    args.pipelineOutputBody,
    args.paidProSourceOfTruthText,
    args.purpose,
  ]);
}

/**
 * Finalize raw corpus for resume Continue. Verified commercial GET may be empty on
 * remount; fall back to the painted resume session body so typed names can hydrate.
 */
export function resolveDashboardSignerSetupResumeFinalizeRawCorpus(args: {
  authoritativePaidProReviewPlain?: string | null;
  simpleProFinalReviewPlain?: string | null;
  resumeSessionCorpus?: string | null;
}): ReturnType<typeof resolvePaidProSignerFinalizeRawCorpus> {
  const review = endTrim(args.authoritativePaidProReviewPlain);
  const resume = endTrim(args.resumeSessionCorpus);
  const reviewOrResume = review.length >= resume.length ? review : resume;
  return resolvePaidProSignerFinalizeRawCorpus({
    authoritativePaidProReviewPlain: reviewOrResume,
    simpleProFinalReviewPlain: args.simpleProFinalReviewPlain,
    immutableSourceOfTruthOnly: true,
  });
}

function legalNamesFromPersistParties(parties: readonly ResumePersistParty[]): string[] {
  return parties.map((p) => cleanField(p.name)).filter(Boolean);
}

/**
 * Restore authorized signer names/emails into empty slots from persist parties,
 * frozen signing authority, corpus Name: lines, and intake. Never overwrites a
 * non-empty typed UI value.
 */
export function restoreDashboardSignerSetupResumeSignerFields(args: {
  persistParties?: readonly ResumePersistParty[] | null;
  frozen?: FrozenSigningAuthoritySnapshotV1 | null;
  corpusText?: string | null;
  intakeText?: string | null;
  uiSignerNames?: readonly string[] | null;
  uiSignerTitles?: readonly string[] | null;
  uiEmails?: readonly string[] | null;
}): DashboardSignerSetupResumeSignerFields {
  const persistParties = args.persistParties ?? [];
  const persistLegal = legalNamesFromPersistParties(persistParties);
  const frozenParties = args.frozen ? frozenSigningAuthorityToAuthorityParties(args.frozen) : [];
  const frozenLegal = frozenParties.map((p) => cleanField(p.partyLegalName)).filter(Boolean);
  const legalEntities =
    persistLegal.length >= 2 ? persistLegal : frozenLegal.length >= 2 ? frozenLegal : persistLegal;

  const persistNames = persistParties.map((p) =>
    isUsableAuthorizedSignerName(p.signerName ?? "") ? cleanField(p.signerName) : "",
  );
  const persistTitles = persistParties.map((p) =>
    isUsableSignerTitle(p.signerTitle ?? "") ? cleanField(p.signerTitle) : "",
  );
  const persistEmails = persistParties.map((p) => cleanField(p.signerEmail) || cleanField(p.email));

  const frozenNames = frozenParties.map((p) =>
    isUsableAuthorizedSignerName(p.signerName) ? cleanField(p.signerName) : "",
  );
  const frozenTitles = frozenParties.map((p) =>
    isUsableSignerTitle(p.signerTitle) ? cleanField(p.signerTitle) : "",
  );
  const frozenEmails = frozenParties.map((p) => cleanField(p.signerEmail));

  const corpusFields = extractExecutionBlockSignerFieldsBySlot(args.corpusText ?? "", Math.max(legalEntities.length, 2));

  const resolved = resolveUniversalSignerMetadataBySlot({
    legalEntities: legalEntities.length >= 2 ? legalEntities : ["", ""],
    intakeText: args.intakeText,
    corpusText: null,
    draftParties: persistParties.map((p) => ({
      name: cleanField(p.name),
      signerName: cleanField(p.signerName),
      signerTitle: cleanField(p.signerTitle),
    })),
    uiSignerNames: args.uiSignerNames ?? [],
    uiSignerTitles: args.uiSignerTitles ?? [],
  });

  const count = Math.max(legalEntities.length, persistParties.length, frozenParties.length, 2);
  const partySignerNames: string[] = [];
  const partySignerTitles: string[] = [];
  const emails: string[] = [];
  const legal: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const typedName = cleanField(args.uiSignerNames?.[i]);
    const typedTitle = cleanField(args.uiSignerTitles?.[i]);
    const typedEmail = cleanField(args.uiEmails?.[i]);
    const resolvedName = isUsableAuthorizedSignerName(resolved[i]?.signerName ?? "")
      ? cleanField(resolved[i]?.signerName)
      : "";
    const resolvedTitle = isUsableSignerTitle(resolved[i]?.signerTitle ?? "")
      ? cleanField(resolved[i]?.signerTitle)
      : "";
    partySignerNames.push(
      typedName ||
        persistNames[i] ||
        frozenNames[i] ||
        corpusFields.names[i] ||
        resolvedName ||
        "",
    );
    partySignerTitles.push(
      typedTitle ||
        persistTitles[i] ||
        frozenTitles[i] ||
        corpusFields.titles[i] ||
        resolvedTitle ||
        "",
    );
    emails.push(typedEmail || persistEmails[i] || frozenEmails[i] || "");
    legal.push(persistLegal[i] || frozenLegal[i] || cleanField(resolved[i]?.entity) || "");
  }

  return {
    partySignerNames,
    partySignerTitles,
    recipient1Name: legal[0] || "",
    recipient2Name: legal[1] || "",
    recipient1Email: emails[0] || "",
    recipient2Email: emails[1] || "",
    extraPartyLegalNames: legal.slice(2),
    extraPartyReviewEmails: emails.slice(2),
    partyCount: count,
  };
}

export function evaluateDashboardSignerSetupResumeContinueGate(args: {
  partySignerNames: readonly string[];
  partySignerTitles?: readonly string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails?: readonly string[];
  extraPartyLegalNames?: readonly string[];
  intakeText?: string | null;
  rawCorpus: string;
}): {
  detailsComplete: boolean;
  signingReady: boolean;
  rejected: boolean;
  wouldBlockContinueWithoutNetwork: boolean;
  blockerMessage: string;
} {
  const gate = resolvePaidProSignerDetailsGate({
    partyCount: 2,
    intakeText: args.intakeText,
    draftPartyNames: [args.recipient1Name, args.recipient2Name],
    partySignerNames: args.partySignerNames,
    recipient1Name: args.recipient1Name,
    recipient2Name: args.recipient2Name,
    recipient1Email: args.recipient1Email,
    recipient2Email: args.recipient2Email,
    extraPartyReviewEmails: args.extraPartyReviewEmails ?? [],
    extraPartyLegalNames: args.extraPartyLegalNames,
  });
  if (!gate.complete) {
    return {
      detailsComplete: false,
      signingReady: false,
      rejected: false,
      wouldBlockContinueWithoutNetwork: true,
      blockerMessage: gate.blockerMessage,
    };
  }

  const ui: LiveSignerMetadataUiState = {
    partyCount: 2,
    recipient1Name: args.recipient1Name,
    recipient2Name: args.recipient2Name,
    recipient1Email: args.recipient1Email,
    recipient2Email: args.recipient2Email,
    extraPartyReviewEmails: [...(args.extraPartyReviewEmails ?? [])],
    extraPartyLegalNames: [...(args.extraPartyLegalNames ?? [])],
    partySignerNames: [...args.partySignerNames],
    partySignerTitles: [...(args.partySignerTitles ?? ["", ""])],
    partyAddresses: ["", ""],
  };
  const authority = buildLivePaidProSignerMetadataAuthority(ui, "live_ui", {
    intakeText: args.intakeText,
    draftPartyNames: [args.recipient1Name, args.recipient2Name],
  });
  setConsumedPaidProSignerMetadataAuthority(authority);
  const raw = endTrim(args.rawCorpus);
  if (raw.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      detailsComplete: true,
      signingReady: false,
      rejected: false,
      wouldBlockContinueWithoutNetwork: true,
      blockerMessage:
        "Signer details could not be applied to the agreement. Update signer details and finalize again before preparing for signing.",
    };
  }
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: raw,
    authority,
    intakeRaw: cleanField(args.intakeText),
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  const signingReadyPlain = resolvePaidProSignerFinalizeSigningReadyPlain({
    hydratedCorpus: hydrated.corpus,
    snapshotCorpus: hydrated.corpus,
  });
  const signingReady =
    !hydrated.rejected && isPaidProSigningReadyHydratedCorpus(signingReadyPlain);
  return {
    detailsComplete: true,
    signingReady,
    rejected: Boolean(hydrated.rejected),
    wouldBlockContinueWithoutNetwork: !signingReady,
    blockerMessage: signingReady
      ? ""
      : "Signer details could not be applied to the agreement. Update signer details and finalize again before preparing for signing.",
  };
}
