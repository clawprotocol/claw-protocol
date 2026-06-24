/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { countPartyBlocksInExecutionTail } from "./paidProTest423Helpers";
import {
  scenarioAuthorityParties427,
  TEST427_SCENARIOS,
} from "./paidProTest427Fixtures";
import { prepareTest428UxContext } from "./paidProTest428UxHelpers";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { resolvePaidProSignerDetailsGate, PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";
import { resolvePaidProStickyCta } from "./paidProStickyCta";

describe("TEST428 — missing signer email preserves 2-party execution", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "sessionStorage",
      {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    );
    resetPremiumRecipientHandoffDedupForTests();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPostAcceptanceValidatorCache();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  it("keeps exactly two execution party blocks when signer 2 email is missing", () => {
    const scenario = TEST427_SCENARIOS.find((s) => s.id === "f_metadata_2p_missing_email")!;
    const ctx = prepareTest428UxContext(scenario);
    const partialParties = scenarioAuthorityParties427(scenario);
    const sotBlocksBefore = countPartyBlocksInExecutionTail(ctx.sot, scenario.parties);

    expect(sotBlocksBefore).toBe(2);
    expect(partialParties[0]?.signerEmail).toContain("@");
    expect(partialParties[1]?.signerEmail.trim()).toBe("");

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: scenario.expectedN,
      intakeText: scenario.intakeText,
      draftPartyNames: scenario.parties,
      partySignerNames: scenario.signerNames,
      recipient1Name: scenario.parties[0] ?? "",
      recipient2Name: scenario.parties[1] ?? "",
      recipient1Email: partialParties[0]?.signerEmail ?? "",
      recipient2Email: partialParties[1]?.signerEmail ?? "",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockers.some((b) => b.field === "email" && b.partyIndex === 1)).toBe(true);

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: gate.complete,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.label).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: ctx.sot,
      authority: {
        parties: partialParties,
        source: "authoritative_write",
        hash: "test428_missing_email",
        updatedAt: 0,
      },
      intakeRaw: scenario.intakeText,
      surface: "test428_missing_email_regression",
      signatureRegionOnly: false,
      repairRecital: true,
    });

    expect(hydrated.rejected).toBe(false);
    const blocksAfter = countPartyBlocksInExecutionTail(hydrated.corpus, scenario.parties);
    expect(blocksAfter).toBe(2);
    expect(countPartyBlocksInExecutionTail(ctx.sot, scenario.parties)).toBe(2);

    const invariant = analyzePaidProExecutionBlockInvariant(hydrated.corpus, {
      expectedParties: 2,
    });
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.partyHeadingCount).toBe(2);
    expect(invariant.executionBlockCount).toBe(1);

    const witness = hydrated.corpus.slice(hydrated.corpus.search(/\bIN WITNESS WHEREOF\b/i));
    expect(witness).toMatch(/CLIENT:/i);
    expect(witness).toMatch(/SERVICE\s+PROVIDER:/i);
    expect(witness).toMatch(/Velox Analytics Partners LLC/i);
    expect(witness).toMatch(/Granite Trail Transport Inc/i);
    expect(witness).not.toMatch(/Consulting agreement between Velox/i);
  });
});
