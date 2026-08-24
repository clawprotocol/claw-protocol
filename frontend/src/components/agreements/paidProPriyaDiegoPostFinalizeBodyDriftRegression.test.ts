/** @vitest-environment jsdom */
/**
 * Pre-Continue → post-finalize selector transition: intake-authority-sealed review plain
 * must not regress when hydrated corpus lock engages after signer Continue.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { clearCanonicalPartyMetadata } from "./canonicalPartyMetadataAuthority";
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
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProPostFinalizeUserVisiblePlain } from "./paidProDisplayPlainAuthority";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  resolveCommercialLockedSimpleProFinalReviewPlain,
  resealPaidProReviewPlainAfterDisplayPolish,
} from "./simpleProFinalReviewDisplayPlain";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
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

/** Live raw post-finalize corpus from contaminated server_full_draft SoT. */
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
  "Name: __________________________",
  "",
  "SERVICE PROVIDER:",
  "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
  "By: __________________________",
  "Name: __________________________",
].join("\n");

function resolvePostPaymentReviewDisplayContext(args: {
  intakeCombined: string;
  draft: ParsedDraftShape;
  checkoutSnapIntake: string;
}) {
  const resolvedIntakeText = (args.intakeCombined || args.checkoutSnapIntake || "").trim();
  const repairedDraft = repairCheckoutBackRestoreDraftParties(args.draft, resolvedIntakeText);
  return {
    draft: repairedDraft,
    intakeText: resolvedIntakeText,
    acceptedCanonicalPlain: CONTAMINATED_GENERATED_CORPUS,
    premiumCheckoutCompleted: true,
    premiumPaidDocumentSurface: true,
    paidProActive: true,
  };
}

function resolvePreContinueVisiblePlain(
  displayContext: ReturnType<typeof resolvePostPaymentReviewDisplayContext>,
): string {
  const firstReviewAuthority = resolvePaidProFirstReviewVisibleDisplayPlain(displayContext);
  const raw = (firstReviewAuthority.plain || "").trim();
  const polished = polishProAgreementDisplayLayer(raw, {
    draft: displayContext.draft ?? null,
    intakeText: displayContext.intakeText,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: false,
  }).text.trim();
  const resealed = resealPaidProReviewPlainAfterDisplayPolish({
    polishedPlain: polished,
    draft: displayContext.draft ?? null,
    intakeText: displayContext.intakeText,
  });
  const commercialLocked = resolveCommercialLockedSimpleProFinalReviewPlain({
    displayPolishedPaidProPlain: resealed,
  });
  return (commercialLocked || resealed).trim();
}

/** Mirrors AgreementBuilderIntake simpleProFinalReviewDisplayPlain post-finalize branch. */
function resolvePostFinalizeVisiblePlain(
  displayContext: ReturnType<typeof resolvePostPaymentReviewDisplayContext>,
): string {
  expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(true);
  const locked = resolvePaidProPostFinalizeReviewPlain(displayContext.draft ?? null);
  return resolvePaidProPostFinalizeUserVisiblePlain(locked, displayContext.draft ?? null).trim();
}

function simulateContinueFinalize(
  displayContext: ReturnType<typeof resolvePostPaymentReviewDisplayContext>,
  preContinuePlain: string,
) {
  const authority = buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Priya Shah of Northline Studio",
    recipient2Name: "Diego Alvarez of Harbor Marks LLC",
    recipient1Email: "priya.shah@example.com",
    recipient2Email: "diego.alvarez@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Priya Shah", "Diego Alvarez"],
    partySignerTitles: ["", ""],
    partyAddresses: ["", ""],
  });
  setConsumedPaidProSignerMetadataAuthority(authority);

  const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
    authoritativePaidProReviewPlain: preContinuePlain,
    simpleProFinalReviewPlain: preContinuePlain,
    immutableSourceOfTruthOnly: true,
  });
  expect(rawResolution.source).toBe("paid_pro_source_of_truth");
  expect(rawResolution.corpus.length).toBeGreaterThanOrEqual(200);

  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: rawResolution.corpus,
    authority,
    intakeRaw: displayContext.intakeText,
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
  });

  const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata,
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: displayContext.intakeText,
      draftPartyNames: displayContext.draft.parties?.map((p) => p.name ?? "") ?? [],
    }),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    intakeText: displayContext.intakeText,
    replaceExisting: true,
  });
  setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
}

function assertIntakeAuthoritySealedBody(visible: string) {
  const openingRegion = visible.split(/1\.\s+SERVICES/i)[0] ?? visible;
  expect((openingRegion.match(/Priya Shah of Northline Studio/gi) ?? []).length).toBe(1);
  expect((openingRegion.match(/Diego Alvarez of Harbor Marks LLC/gi) ?? []).length).toBe(1);
  expect(openingRegion).not.toMatch(/\n\s*\(collectively,\s+the\s+"Parties"\)\.\s*\n/i);
  expect(visible).not.toMatch(
    /\(collectively,\s+the\s+"Parties"\)[\s\S]{0,120}\(collectively,\s+the\s+"Parties"\)/i,
  );
  expect(visible).not.toMatch(/agrees to provide services as described in the parties'? communications/i);
  expect(visible).toMatch(/The Service Provider shall design a logo and brand kit/i);
  expect(visible).not.toMatch(
    /Diego Alvarez of Harbor Marks LLC to design a logo and brand kit \("Service Provider"\)/,
  );
}

describe("Priya/Diego to-design pre-Continue → post-finalize body drift regression", () => {
  beforeEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  afterEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("post-Continue visible plain matches pre-Continue intake-authority seal (no body drift)", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });

    establishPaidProSourceOfTruth({
      text: CONTAMINATED_GENERATED_CORPUS,
      source: "server_full_draft",
      intakeText: INTAKE,
    });

    const displayContext = resolvePostPaymentReviewDisplayContext({
      intakeCombined: "",
      draft: POST_GENERATION_CORRUPTED_DRAFT,
      checkoutSnapIntake: INTAKE,
    });

    const preContinue = resolvePreContinueVisiblePlain(displayContext);
    assertIntakeAuthoritySealedBody(preContinue);

    simulateContinueFinalize(displayContext, preContinue);

    expect(readCheckoutBackRestoreSnapshot()?.intakeText).toBe(INTAKE);
    const postFinalize = resolvePostFinalizeVisiblePlain(displayContext);
    assertIntakeAuthoritySealedBody(postFinalize);

    const preSection1 = preContinue.split(/1\.\s+SERVICES/i)[1]?.split(/\n\s*\d+\./)[0] ?? "";
    const postSection1 = postFinalize.split(/1\.\s+SERVICES/i)[1]?.split(/\n\s*\d+\./)[0] ?? "";
    expect(postSection1).toContain("The Service Provider shall design a logo and brand kit");
    expect(preSection1.replace(/\s+/g, " ").trim()).toBe(postSection1.replace(/\s+/g, " ").trim());

    expect(postFinalize).toMatch(/Name:\s*Priya Shah/i);
    expect(postFinalize).toMatch(/Name:\s*Diego Alvarez/i);

    const legacyBypass = resolvePaidProReviewRenderPlain({
      draft: displayContext.draft,
      intakeText: displayContext.intakeText,
    });
    expect(legacyBypass).toMatch(/The Service Provider shall design a logo and brand kit/i);
  });
});
