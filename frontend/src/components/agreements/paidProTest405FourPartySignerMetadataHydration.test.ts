/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as paidProAgreementPolish from "./paidProAgreementPolish";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { hasBareEntityOnlyNoticeStanzas, isOperativeIfToNoticeStanzaHeading } from "./paidProPartyNoticeDetails";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { resolvePaidProFrozenUserVisibleReviewDisplayHash } from "./paidProDisplayPlainAuthority";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { buildAcceptedQuadPartyServerCorpus, padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST405_PARTY_ADDRESSES,
  TEST405_PARTY_EMAILS,
  TEST405_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST405_SIGNER_NAMES,
  TEST405_SIGNER_TITLES,
  test405Draft,
  test405Parties,
} from "./paidProTest405Fixtures";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveSignerSetupUiPartyCount } from "./paidProNPartySignerSetup";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc";

function countIfToNoticeStanzas(text: string): number {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  return (region.match(/^If to\s+/gim) || []).length;
}

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

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  vi.restoreAllMocks();
});

describe("TEST405_FOUR_PARTY_SIGNER_METADATA_HYDRATION", () => {
  it("hydrates all 4 notice stanzas, preserves 4-party execution, and keeps display hash parity", () => {
    const draft = test405Draft();
    const intake = TEST405_PRODUCTION_QUAD_PARTY_INTAKE;
    const parties = test405Parties();
    const raw = buildAcceptedQuadPartyServerCorpus(intake, draft);

    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test405",
      updatedAt: 0,
    });

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

    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test405",
      updatedAt: Date.now(),
    });

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const polishSpy = vi.spyOn(paidProAgreementPolish, "polishPaidProAgreementText");

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });

    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(polishSpy).not.toHaveBeenCalled();

    expect(reviewPlain).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis /m);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain, intakeText: intake, draft });
    expect(parity.invariantOk).toBe(true);

    const displayBaselineHash = resolvePaidProFrozenUserVisibleReviewDisplayHash({
      intakeText: intake,
      draft,
    });
    expect(displayBaselineHash).toBeTruthy();
    expect(hashPaidProCorpus(reviewPlain)).toBe(displayBaselineHash);

    expect(countIfToNoticeStanzas(reviewPlain)).toBe(4);
    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);
    expect(reviewPlain).not.toMatch(/If to\s*:\s*\n/i);

    const stanzas = extractNoticeStanzas(reviewPlain);
    expect(stanzas).toHaveLength(4);

    const entities = [RED, BLUE, HARBOR, IRON];
    const emails = Object.values(TEST405_PARTY_EMAILS);
    const addresses = Object.values(TEST405_PARTY_ADDRESSES);

    stanzas.forEach((stanza, i) => {
      expect(isOperativeIfToNoticeStanzaHeading(stanza.split("\n")[0] ?? "")).toBe(true);
      expect(stanza).toContain(entities[i]!);
      expect(stanza).toContain(TEST405_SIGNER_NAMES[i]!);
      expect(stanza).toContain(TEST405_SIGNER_TITLES[i]!);
      expect(stanza).toContain(emails[i]!);
      expect(stanza).toContain(addresses[i]!.slice(0, 12));
      expect(stanza).not.toContain("Primary business address and email on file with the other Parties.");
    });

    const tail = executionTail(reviewPlain);
    for (const name of entities) {
      expect(tail).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    for (const signer of TEST405_SIGNER_NAMES) {
      expect(tail).toMatch(new RegExp(signer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }

    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect((reviewPlain.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);

    const resolution = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: reviewPlain,
    });
    expect(resolution.count).toBe(4);

    expect(
      consumeAuthoritativeSignerCount("test405_metadata_authority", {
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: reviewPlain,
      }),
    ).toBe(4);

    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 2,
        draftParties: draft.parties,
        intakeText: intake,
      }),
    ).toBe(4);

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

    const record = getPaidProSourceOfTruth()!;
    expect(hashPaidProCorpus(record.text)).toBeTruthy();
  });
});
