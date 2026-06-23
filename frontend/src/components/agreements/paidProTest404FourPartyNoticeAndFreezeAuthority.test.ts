/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as paidProAgreementPolish from "./paidProAgreementPolish";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { hasBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
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
import { buildTest401MalformedServerDraft } from "./paidProTest401MalformedQuadPartyExecutionBlockRecovery.test";
import {
  TEST404_PARTY_EMAILS,
  TEST404_PRODUCTION_QUAD_PARTY_INTAKE,
  test404Draft,
  test404Parties,
} from "./paidProTest404Fixtures";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveSignerSetupUiPartyCount } from "./paidProNPartySignerSetup";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc";

function padBeforeWitness(base: string, minLen = 2000): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "";
  let i = 0;
  while (base.length + pad.length < minLen) {
    pad += `13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

function buildTest404ServerDraft(): string {
  let body = buildTest401MalformedServerDraft();
  for (const name of [RED, BLUE, HARBOR, IRON]) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`If to ${esc}: ${esc}`, "g"), `If to ${name}:\n${name}`);
  }
  return body;
}

function countIfToNoticeStanzas(text: string): number {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  return (region.match(/^If to\s+/gim) || []).length;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  vi.restoreAllMocks();
});

describe("TEST404_FOUR_PARTY_NOTICE_AND_FREEZE_AUTHORITY", () => {
  it("preserves 4-party freeze, hydrates notice metadata, blocks post-freeze mutation, and keeps single execution block", () => {
    const draft = test404Draft();
    const intake = TEST404_PRODUCTION_QUAD_PARTY_INTAKE;
    const parties = test404Parties();
    const raw = padBeforeWitness(buildTest404ServerDraft());

    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test404",
      updatedAt: 0,
    });

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

    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test404",
      updatedAt: Date.now(),
    });

    const record = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    expect(frozen?.hash).toBeTruthy();
    const canonicalHash = hashPaidProCorpus(record.text);

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const polishSpy = vi.spyOn(paidProAgreementPolish, "polishPaidProAgreementText");

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });

    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(polishSpy).not.toHaveBeenCalled();

    const polishResult = paidProAgreementPolish.polishPaidProAgreementText(
      record.text,
      intake,
      [RED, BLUE, HARBOR, IRON],
      { surface: "preview_premium_deliverable" },
    );
    expect(polishResult.text).toBe(record.text);
    expect(polishResult.log.recital.applied).toBe(false);

    expect(hashPaidProCorpus(record.text)).toBe(canonicalHash);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk).toBe(true);

    expect(countIfToNoticeStanzas(reviewPlain)).toBe(4);
    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);
    expect(reviewPlain).toContain(TEST404_PARTY_EMAILS.red);
    expect(reviewPlain).toContain(TEST404_PARTY_EMAILS.blue);
    expect(reviewPlain).toContain(TEST404_PARTY_EMAILS.harbor);
    expect(reviewPlain).toContain(TEST404_PARTY_EMAILS.iron);
    expect(reviewPlain).toContain("Oklahoma City, OK 73101");
    expect(reviewPlain).toContain("Tulsa, OK 74103");
    expect(reviewPlain).not.toMatch(
      /Primary business address and email on file with the other Parties\.\s*\n\nIf to/i,
    );

    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect((reviewPlain.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);

    const resolution = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: reviewPlain,
    });
    expect(resolution.count).toBe(4);
    expect(resolution.draftCount).toBe(2);

    expect(
      consumeAuthoritativeSignerCount("test404_metadata_authority", {
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

    for (const name of [RED, BLUE, HARBOR, IRON]) {
      expect(reviewPlain).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});
