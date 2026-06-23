/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import { hasBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
import { countSignerMetadataSlots } from "./signerMetadataEffective";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
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
  TEST403_PRODUCTION_QUAD_PARTY_INTAKE,
  test403Draft,
  test403Parties,
} from "./paidProTest403Fixtures";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { readPremiumRecipientHandoff, writePremiumRecipientHandoffLinear } from "./premiumPartyNamesHandoff";

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

function noticeStanzasHaveProfessionalDestinations(text: string): boolean {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  const stanzas = region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
  return (
    stanzas.length >= 4 &&
    stanzas.every((stanza) =>
      /Email:|Attn:|Address:|primary business address and email on file/i.test(stanza),
    )
  );
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  resetPaidProPremiumRecipientHandoffReadGateForTests();
  vi.restoreAllMocks();
});

describe("TEST403 — professional review display after frozen SoT", () => {
  it("keeps frozen parity, repairs notices/headings, and stays 4-party without section-render surgery", () => {
    const draft = test403Draft();
    const intake = TEST403_PRODUCTION_QUAD_PARTY_INTAKE;
    let raw = buildAcceptedQuadPartyServerCorpus(intake, draft);
    raw = raw.replace(
      "3. PAYMENT AND CONSIDERATION",
      [
        "3. PAYMENT AND CONSIDERATION",
        "",
        "3.7 Joint",
        "Client Responsibility for Payment.",
        `${RED} and ${BLUE} are jointly responsible for Provider fees.`,
      ].join("\n"),
    );

    setConsumedPaidProSignerMetadataAuthority({
      parties: test403Parties(),
      source: "live_ui",
      hash: "test403",
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

    const record = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    expect(frozen?.hash).toBeTruthy();

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const frozenDisplay = preparePaidProFrozenDisplayPlain(record.text).text;

    expect(sectionRenderSpy).not.toHaveBeenCalled();

    expect(hashPaidProCorpus(frozenDisplay)).toBe(hashPaidProCorpus(reviewPlain));

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk).toBe(true);

    expect(reviewPlain).not.toMatch(/3\.7 Joint\s*\n\s*Client Responsibility for Payment/i);
    expect(reviewPlain).toMatch(/3\.7 Joint Client Responsibility for Payment/i);

    expect(countIfToNoticeStanzas(reviewPlain)).toBe(4);
    expect(noticeStanzasHaveProfessionalDestinations(reviewPlain)).toBe(true);
    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);

    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect((reviewPlain.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);

    for (const name of [RED, BLUE, HARBOR, IRON]) {
      expect(reviewPlain).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }

    writePremiumRecipientHandoffLinear(
      test403Parties().map((party) => ({
        name: party.partyLegalName,
        email: party.signerEmail,
        role: "party",
        signerName: party.signerName,
        signerTitle: party.signerTitle,
        partyAddress: party.partyAddress,
      })),
    );
    const emptyRead = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
      corpusHash: record.hash,
    });
    expect(countSignerMetadataSlots(emptyRead, 4).partySlots).toBe(4);

    expect(
      consumeAuthoritativeSignerCount("test403", {
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: reviewPlain,
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
  });
});
