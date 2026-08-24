/** @vitest-environment jsdom */
/**
 * Post-payment integration: premiumCompletion restore must keep bilateral identity on
 * signer headings, editable inputs, and visible review plain — not helper-only sanitizer calls.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCanonicalPartyMetadata } from "./canonicalPartyMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resetSignerCountAuthorityDiagnosticsForTests } from "./signerCountAuthority";
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
} from "./paidProSourceOfTruth";
import { rebuildBodyFromIntakeForProFailure } from "./freeStarterReviewBodyResolver";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupRenderSlot,
} from "./signerSetupPartyIdentity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC for a logo and brand kit, 2400 dollars due on signing, 30 days starting August 24 2026, Texas law.";

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
  'This Agreement is between Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit ("Service Provider").',
  "",
  "1. SERVICES",
  "The service provider agrees to provide Priya Shah of Northline Studio will design a logo and brand kit.",
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

/** Mirrors AgreementBuilderIntake paidProFirstReviewDisplayContext + signer setup render wiring. */
function resolvePostPaymentReviewDisplayContext(args: {
  intakeCombined: string;
  draft: ParsedDraftShape;
  checkoutSnapIntake: string;
}) {
  const resolvedIntakeText = (args.intakeCombined || args.checkoutSnapIntake || "").trim();
  const repairedDraft = repairCheckoutBackRestoreDraftParties(args.draft, resolvedIntakeText);
  let resolvedAcceptedPlain = "";
  if (resolvedIntakeText.length >= 20) {
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

    const visible = resolvePaidProFirstReviewVisibleDisplayPlain({
      draft: displayContext.draft,
      intakeText: displayContext.intakeText,
      acceptedCanonicalPlain: displayContext.acceptedCanonicalPlain,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
    }).plain;

    expect(visible).toContain(
      'Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider")',
    );
    expect(visible).not.toMatch(
      /Diego Alvarez of Harbor Marks LLC to design a logo and brand kit \("Service Provider"\)/,
    );
    expect(visible).not.toMatch(
      /agrees to provide Priya Shah of Northline Studio will design a logo and brand kit/i,
    );
    expect(visible).not.toMatch(/CLIENT:\s*\nDiego Alvarez of Harbor Marks LLC/i);
    expect(visible).not.toMatch(
      /SERVICE PROVIDER:\s*\nDiego Alvarez of Harbor Marks LLC to design a logo and brand kit/i,
    );
    expect(visible).toMatch(/The Service Provider shall design a logo and brand kit/i);
  });
});
