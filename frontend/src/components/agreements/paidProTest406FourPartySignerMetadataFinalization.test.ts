/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { hasBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
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
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { buildTest401MalformedServerDraft } from "./paidProTest401MalformedQuadPartyExecutionBlockRecovery.test";
import {
  TEST406_PARTY_ADDRESSES,
  TEST406_PARTY_EMAILS,
  TEST406_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST406_SIGNER_NAMES,
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

function buildTest406ServerDraft(): string {
  let body = buildTest401MalformedServerDraft();
  for (const name of [RED, BLUE, HARBOR, IRON]) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`If to ${esc}: ${esc}`, "g"), `If to ${name}:\n${name}`);
  }
  return body;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  clearPremiumPartyNamesHandoff();
  resetPremiumRecipientHandoffDedupForTests();
  vi.restoreAllMocks();
});

describe("TEST406_FOUR_PARTY_SIGNER_METADATA_FINALIZATION", () => {
  it("finalize path preserves 4-party authority, handoff, hydration, and review without notice entity crash", () => {
    const draft = test406Draft();
    const intake = TEST406_PRODUCTION_QUAD_PARTY_INTAKE;
    const raw = padBeforeWitness(buildTest406ServerDraft());

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

    const authority = buildPaidProSignerMetadataAuthorityForFinalize(test406LiveUiWithBlankExtraLegalNames(), {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    expect(authority.parties).toHaveLength(4);
    for (const entity of [RED, BLUE, HARBOR, IRON]) {
      expect(authority.parties.some((p) => p.partyLegalName.includes(entity.replace(/\.$/, "")))).toBe(true);
    }
    for (const email of Object.values(TEST406_PARTY_EMAILS)) {
      expect(authority.parties.some((p) => p.signerEmail === email)).toBe(true);
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
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);
    expect(hydrated.corpus).not.toMatch(/If to\s*:\s*\n/i);

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

    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);
    for (const email of Object.values(TEST406_PARTY_EMAILS)) {
      expect(reviewPlain).toContain(email);
    }
    for (const name of TEST406_SIGNER_NAMES) {
      expect(reviewPlain).toContain(name);
    }
    for (const addr of Object.values(TEST406_PARTY_ADDRESSES)) {
      expect(reviewPlain.toLowerCase()).toContain(addr.toLowerCase().slice(0, 8));
    }

    const witnessIdx = reviewPlain.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = witnessIdx >= 0 ? reviewPlain.slice(witnessIdx) : "";
    for (const entity of [RED, BLUE, HARBOR, IRON.replace(/\.$/, "")]) {
      expect(tail).toMatch(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

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

    const partiesFromUi = test406PartiesFromFinalizeUi();
    expect(partiesFromUi).toHaveLength(4);
    expect(partiesFromUi[2]?.partyLegalName).toContain("Harbor Peak");
    expect(partiesFromUi[3]?.partyLegalName).toContain("Iron Vale");
  });
});
