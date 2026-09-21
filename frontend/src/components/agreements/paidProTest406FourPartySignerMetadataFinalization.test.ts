/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  completedCorpusBodyMatchesFrozen,
  extractClauseBodyBeforeWitness,
} from "./paidProCompletedCorpusFrozenBodyCompare";
import {
  countOperativeIfToNoticeStanzas,
  hasBareEntityOnlyNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import {
  replacePaidProPipelineAcceptedCorpusAfterApprovedRevision,
} from "./paidProPipelineAcceptedCorpus";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST406_PARTY_ADDRESSES,
  TEST406_PARTY_EMAILS,
  TEST406_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST406_SIGNER_NAMES,
  TEST406_SIGNER_TITLES,
  test406Draft,
  test406LiveUiWithBlankExtraLegalNames,
  test406PartiesFromFinalizeUi,
} from "./paidProTest406Fixtures";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";
const ENTITIES = [RED, BLUE, HARBOR, IRON.replace(/\.$/, "")] as const;

function padBeforeWitness(base: string, minLen = 2000): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "";
  let i = 0;
  while (base.length + pad.length < minLen) {
    pad += `13. Supplemental Provisions\n\n13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

function buildTest406AcceptedCorpus(intake: string): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: intake,
    draft: test406Draft(),
  });
  expect(fallback.ok).toBe(true);
  return padBeforeWitness(fallback.body);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  clearPremiumPartyNamesHandoff();
  resetPremiumRecipientHandoffDedupForTests();
  clearAuthoritativeSigningSnapshot();
  vi.restoreAllMocks();
});

describe("TEST406_FOUR_PARTY_SIGNER_METADATA_FINALIZATION", () => {
  it("finalize keeps frozen clause bytes; four-party signer identity stays in metadata", () => {
    const draft = test406Draft();
    const intake = TEST406_PRODUCTION_QUAD_PARTY_INTAKE;
    const raw = buildTest406AcceptedCorpus(intake);

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    const acceptedText = padBeforeWitness(prep.text);
    markPaidProPipelineValidationPassed({ text: acceptedText, source: "server_full_draft_retry" });

    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const frozen = getPaidProSourceOfTruthText();
    const frozenHash = getPaidProSourceOfTruth()?.hash ?? "";
    const frozenClause = extractClauseBodyBeforeWitness(frozen);
    expect(frozenHash).toBe(hashPaidProCorpus(frozen));
    expect(countOperativeIfToNoticeStanzas(frozen)).toBe(4);

    const authority = buildPaidProSignerMetadataAuthorityForFinalize(test406LiveUiWithBlankExtraLegalNames(), {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    expect(authority.parties).toHaveLength(4);
    for (const entity of [RED, BLUE, HARBOR, IRON]) {
      expect(authority.parties.some((p) => p.partyLegalName.includes(entity.replace(/\.$/, "")))).toBe(true);
    }
    for (const [i, email] of Object.values(TEST406_PARTY_EMAILS).entries()) {
      expect(authority.parties[i]?.signerEmail).toBe(email);
    }
    for (const [i, name] of TEST406_SIGNER_NAMES.entries()) {
      expect(authority.parties[i]?.signerName).toBe(name);
      expect(authority.parties[i]?.signerTitle).toBe(TEST406_SIGNER_TITLES[i]);
    }
    for (const [i, addr] of Object.values(TEST406_PARTY_ADDRESSES).entries()) {
      expect(authority.parties[i]?.partyAddress.toLowerCase()).toContain(addr.toLowerCase().slice(0, 8));
    }

    writePremiumRecipientHandoffFromAuthorityParties(authority.parties);
    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);

    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    expect(hydrated.corpus).not.toMatch(/If to\s*:\s*\n/i);
    expect(hashPaidProCorpus(getPaidProSourceOfTruthText())).toBe(frozenHash);

    expect(
      consumeAuthoritativeSignerCount("test406_finalize_hydrate_authority", {
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: hydrated.corpus,
      }),
    ).toBe(4);

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(completedCorpusBodyMatchesFrozen(reviewPlain, frozen)).toBe(true);
    expect(extractClauseBodyBeforeWitness(reviewPlain)).toBe(frozenClause);
    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);
    expect(countOperativeIfToNoticeStanzas(reviewPlain)).toBe(4);
    for (const email of Object.values(TEST406_PARTY_EMAILS)) {
      expect(extractClauseBodyBeforeWitness(reviewPlain)).not.toContain(email);
    }

    const witnessIdx = reviewPlain.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = witnessIdx >= 0 ? reviewPlain.slice(witnessIdx) : "";
    for (const entity of ENTITIES) {
      expect(tail).toMatch(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    for (const name of TEST406_SIGNER_NAMES) {
      expect(tail).toContain(name);
    }
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect(getPaidProSourceOfTruth()?.hash).toBe(frozenHash);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    createAuthoritativeSigningSnapshot({
      corpus: frozen,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: intake,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    const snapshot = getAuthoritativeSigningSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.signerMetadata.partySignerNames).toEqual([...TEST406_SIGNER_NAMES]);
    expect(snapshot!.signerMetadata.partySignerTitles).toEqual([...TEST406_SIGNER_TITLES]);
    expect(extractClauseBodyBeforeWitness(snapshot!.corpus)).toBe(frozenClause);

    const vs01 = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: reviewPlain,
      draft: { parties: draft.parties.map((p) => ({ name: p.name })) } as never,
      intakeText: intake,
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
    });
    expect(vs01.allowed).toBe(true);
    expect(vs01.signerCount).toBe(4);
    if (vs01.allowed) {
      expect(extractClauseBodyBeforeWitness(vs01.corpus)).toBe(frozenClause);
    }

    const partiesFromUi = test406PartiesFromFinalizeUi();
    expect(partiesFromUi).toHaveLength(4);
    expect(partiesFromUi[2]?.partyLegalName).toContain("Harbor Peak");
    expect(partiesFromUi[3]?.partyLegalName).toContain("Iron Vale");
  });

  it("operative notice rewrite requires explicit revision and cannot skip to signing", () => {
    const draft = test406Draft();
    const intake = TEST406_PRODUCTION_QUAD_PARTY_INTAKE;
    const acceptedText = padBeforeWitness(
      preparePaidProServerDocumentForAcceptance(buildTest406AcceptedCorpus(intake), draft, intake).text,
    );
    markPaidProPipelineValidationPassed({ text: acceptedText, source: "server_full_draft_retry" });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const frozen = getPaidProSourceOfTruthText();
    const frozenHash = getPaidProSourceOfTruth()?.hash ?? "";
    const injectedNotice = frozen.replace(
      /Email:\s*provided during signer setup/i,
      `Email: ${TEST406_PARTY_EMAILS.red}`,
    );
    expect(injectedNotice).not.toBe(frozen);

    const unauthorizedReview = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(extractClauseBodyBeforeWitness(unauthorizedReview)).toBe(extractClauseBodyBeforeWitness(frozen));
    expect(getPaidProSourceOfTruth()?.hash).toBe(frozenHash);
    const blockedVs01 = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: injectedNotice,
      draft: { parties: draft.parties.map((p) => ({ name: p.name })) } as never,
      intakeText: intake,
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
    });
    expect(blockedVs01.allowed).toBe(true);
    if (blockedVs01.allowed) {
      expect(extractClauseBodyBeforeWitness(blockedVs01.corpus)).toBe(extractClauseBodyBeforeWitness(frozen));
      expect(extractClauseBodyBeforeWitness(blockedVs01.corpus)).not.toContain(TEST406_PARTY_EMAILS.red);
    }

    replacePaidProPipelineAcceptedCorpusAfterApprovedRevision(injectedNotice);
    establishPaidProSourceOfTruth({
      text: injectedNotice,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
      allowShorterOverwrite: true,
    });
    expect(getPaidProSourceOfTruth()?.hash).not.toBe(frozenHash);
    expect(getPaidProSourceOfTruthText()).toContain(TEST406_PARTY_EMAILS.red);
  });
});
