/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  countOperativeIfToNoticeStanzas,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  assertPaidProSectionStructureCompletenessForFreeze,
} from "./paidProSectionStructureCompletenessAuthority";
import { corpusHasPaidProSyntheticMalformedSectionHeadings } from "./paidProSyntheticMalformedSectionHeadings";
import {
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
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST416_FORBIDDEN_SYNTHETIC_HEADING_PATTERNS,
  TEST416_LEGAL_ENTITIES,
  TEST416_PARTY_ADDRESSES,
  TEST416_PARTY_EMAILS,
  TEST416_PRODUCTION_INTAKE,
  TEST416_SIGNER_NAMES,
  buildTest416SyntheticMalformedSectionCorpus,
  test416Draft,
  test416LiveUiWithBlankExtraLegalNames,
} from "./paidProTest416Fixtures";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { authorityPartiesFromIntakeSignerMetadata } from "./intakeSignerMetadataAuthority";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

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

function buildTest416AcceptedCorpus(intake: string): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: intake,
    draft: test416Draft(),
  });
  expect(fallback.ok).toBe(true);
  return padBeforeWitness(fallback.body);
}

function phantomInflatedParties(base: readonly PaidProSignerMetadataParty[]): PaidProSignerMetadataParty[] {
  const inflated: PaidProSignerMetadataParty[] = [...base];
  for (let i = base.length; i < 18; i += 1) {
    inflated.push({
      partyIndex: i,
      partyLegalName: `Phantom Notice Party ${i + 1} LLC`,
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    });
  }
  return inflated;
}

describe("TEST416_STRUCTURAL_INTEGRITY_AND_SIGNER_METADATA", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    sessionStorage.clear();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    storage.clear();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPostAcceptanceValidatorCache();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    vi.unstubAllGlobals();
  });

  it("rejects synthetic malformed section headings at validation and freeze gates", () => {
    const synthetic = buildTest416SyntheticMalformedSectionCorpus();
    expect(corpusHasPaidProSyntheticMalformedSectionHeadings(synthetic)).toBe(true);

    const validation = validatePaidProOutput({
      text: padBeforeWitness(synthetic),
      rawIntake: TEST416_PRODUCTION_INTAKE,
      draft: test416Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain("section_structure_synthetic_malformed_headings");

    expect(() =>
      assertPaidProSectionStructureCompletenessForFreeze(padBeforeWitness(synthetic), "test416"),
    ).toThrow(/paid-pro-sot-freeze-blocked|section_structure_synthetic_malformed_headings/);
  });

  it("notice repair caps authority to canonical 4 parties even when caller passes 18 phantom rows", () => {
    const intakeParties = authorityPartiesFromIntakeSignerMetadata(
      TEST416_PRODUCTION_INTAKE,
      [...TEST416_LEGAL_ENTITIES],
    );
    expect(intakeParties).toHaveLength(4);

    const corpus = [
      "10. Notices",
      "Notices must be delivered in writing.",
      "",
      ...Array.from({ length: 8 }, (_, i) => `If to Phantom Party ${i + 1} LLC:\nPhantom Party ${i + 1} LLC`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n");

    const inflated = phantomInflatedParties(intakeParties);
    const repaired = repairIncompleteIfToNoticeStanzas(corpus, inflated, {
      intakeText: TEST416_PRODUCTION_INTAKE,
      draftPartyNames: [RED, BLUE],
    });

    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(4);
    expect(repaired.text).not.toMatch(/If to Phantom Party 5/i);
    expect(repaired.text).toContain(TEST416_PARTY_EMAILS.red);
    expect(repaired.text).toContain(TEST416_PARTY_EMAILS.iron);
  });

  it("full lifecycle preserves 4-party signer metadata (names, titles, emails, addresses) through freeze and review", () => {
    const draft = test416Draft();
    const intake = TEST416_PRODUCTION_INTAKE;
    const raw = buildTest416AcceptedCorpus(intake);
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

    const authority = buildPaidProSignerMetadataAuthorityForFinalize(test416LiveUiWithBlankExtraLegalNames(), {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    expect(authority.parties).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(authority.parties[i]!.signerName).toBe(TEST416_SIGNER_NAMES[i]);
      expect(authority.parties[i]!.signerEmail).toBe(Object.values(TEST416_PARTY_EMAILS)[i]);
      expect(authority.parties[i]!.partyAddress).toBe(Object.values(TEST416_PARTY_ADDRESSES)[i]);
    }

    writePremiumRecipientHandoffFromAuthorityParties(authority.parties);
    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.partyAddress?.trim()).length).toBe(4);

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
    expect(countOperativeIfToNoticeStanzas(hydrated.corpus)).toBe(4);

    expect(
      consumeAuthoritativeSignerCount("test416_finalize_hydrate_authority", {
        intakeText: intake,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: hydrated.corpus,
      }),
    ).toBe(4);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    for (const pattern of TEST416_FORBIDDEN_SYNTHETIC_HEADING_PATTERNS) {
      expect(reviewPlain, `forbidden synthetic heading ${pattern}`).not.toMatch(pattern);
    }
    for (const email of Object.values(TEST416_PARTY_EMAILS)) {
      expect(reviewPlain).toContain(email);
    }
    for (const addr of Object.values(TEST416_PARTY_ADDRESSES)) {
      expect(reviewPlain).toContain(addr.slice(0, 12));
    }
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect(reviewPlain).not.toMatch(/If to Party 5/i);
  });
});
