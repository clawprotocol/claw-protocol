import { describe, expect, it } from "vitest";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { labeledPartyBlocksForSignerMetadata } from "./labeledPartyBlockParse";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest368Fixtures";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const TEST368_INTAKE = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;

function authorityPartiesFromLabeledIntake(intake: string): PaidProSignerMetadataParty[] {
  return labeledPartyBlocksForSignerMetadata(intake).map((block, partyIndex) => ({
    partyIndex,
    partyLegalName: block.legalEntity,
    signerEmail: block.signerEmail,
    signerTitle: block.signerTitle,
    signerName: block.signerName,
    partyAddress: block.address,
  }));
}

describe("test368 closure diagnostic", () => {
  it("traces pipeline transitions", () => {
    const draft = runIntakeDefaultsAndRoles(
      {
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
      TEST368_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    const parties = authorityPartiesFromLabeledIntake(TEST368_INTAKE);
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST368_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const beforeEnforce = recovery.body;
    const enforced = enforcePaidProSingleExecutionBlock(beforeEnforce, {
      authorityParties: parties,
      intakeText: TEST368_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
    });
    const beforeSanitize = enforced.text;
    const sanitized = applyPaidProReviewRenderSanitizer(beforeSanitize, parties, {
      intakeText: TEST368_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
      acceptedCorpus: beforeSanitize,
    });
    const afterSanitize = sanitized.text;

    const witnessBefore = beforeEnforce.search(/\bIN WITNESS WHEREOF\b/i);
    const witnessAfterEnforce = beforeSanitize.search(/\bIN WITNESS WHEREOF\b/i);
    const witnessAfterSanitize = afterSanitize.search(/\bIN WITNESS WHEREOF\b/i);

    const diag = {
      headingsBeforeEnforce: countSignatureBlockHeadingsInTail(beforeEnforce),
      headingsAfterEnforce: countSignatureBlockHeadingsInTail(beforeSanitize),
      headingsAfterSanitize: countSignatureBlockHeadingsInTail(afterSanitize),
      witnessBefore: witnessBefore >= 0,
      witnessAfterEnforce: witnessAfterEnforce >= 0,
      witnessAfterSanitize: witnessAfterSanitize >= 0,
      enforceRepairs: enforced.repairs,
      sanitizeRepaired: sanitized.repaired,
      tailAfterEnforce: beforeSanitize.slice(Math.max(0, witnessAfterEnforce)).slice(0, 1200),
      tailAfterSanitize: afterSanitize.slice(Math.max(0, witnessAfterSanitize)).slice(0, 1200),
    };
    console.log(JSON.stringify(diag, null, 2));
    expect(diag.headingsAfterEnforce).toBeGreaterThanOrEqual(3);
  });
});
