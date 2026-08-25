/** @vitest-environment jsdom */
/**
 * Post-payment integration: premiumCompletion restore must keep bilateral identity on
 * signer headings, editable inputs, and visible review plain — exercising the exact
 * AgreementBuilderIntake commercial-locked selector order (not helper-only sanitizer calls).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCanonicalPartyMetadata } from "./canonicalPartyMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resetSignerCountAuthorityDiagnosticsForTests } from "./signerCountAuthority";
import {
  hydrateCanonicalPartyMetadataAfterCheckoutRestore,
  resolvePaidProSignerSetupLegalEntitiesFromIntake,
} from "./paidProCheckoutRestoreMetadataHydrate";
import { getRecipientHandoffNamesFromDraft } from "./partyIntakeNormalize";
import {
  clearCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
  repairCheckoutBackRestoreDraftParties,
} from "./checkoutBackRestore";
import {
  markPaidPremiumCompletionSession,
  clearPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { rebuildBodyFromIntakeForProFailure } from "./freeStarterReviewBodyResolver";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveCommercialLockedSimpleProFinalReviewPlain, resealPaidProReviewPlainAfterDisplayPolish } from "./simpleProFinalReviewDisplayPlain";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import {
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupRenderSlot,
} from "./signerSetupPartyIdentity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment: $2,400 due on signing. Term: 30 days starting August 24, 2026. Governing law: Texas.";

const PRE_CHECKOUT_DRAFT: ParsedDraftShape = {
  title: "SERVICES AGREEMENT",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    { name: "Diego Alvarez of Harbor Marks LLC", role: "service_provider" },
  ],
  purpose: "design a logo and brand kit",
  payment_terms: "$2,400 due on signing",
  duration: "30 days starting August 24, 2026",
};

const POST_GENERATION_CORRUPTED_DRAFT: ParsedDraftShape = {
  ...PRE_CHECKOUT_DRAFT,
  parties: [
    { name: "Harbor Marks LLC", role: "client" },
    { name: "Diego Alvarez of", role: "service_provider" },
  ],
  purpose: "Priya Shah of Northline Studio will design a logo and brand kit",
};

const CONTAMINATED_GENERATED_CORPUS = [
  "SERVICES AGREEMENT",
  "",
  'This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider"). Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties." Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider"),',
  "",
  '(collectively, the "Parties").',
  "",
  "1. SERVICES",
  "The service provider agrees to provide services as described in the parties' communications.",
  "",
  ...Array.from(
    { length: 24 },
    (_, index) =>
      `${index + 2}. Commercial clause ${index + 2}. The Parties will perform the stated obligations in good faith under Texas law.`,
  ),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Diego Alvarez of Harbor Marks LLC",
  "By: __________________________",
  "Name: Diego Alvarez",
  "",
  "SERVICE PROVIDER:",
  "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
  "By: __________________________",
  "Name: Diego Alvarez",
].join("\n");

/** Mirrors AgreementBuilderIntake paidProFirstReviewDisplayContext wiring. */
function resolvePostPaymentReviewDisplayContext(args: {
  intakeCombined: string;
  draft: ParsedDraftShape;
  checkoutSnapIntake: string;
}) {
  const resolvedIntakeText = (args.intakeCombined || args.checkoutSnapIntake || "").trim();
  const repairedDraft = repairCheckoutBackRestoreDraftParties(args.draft, resolvedIntakeText);
  let resolvedAcceptedPlain = "";
  if (hasPaidProSourceOfTruth()) {
    resolvedAcceptedPlain = getPaidProSourceOfTruthText().trim();
  } else if (resolvedIntakeText.length >= 20) {
    const rebuiltBody = rebuildBodyFromIntakeForProFailure(resolvedIntakeText, repairedDraft);
    if (rebuiltBody.trim().length >= 200) {
      resolvedAcceptedPlain = rebuiltBody;
    }
  }
  return {
    draft: repairedDraft,
    intakeText: resolvedIntakeText,
    acceptedCanonicalPlain: resolvedAcceptedPlain,
    premiumCheckoutCompleted: true,
    premiumPaidDocumentSurface: true,
    paidProActive: true,
  };
}

/**
 * Mirrors AgreementBuilderIntake displayPolishedPaidProPlain commercial-locked branch:
 * resolvePaidProFirstReviewVisibleDisplayPlain → polishProAgreementDisplayLayer.
 */
function resolveDisplayPolishedPaidProPlainProductionMirror(
  displayContext: ReturnType<typeof resolvePostPaymentReviewDisplayContext>,
) {
  const firstReviewAuthority = resolvePaidProFirstReviewVisibleDisplayPlain(displayContext);
  const raw = (firstReviewAuthority.plain || "").trim();
  if (!raw || raw.length < 200) return "";
  const polished = polishProAgreementDisplayLayer(raw, {
    draft: displayContext.draft ?? null,
    intakeText: displayContext.intakeText,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: false,
  }).text.trim();
  return resealPaidProReviewPlainAfterDisplayPolish({
    polishedPlain: polished,
    draft: displayContext.draft ?? null,
    intakeText: displayContext.intakeText,
  });
}

/**
 * Mirrors AgreementBuilderIntake simpleProFinalReviewDisplayPlain commercial-locked
 * selector order: verified GET absent → intake-authority polished plain → legacy bypass.
 */
function resolveSimpleProFinalReviewDisplayPlainProductionMirror(args: {
  displayContext: ReturnType<typeof resolvePostPaymentReviewDisplayContext>;
  hasVerifiedCommercialDisplayCorpus: boolean;
}) {
  const displayPolishedPaidProPlain = resolveDisplayPolishedPaidProPlainProductionMirror(
    args.displayContext,
  );
  if (args.hasVerifiedCommercialDisplayCorpus) {
    return displayPolishedPaidProPlain;
  }
  const commercialLockedPlain = resolveCommercialLockedSimpleProFinalReviewPlain({
    displayPolishedPaidProPlain,
  });
  if (commercialLockedPlain) {
    return commercialLockedPlain;
  }
  return resolvePaidProReviewRenderPlain({
    draft: args.displayContext.draft ?? null,
    intakeText: args.displayContext.intakeText,
  }).plain.trim();
}

function resolvePostPaymentSignerHeadings(args: {
  draft: ParsedDraftShape;
  intakeText: string;
  recipient1Name: string;
  recipient2Name: string;
  agreementBodyText: string;
}) {
  const repairedDraft = repairCheckoutBackRestoreDraftParties(args.draft, args.intakeText);
  const identities = resolveSignerSetupPartyIdentities({
    parties: repairedDraft.parties,
    intakeText: args.intakeText,
    agreementBodyText: args.agreementBodyText,
  });
  const party1Heading = resolveSignerSetupRenderSlot({
    slotIndex: 0,
    slotIdentities: identities,
    currentLegalEntityValue: args.recipient1Name,
    source: "signer_setup_party_line",
  }).canonicalLegalEntity;
  const party2Heading = resolveSignerSetupRenderSlot({
    slotIndex: 1,
    slotIdentities: identities,
    currentLegalEntityValue: args.recipient2Name,
    source: "signer_setup_party_line",
  }).canonicalLegalEntity;
  return { party1Heading, party2Heading, identities };
}

describe("paidPro bilateral premiumCompletion restore integration", () => {
  beforeEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
  });

  it("post-payment restore keeps Priya client / Diego provider on headings, inputs path, and review plain", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.intakeText).toContain("Priya Shah of Northline Studio");

    establishPaidProSourceOfTruth({
      text: CONTAMINATED_GENERATED_CORPUS,
      source: "server_full_draft",
    });

    const displayContext = resolvePostPaymentReviewDisplayContext({
      intakeCombined: "",
      draft: POST_GENERATION_CORRUPTED_DRAFT,
      checkoutSnapIntake: snap!.intakeText,
    });

    const { party1Heading, party2Heading } = resolvePostPaymentSignerHeadings({
      draft: displayContext.draft,
      intakeText: displayContext.intakeText,
      recipient1Name: "Priya Shah of Northline Studio",
      recipient2Name: "Diego Alvarez of Harbor Marks LLC",
      agreementBodyText: CONTAMINATED_GENERATED_CORPUS,
    });

    expect(party1Heading).toBe("Priya Shah of Northline Studio");
    expect(party2Heading).toBe("Diego Alvarez of Harbor Marks LLC");
    expect(party1Heading).not.toMatch(/Harbor Marks LLC/i);
    expect(party2Heading).not.toBe("Diego Alvarez of");

    const visible = resolveSimpleProFinalReviewDisplayPlainProductionMirror({
      displayContext,
      hasVerifiedCommercialDisplayCorpus: false,
    });

    const openingRegion = visible.split(/1\.\s+SERVICES/i)[0] ?? visible;
    expect(openingRegion).toContain('Priya Shah of Northline Studio ("Client")');
    expect(openingRegion).toContain('Diego Alvarez of Harbor Marks LLC ("Service Provider")');
    expect((openingRegion.match(/Priya Shah of Northline Studio/gi) ?? []).length).toBe(1);
    expect((openingRegion.match(/Diego Alvarez of Harbor Marks LLC/gi) ?? []).length).toBe(1);
    expect(
      (openingRegion.match(/Priya Shah of Northline Studio\s*\("Client"\)/gi) ?? []).length,
    ).toBe(1);
    expect(
      (openingRegion.match(/Diego Alvarez of Harbor Marks LLC\s*\("Service Provider"\)/gi) ?? [])
        .length,
    ).toBe(1);
    expect(openingRegion).not.toMatch(/\n\s*\(collectively,\s+the\s+"Parties"\)\.\s*\n/i);
    expect(visible).not.toMatch(
      /\(collectively,\s+the\s+"Parties"\)[\s\S]{0,120}\(collectively,\s+the\s+"Parties"\)/i,
    );
    expect(visible).not.toMatch(
      /Diego Alvarez of Harbor Marks LLC to design a logo and brand kit \("Service Provider"\)/,
    );
    expect(visible).not.toMatch(
      /agrees to provide Priya Shah of Northline Studio will design a logo and brand kit/i,
    );
    expect(visible).not.toMatch(/agrees to provide services as described in the parties'? communications/i);
    expect(visible).toMatch(/design a logo and brand kit/i);
    expect(visible).not.toMatch(/CLIENT:\s*\nDiego Alvarez of Harbor Marks LLC/i);
    expect(visible).not.toMatch(
      /SERVICE PROVIDER:\s*\nDiego Alvarez of Harbor Marks LLC to design a logo and brand kit/i,
    );
    expect(visible).toMatch(/The Service Provider shall design a logo and brand kit/i);

    const legacyBypass = resolvePaidProReviewRenderPlain({
      draft: displayContext.draft,
      intakeText: displayContext.intakeText,
    });
    expect(legacyBypass).not.toMatch(/The Service Provider shall design a logo and brand kit/i);
  });

  it("post-payment hydrate re-seeds signer panel legal entities from intake when draft parties corrupt", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.intakeText).toContain("Priya Shah of Northline Studio");

    const corruptedHandoff = getRecipientHandoffNamesFromDraft(POST_GENERATION_CORRUPTED_DRAFT);
    expect(corruptedHandoff.n1).toBe("Harbor Marks LLC");
    expect(corruptedHandoff.n2).toBe("Diego Alvarez of");

    const hydrated = hydrateCanonicalPartyMetadataAfterCheckoutRestore({
      intakeText: snap!.intakeText,
      draft: POST_GENERATION_CORRUPTED_DRAFT,
    });
    expect(hydrated.legalEntities).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);

    const intakeAuthority = resolvePaidProSignerSetupLegalEntitiesFromIntake({
      intakeText: snap!.intakeText,
      draft: POST_GENERATION_CORRUPTED_DRAFT,
    });
    expect(intakeAuthority).toEqual(hydrated.legalEntities);

    establishPaidProSourceOfTruth({
      text: CONTAMINATED_GENERATED_CORPUS,
      source: "server_full_draft",
    });

    const displayContext = resolvePostPaymentReviewDisplayContext({
      intakeCombined: "",
      draft: POST_GENERATION_CORRUPTED_DRAFT,
      checkoutSnapIntake: snap!.intakeText,
    });

    const { party1Heading, party2Heading } = resolvePostPaymentSignerHeadings({
      draft: displayContext.draft,
      intakeText: displayContext.intakeText,
      recipient1Name: hydrated.legalEntities[0]!,
      recipient2Name: hydrated.legalEntities[1]!,
      agreementBodyText: CONTAMINATED_GENERATED_CORPUS,
    });

    expect(party1Heading).toBe("Priya Shah of Northline Studio");
    expect(party2Heading).toBe("Diego Alvarez of Harbor Marks LLC");
    expect(party1Heading).not.toBe(corruptedHandoff.n1);
    expect(party2Heading).not.toBe(corruptedHandoff.n2);
  });
});
