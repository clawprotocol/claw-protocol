/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_LOADING_STRUCTURING } from "../../launch/simpleProduct/proConversionCopy";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { overlayIntakeManifestOnReviewParties } from "./intakePartyManifestAuthority";
import {
  countOperativeIfToNoticeStanzas,
  dedupeDuplicateStandaloneNoticesHeadings,
  findNoticesSectionStart,
  repairIncompleteIfToNoticeStanzas,
  resolveNoticeStructuralValidationParties,
} from "./paidProPartyNoticeDetails";
import { commitPaidProPipelineValidationAcceptance } from "./paidProPostAcceptanceValidatorCache";
import {
  shouldSuppressPaidProGeneratingPrimaryCta,
  shouldSuppressPaidProStickyGeneratingLoading,
} from "./paidProPostFreezeStickyGenerating";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  mapPaidProStickyCtaToPrimaryCta,
  resolvePaidProStickyCta,
} from "./paidProStickyCta";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import {
  resolvePaidProIntakeLegalEntityAddressPrefillComplete,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
} from "./signerSetupPartyIdentity";
import {
  buildTest530MalformedNoticeSectionBody,
  TEST530_PARTY_ADDRESSES,
  TEST530_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST530_BLUE_HARBOR,
  TEST530_IRON_GATE,
  TEST530_REDWOOD,
  TEST530_SUMMIT,
} from "./paidProTest530Fixtures";
import { buildTest518ConciseServerBody } from "./paidProTest518Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

function extractIfToStanzas(text: string): { entity: string; address: string }[] {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region =
    noticesIdx >= 0
      ? text.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : text.length)
      : text;
  const blocks = region.split(/\n(?=If to\s+)/i).slice(1);
  return blocks.map((block) => {
    const entity = block.match(/^If to\s+(.+?):/i)?.[1]?.trim() ?? "";
    const addressMatch = block.match(/Address:\s*\n?([^\n]+(?:\n[^\n]+)?)/i);
    const address = addressMatch?.[1]?.replace(/\n/g, ", ").trim() ?? "";
    return { entity, address };
  });
}

function countStandaloneNoticesHeadings(text: string): number {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return 0;
  const end = witnessIdx >= 0 ? witnessIdx : text.length;
  const region = text.slice(noticesIdx, end);
  return (region.match(/(?:^|\n)\s*(?:\d+\.\s+)?NOTICES\s*$/gim) ?? []).length;
}

describe("TEST530 — post-freeze notice repair, signer metadata, and sticky CTA", () => {
  beforeEach(() => {
    resetCanonicalPartyMetadataDiagnosticsForTests();
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rebuilds notices from intake manifest: 4 correct stanzas, no Scope Inc., one NOTICES block", () => {
    const intake = TEST530_PRODUCTION_QUAD_PARTY_INTAKE;
    const wrongParties = [
      { partyIndex: 0, partyLegalName: TEST530_SUMMIT, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 1, partyLegalName: TEST530_BLUE_HARBOR, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 2, partyLegalName: TEST530_IRON_GATE, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 3, partyLegalName: "Scope Inc.", signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
    ];
    const authorityParties = resolveNoticeStructuralValidationParties(wrongParties, {
      intakeText: intake,
      draftPartyNames: wrongParties.map((p) => p.partyLegalName),
    });
    expect(authorityParties).toHaveLength(4);
    expect(partyLegalNamesMatch(authorityParties[0]?.partyLegalName ?? "", TEST530_REDWOOD)).toBe(true);
    expect(authorityParties[3]?.partyLegalName).not.toMatch(/Scope/i);
    expect(authorityParties.map((p) => p.partyAddress)).toEqual([...TEST530_PARTY_ADDRESSES]);

    const malformed = buildTest530MalformedNoticeSectionBody();
    expect(countOperativeIfToNoticeStanzas(malformed)).toBeGreaterThanOrEqual(4);
    expect(malformed).toMatch(/Scope Inc\./i);
    expect(countStandaloneNoticesHeadings(malformed)).toBeGreaterThan(1);

    const repaired = repairIncompleteIfToNoticeStanzas(malformed, authorityParties, {
      intakeText: intake,
      draftPartyNames: authorityParties.map((p) => p.partyLegalName),
    });
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.text).not.toMatch(/Scope Inc\./i);
    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(4);
    const headingDedupe = dedupeDuplicateStandaloneNoticesHeadings(repaired.text);
    expect(headingDedupe.repairs).not.toContain("notice:dedupe_duplicate_notices_heading");

    const stanzas = extractIfToStanzas(repaired.text);
    expect(stanzas).toHaveLength(4);
    expect(partyLegalNamesMatch(stanzas[0]?.entity ?? "", TEST530_REDWOOD)).toBe(true);
    expect(stanzas[0]?.address).toContain("Raleigh");
    expect(partyLegalNamesMatch(stanzas[1]?.entity ?? "", TEST530_SUMMIT)).toBe(true);
    expect(stanzas[1]?.address).toContain("Plano");
    expect(partyLegalNamesMatch(stanzas[2]?.entity ?? "", TEST530_BLUE_HARBOR)).toBe(true);
    expect(stanzas[2]?.address).toContain("Chicago");
    expect(partyLegalNamesMatch(stanzas[3]?.entity ?? "", TEST530_IRON_GATE)).toBe(true);
    expect(stanzas[3]?.address).toContain("McLean");
  });

  it("dedupes duplicate standalone NOTICES headings in the notices region", () => {
    const corpus = buildTest530MalformedNoticeSectionBody();
    const deduped = dedupeDuplicateStandaloneNoticesHeadings(corpus);
    expect(deduped.repairs).toContain("notice:dedupe_duplicate_notices_heading");
    expect(countStandaloneNoticesHeadings(deduped.text)).toBe(1);
  });

  it("signer metadata counts stay zero when intake manifest has addresses but no signer contact fields", () => {
    const intake = TEST530_PRODUCTION_QUAD_PARTY_INTAKE;
    const wrongReviewParties = [
      { partyIndex: 0, partyLegalName: TEST530_SUMMIT, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 1, partyLegalName: TEST530_BLUE_HARBOR, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 2, partyLegalName: TEST530_IRON_GATE, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 3, partyLegalName: "Scope Inc.", signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
    ];
    const handoffParties = overlayIntakeManifestOnReviewParties(intake, wrongReviewParties);

    commitPaidProPipelineValidationAcceptance({
      text: padOperativeCorpusBeforeWitness(buildTest518ConciseServerBody(), SUBSTANTIVE_SERVER_DRAFT_MIN_LEN),
      source: "server_full_draft",
    });

    establishCanonicalPartyMetadataAtStage({
      stage: "after-freeze",
      legalEntities: handoffParties.map((p) => p.partyLegalName),
      intakeText: intake,
      uiParties: handoffParties,
      mutationSource: "structured_intake",
      project: false,
    });

    const canonical = readCanonicalPartyMetadata();
    const counts = computeCanonicalPartyMetadataFieldCounts(canonical);
    expect(counts.partyCount).toBe(4);
    expect(counts.addressCount).toBe(4);
    expect(counts.signerNameCount).toBe(0);
    expect(counts.emailCount).toBe(0);

    const prefillComplete = resolvePaidProIntakeLegalEntityAddressPrefillComplete({
      intakeText: intake,
      partyCount: 4,
      recipient1Name: handoffParties[0]!.partyLegalName,
      recipient2Name: handoffParties[1]!.partyLegalName,
      extraPartyLegalNames: handoffParties.slice(2).map((p) => p.partyLegalName),
      partyAddresses: handoffParties.map((p) => p.partyAddress),
    });
    expect(prefillComplete).toBe(true);
  });

  it("suppresses Structuring sticky loading after freeze when signer setup is latched", () => {
    expect(
      shouldSuppressPaidProStickyGeneratingLoading({
        hasSourceOfTruth: true,
        acceptedPaidProAuthority: true,
        inlineSignerSetupLatched: true,
        canonicalReviewSignerSetupActive: true,
        stickyCtaShowBar: true,
        stickyCtaPhase: "signer_details_required",
      }),
    ).toBe(true);
    expect(
      shouldSuppressPaidProGeneratingPrimaryCta({
        isGenerating: true,
        hasSourceOfTruth: true,
        acceptedPaidProAuthority: true,
        inlineSignerSetupLatched: true,
        canonicalReviewSignerSetupActive: true,
        signerSetupStickyCtaSurfaceActive: true,
      }),
    ).toBe(true);

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    const mapped = mapPaidProStickyCtaToPrimaryCta(sticky);
    expect(mapped.label).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(mapped.label).not.toBe(DRAFT_LOADING_STRUCTURING);
  });

  it("intake wires post-freeze sticky generating suppression for signer setup", () => {
    expect(intakeSrc).toContain("shouldSuppressPaidProStickyGeneratingLoading");
    expect(intakeSrc).toContain("shouldSuppressPaidProGeneratingPrimaryCta");
    expect(intakeSrc).toMatch(
      /stickyProductionAgreementCreationLoading[\s\S]{0,400}shouldSuppressPaidProStickyGeneratingLoading/,
    );
  });
});
