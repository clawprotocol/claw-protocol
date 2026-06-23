/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { applyPaidProUserVisibleDisplayPrep } from "./paidProDisplayPlainAuthority";
import { hasBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
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
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { buildAcceptedQuadPartyServerCorpus, padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST407_PARTY_ADDRESSES,
  TEST407_PARTY_EMAILS,
  TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST407_SIGNER_NAMES,
  TEST407_SIGNER_TITLES,
  test407Draft,
  test407LiveUiWithBlankExtraLegalNames,
} from "./paidProTest407Fixtures";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

const METADATA_FIELDS = [
  "partyLegalName",
  "signerName",
  "signerTitle",
  "signerEmail",
  "partyAddress",
] as const;

function extractNoticeStanzas(text: string): string[] {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  return region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
}

function executionTail(text: string): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return witnessIdx >= 0 ? text.slice(witnessIdx) : "";
}

function assertMetadataPreserved(
  label: string,
  expected: readonly PaidProSignerMetadataParty[],
  actual: readonly PaidProSignerMetadataParty[],
): void {
  expect(actual, label).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    for (const field of METADATA_FIELDS) {
      expect(actual[i]?.[field], `${label}:${field}:party${i}`).toBe(expected[i]?.[field]);
    }
  }
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  clearPremiumPartyNamesHandoff();
  clearAuthoritativeSigningSnapshot();
  resetPremiumRecipientHandoffDedupForTests();
  vi.restoreAllMocks();
});

describe("TEST407_FOUR_PARTY_AUTHORITY_CONSISTENCY", () => {
  it("preserves immutable 4-party authority across handoff, snapshot, review, and VS01 without downstream reconstruction", () => {
    const draft = test407Draft();
    const intake = TEST407_PRODUCTION_QUAD_PARTY_INTAKE;
    const raw = buildAcceptedQuadPartyServerCorpus(intake, draft).replace(
      /Electronic signatures[\s\S]*?original signatures\.\s*SIGNATURES/gi,
      "Electronic signatures, including signatures delivered through an electronic signing platform, are binding and effective as original signatures.",
    );

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    const acceptedText = padOperativeCorpusBeforeWitness(prep.text);
    markPaidProPipelineValidationPassed({ text: acceptedText, source: "server_full_draft_retry" });

    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const authority = buildPaidProSignerMetadataAuthorityForFinalize(test407LiveUiWithBlankExtraLegalNames(), {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    expect(authority.parties).toHaveLength(4);

    writePremiumRecipientHandoffFromAuthorityParties(authority.parties);
    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const handoffSlots = linearPremiumRecipientSlots(handoff, 4);
    expect(handoffSlots).toHaveLength(4);
    assertMetadataPreserved(
      "handoff",
      authority.parties,
      handoffSlots.map((slot, partyIndex) => ({
        partyIndex,
        partyLegalName: slot.name ?? "",
        signerName: slot.signerName ?? "",
        signerTitle: slot.signerTitle ?? "",
        signerEmail: slot.email ?? "",
        partyAddress: slot.partyAddress ?? "",
      })),
    );

    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: acceptedText,
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, { intakeText: intake }),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: authorityPartiesToCanonicalPartyIdentities(authority.parties, { intakeText: intake }),
        signFirst: true,
      }),
      intakeText: intake,
      authorityParties: authority.parties,
    });

    const snapshotCorpus = readAuthoritativeSigningCorpus();
    expect(snapshotCorpus.length).toBeGreaterThan(500);
    expect(snapshotCorpus).toContain(TEST407_PARTY_EMAILS.red);
    expect(snapshotCorpus).toMatch(/If to Red Mesa[\s\S]*Email:\s*cryptocurated21\+1@gmail\.com/i);

    expect(
      resolveAuthoritativeSignerCount({
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
      }).count,
    ).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("test407_consumed_authority", {
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: snapshotCorpus,
      }),
    ).toBe(4);

    const postFinalizePlain = resolvePaidProPostFinalizeReviewPlain(draft);
    expect(postFinalizePlain).toMatch(/If to Red Mesa[\s\S]*Email:\s*cryptocurated21\+1@gmail\.com/i);

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const visiblePlain = applyPaidProUserVisibleDisplayPrep(reviewPlain);

    expect(reviewPlain).toMatch(/If to Red Mesa[\s\S]*Email:\s*cryptocurated21\+1@gmail\.com/i);

    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(reviewPlain).not.toMatch(/original signatures\.\s+SIGNATURES/i);
    expect(visiblePlain).not.toMatch(/original signatures\.\s+SIGNATURES/i);

    const record = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    expect(frozen?.hash).toBeTruthy();
    const freezeHash = hashPaidProCorpus(record.text);
    const displayHash = hashPaidProCorpus(visiblePlain);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: visiblePlain, intakeText: intake, draft });
    expect(parity.invariantOk).toBe(true);
    const snapshotDisplayHash = hashPaidProCorpus(applyPaidProUserVisibleDisplayPrep(snapshotCorpus));
    expect(displayHash).toBe(snapshotDisplayHash);
    expect(reviewPlain).toBe(visiblePlain);

    const stanzas = extractNoticeStanzas(visiblePlain);
    expect(stanzas).toHaveLength(4);
    expect(hasBareEntityOnlyNoticeStanzas(visiblePlain)).toBe(false);

    const entities = [RED, BLUE, HARBOR, IRON.replace(/\.$/, "")];
    const emails = Object.values(TEST407_PARTY_EMAILS);
    const addresses = Object.values(TEST407_PARTY_ADDRESSES);

    stanzas.forEach((stanza, i) => {
      expect(stanza).toContain(entities[i]!);
      expect(stanza).toContain(TEST407_SIGNER_NAMES[i]!);
      expect(stanza).toContain(TEST407_SIGNER_TITLES[i]!);
      expect(stanza).toMatch(new RegExp(`Email:\\s*${emails[i]!.replace(/[.+]/g, "\\$&")}`, "i"));
      for (const part of addresses[i]!.split(/,\s*/).filter(Boolean)) {
        expect(stanza).toContain(part.trim());
      }
    });

    const tail = executionTail(visiblePlain);
    expect(tail).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(tail).not.toMatch(/^\s*SERVICE\s+PROVIDER\s*:/im);
    expect(tail).not.toMatch(/^\s*PARTY\s+\d+\s*:/im);
    for (const entity of entities) {
      expect(tail).toMatch(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    for (const signer of TEST407_SIGNER_NAMES) {
      expect(tail).toContain(signer);
    }

    expect(countPaidProExecutionBlocks(visiblePlain)).toBe(1);
    expect(freezeHash).toBeTruthy();

    const vs01 = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: visiblePlain,
      draft: { parties: draft.parties.map((p) => ({ name: p.name })) } as never,
      intakeText: intake,
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
    });
    expect(vs01.allowed).toBe(true);
    expect(vs01.signerCount).toBe(4);
  });
});
