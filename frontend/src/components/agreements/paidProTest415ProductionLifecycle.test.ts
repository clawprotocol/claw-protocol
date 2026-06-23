/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  alignIntakeSignerMetadataToLegalEntities,
  authorityPartiesFromIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
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
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST415_FORBIDDEN_ENTITY_MARKERS,
  TEST415_LEGAL_ENTITIES,
  TEST415_PRODUCTION_INTAKE,
  TEST415_SIGNER_NAMES,
  test415Draft,
  test415DraftWithPhantomFifthParty,
  test415LiveUiBlankExtraLegalNames,
} from "./paidProTest415Fixtures";

type PartySnapshot = {
  stage: string;
  parties: readonly PaidProSignerMetadataParty[];
};

function snapshotParties(stage: string, parties: readonly PaidProSignerMetadataParty[]): PartySnapshot {
  return { stage, parties };
}

function assertPartyAlignment(stage: string, parties: readonly PaidProSignerMetadataParty[]) {
  expect(parties.length, `${stage}: party count`).toBe(4);
  for (let i = 0; i < 4; i++) {
    const p = parties[i]!;
    expect(p.partyLegalName, `${stage}: party ${i} entity`).toContain(
      TEST415_LEGAL_ENTITIES[i]!.replace(/\.$/, "").split(" ")[0]!,
    );
    expect(p.signerName, `${stage}: party ${i} signer`).toBe(TEST415_SIGNER_NAMES[i]);
    expect(p.partyLegalName, `${stage}: entity≠signer ${i}`).not.toBe(p.signerName);
  }
}

function assertNoForbiddenEntityAuthority(stage: string, parties: readonly PaidProSignerMetadataParty[]) {
  for (const marker of TEST415_FORBIDDEN_ENTITY_MARKERS) {
    for (const p of parties) {
      expect(p.partyLegalName.toUpperCase(), `${stage}: forbidden entity ${marker}`).not.toContain(marker);
    }
  }
}

function assertCorpusForbiddenHeadings(stage: string, corpus: string) {
  const tail = corpus.slice(Math.floor(corpus.length * 0.72));
  for (const marker of TEST415_FORBIDDEN_ENTITY_MARKERS) {
    expect(tail, `${stage}: corpus forbidden heading ${marker}`).not.toMatch(
      new RegExp(`^\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im"),
    );
  }
}

function padServerDraft(body: string, minLen = 2000): string {
  if (body.length >= minLen) return body;
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : body.length;
  let pad = "";
  let i = 0;
  while (body.length + pad.length < minLen) {
    pad += `13. Supplemental Provisions\n\n13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  return `${body.slice(0, insertAt)}${pad}${body.slice(insertAt)}`;
}

describe("TEST415_PRODUCTION_LIFECYCLE_PROOF", () => {
  const storage = new Map<string, string>();
  const trace: PartySnapshot[] = [];

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
    trace.length = 0;
    clearCurrentSessionProEntitlementMarkers();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });

  afterEach(() => {
    storage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    vi.unstubAllGlobals();
  });

  it("full production lifecycle: intake → SoT → review → signer setup → execution block → final corpus", () => {
    const intake = TEST415_PRODUCTION_INTAKE;
    const draft = test415DraftWithPhantomFifthParty();

    // Stage 1: intake authority extraction
    const intakeAligned = alignIntakeSignerMetadataToLegalEntities(intake, [...TEST415_LEGAL_ENTITIES]);
    const intakeParties = authorityPartiesFromIntakeSignerMetadata(intake, [...TEST415_LEGAL_ENTITIES]);
    trace.push(snapshotParties("intake_align", intakeAligned.map((s, i) => ({
      partyIndex: i,
      partyLegalName: s.partyLegalName,
      signerEmail: s.signerEmail,
      signerName: s.signerName,
      signerTitle: s.signerTitle,
      partyAddress: s.partyAddress,
    }))));
    trace.push(snapshotParties("intake_authority", intakeParties));
    assertPartyAlignment("intake_authority", intakeParties);
    assertNoForbiddenEntityAuthority("intake_authority", intakeParties);

    // Stage 2: server_full_draft acceptance (clean deterministic body — corrupted server drafts must not freeze)
    const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
      rawIntake: intake,
      draft: test415Draft(),
    });
    expect(fallback.ok).toBe(true);
    const body = padServerDraft(fallback.body);
    const prep = preparePaidProServerDocumentForAcceptance(body, draft, intake);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });

    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: draft.parties,
    });
    expect(signerCount.count).toBe(4);

    // Stage 3: SoT freeze
    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    // Stage 4: signer setup finalize authority (blank extra legal names — production pattern)
    const finalizeAuthority = buildPaidProSignerMetadataAuthorityForFinalize(
      test415LiveUiBlankExtraLegalNames(),
      { intakeText: intake, draftPartyNames: [TEST415_LEGAL_ENTITIES[0], TEST415_LEGAL_ENTITIES[1]] },
    );
    trace.push(snapshotParties("signer_setup_finalize", finalizeAuthority.parties));
    assertPartyAlignment("signer_setup_finalize", finalizeAuthority.parties);
    assertNoForbiddenEntityAuthority("signer_setup_finalize", finalizeAuthority.parties);

    // Stage 5: handoff persistence
    writePremiumRecipientHandoffFromAuthorityParties(finalizeAuthority.parties);
    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const handoffSlots = linearPremiumRecipientSlots(handoff, 4);
    expect(handoffSlots).toHaveLength(4);
    trace.push(
      snapshotParties(
        "handoff_persist",
        handoffSlots.map((s, i) => ({
          partyIndex: i,
          partyLegalName: s.name,
          signerEmail: s.email,
          signerName: s.signerName ?? "",
          signerTitle: s.signerTitle ?? "",
          partyAddress: s.partyAddress ?? "",
        })),
      ),
    );
    assertNoForbiddenEntityAuthority(
      "handoff_persist",
      handoffSlots.map((s, i) => ({
        partyIndex: i,
        partyLegalName: s.name,
        signerEmail: s.email,
        signerName: s.signerName ?? "",
        signerTitle: s.signerTitle ?? "",
        partyAddress: s.partyAddress ?? "",
      })),
    );

    setConsumedPaidProSignerMetadataAuthority(finalizeAuthority);

    // Stage 6: execution block hydration
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority: finalizeAuthority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);
    trace.push(snapshotParties("execution_hydration_authority", finalizeAuthority.parties));
    assertCorpusForbiddenHeadings("execution_hydration", hydrated.corpus);

    // Stage 7: review render
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    assertCorpusForbiddenHeadings("review_render", reviewPlain);
    for (const name of TEST415_SIGNER_NAMES) {
      expect(reviewPlain).toContain(name);
    }

    // Stage 8: completed corpus (hydrated authority path)
    const completed = hydrated.corpus;
    assertCorpusForbiddenHeadings("completed_corpus", completed);
    const witnessIdx = completed.search(/\bIN WITNESS WHEREOF\b/i);
    const execTail = witnessIdx >= 0 ? completed.slice(witnessIdx) : completed.slice(-2500);
    for (const entity of TEST415_LEGAL_ENTITIES) {
      expect(execTail).toMatch(new RegExp(entity.replace(/\.$/, "").split(" ")[0]!, "i"));
    }

    // Trace artifact for acceptance gate diagnostics
    expect(trace.length).toBeGreaterThanOrEqual(4);
    for (const snap of trace) {
      assertNoForbiddenEntityAuthority(snap.stage, snap.parties);
    }
  });
});
