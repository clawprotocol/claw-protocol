import { afterEach, describe, expect, it } from "vitest";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  buildPaidProSignerContactOverlayDiagnostic,
  buildPaidProTitleOpeningGuardDiagnostic,
} from "./paidProTest307Diagnostics";
import { detectPaidProMalformedServicesOpening } from "./paidProOpeningRecitalGuard";
import { canonicalPartyRecordsFromSignerIdentities } from "./canonicalPartyIdentityResolver";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

const TEST307_INTAKE =
  "Consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc for AI workflow implementation services.";

function malformedServerBody() {
  return [
    `This Agreement is between ${BLUE} ("party") and ${IRON} ("party").`,
    "",
    "CONSULTING AGREEMENT FOR AI WORKFLOW IMPLEMENTATION SERVICES",
    "",
    `This Consulting Agreement ("Agreement") is entered into as of the date of the last ("Effective Date"), by and between ${BLUE}, with its ("Service Provider") and ${IRON}, with its ("Client").`,
    "",
    ...Array.from({ length: 16 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the date first above written.",
    "",
    "CLIENT:",
    BLUE,
    "By: __________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    IRON,
    "By: __________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
  ].join("\n");
}

function test307Authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivs23@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89123",
      "11111 South Incarnation Blvd., Announcingtown, CT 01349",
    ],
  });
}

function finalizeTest307Workflow(rawCorpus: string) {
  const authority = test307Authority();
  establishPaidProSourceOfTruth({ text: rawCorpus, source: "server_full_draft" });
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus,
    authority,
    intakeRaw: TEST307_INTAKE,
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: true,
  });
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties, {
    intakeText: TEST307_INTAKE,
    acceptedCorpus: rawCorpus,
  });
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST307_INTAKE,
    }),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  return { authority, hydrated };
}

describe("TEST307 signer contact and opening regression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
  });

  it("repairs malformed opening and hydrates signer email/address after finalize", () => {
    finalizeTest307Workflow(malformedServerBody());
    const review = resolvePaidProPostFinalizeReviewPlain();
    const contact = buildPaidProSignerContactOverlayDiagnostic({
      reviewPlain: review,
      parties: test307Authority().parties,
      source: "authoritative_signing_snapshot",
    });
    const title = buildPaidProTitleOpeningGuardDiagnostic({
      reviewPlain: review,
      intakeText: TEST307_INTAKE,
    });

    expect(review).toMatch(/Name:\s*Sarah Mitchell/i);
    expect(review).toMatch(/Title:\s*CEO/i);
    expect(review).toMatch(/Name:\s*Michael Torres/i);
    expect(review).toMatch(/Title:\s*President/i);
    expect(review).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(review).toMatch(/Email for Notice:\s*ivs23@gmail\.com/i);
    expect(review).toMatch(
      /Address for Notice:\s*1027 S\. Rainbow Blvd\., #124, Las Vegas, NV 89123/i,
    );
    expect(review).toMatch(
      /Address for Notice:\s*11111 South Incarnation Blvd\., Announcingtown, CT 01349/i,
    );
    expect(review).not.toMatch(/\("party"\)/i);
    expect(title.hasGenericPartyLabels).toBe(false);
    expect(title.hasProfessionalTitle).toBe(true);
    expect(title.legalNamesPreserved).toBe(true);
    expect(contact.signerEmailsPresent).toBe(true);
    expect(contact.signerAddressesPresent).toBe(true);

    const invariant = analyzePaidProExecutionBlockInvariant(review, { expectedParties: 2 });
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.ok).toBe(true);
  });

  it("copy, display, export, and signer_setup surfaces match hydrated post-finalize review", () => {
    finalizeTest307Workflow(malformedServerBody());
    const opts = {
      draft: {
        parties: [
          { name: BLUE, role: "Client" },
          { name: IRON, role: "Service Provider" },
        ],
      } as import("./intakeSmartDefaults").ParsedDraftShape,
      intakeText: TEST307_INTAKE,
    };
    const review = getPaidProDocumentForSurface("review", opts)!.text;
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    const display = getPaidProDocumentForSurface("display", opts)!.text;
    const finalized = getPaidProDocumentForSurface("finalized", opts)!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;

    expect(hashPaidProCorpus(copy)).toBe(hashPaidProCorpus(review));
    expect(hashPaidProCorpus(display)).toBe(hashPaidProCorpus(review));
    expect(hashPaidProCorpus(finalized)).toBe(hashPaidProCorpus(review));
    expect(hashPaidProCorpus(signerSetup)).toBe(hashPaidProCorpus(review));
    for (const corpus of [review, copy, display, finalized, signerSetup]) {
      expect(corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
      expect(corpus).toMatch(/Address for Notice:\s*11111 South Incarnation Blvd\./i);
    }
  });

  it("premium readonly pick returns hydrated snapshot instead of raw SoT", () => {
    finalizeTest307Workflow(malformedServerBody());
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft: {
        parties: [
          { name: BLUE, role: "Client" },
          { name: IRON, role: "Service Provider" },
        ],
      } as import("./intakeSmartDefaults").ParsedDraftShape,
      agreementDocumentText: "",
      premiumCheckoutCompleted: true,
      intakeText: TEST307_INTAKE,
    });
    expect(pick.plainText.length).toBeGreaterThan(500);
    expect(pick.audit.candidates[0]?.reason).toMatch(/authoritative_signing_snapshot|paid_pro_review_hydrated/);
    expect(pick.plainText).toMatch(/Sarah Mitchell/i);
    expect(pick.plainText).toMatch(/anthemhayek@gmail\.com/i);
    expect(pick.plainText).not.toMatch(/\("party"\)/i);
    expect(hashPaidProCorpus(pick.plainText)).toBe(
      hashPaidProCorpus(resolvePaidProPostFinalizeReviewPlain()),
    );
  });

  it("detects malformed generic party opening before repair", () => {
    const records = canonicalPartyRecordsFromSignerIdentities(
      authorityPartiesToCanonicalPartyIdentities(test307Authority().parties, {
        intakeText: TEST307_INTAKE,
      }),
    );
    expect(detectPaidProMalformedServicesOpening(malformedServerBody(), records)).toBe(true);
  });
});
