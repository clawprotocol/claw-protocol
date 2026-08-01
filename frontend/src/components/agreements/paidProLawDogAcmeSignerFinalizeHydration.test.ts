/** @vitest-environment jsdom */
/**
 * P0 staging regression — Genesis LawDog/Acme first-review signer finalize must produce one
 * authoritative signing-ready document (render = snapshot = review-link payload) with saved
 * signer name/title/email and zero "provided during signer setup" placeholders.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { detectExecutionBlockRoleInversion } from "./paidProAcceptedCorpusPartyRoles";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  canProceedPaidProReviewFirstHandoffAfterFinalize,
  isPaidProSigningReadyHydratedCorpus,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProReviewLinkCorpusPlain } from "./paidProReviewLinkCorpusParity";
import { evaluatePaidProSigningHandoffReadiness } from "./paidProSigningHandoffAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewTrustSteps } from "./paidProReviewTrustUx";

const LAWDOG = "LawDog Demo LLC";
const ACME = "Acme Test Co";
const LAWDOG_ACME_SYNTHETIC_INTAKE =
  "Create a services agreement between LawDog Demo LLC and Acme Test Co. LawDog Demo LLC will provide agreement-drafting software for $1,000 per month. The term is 30 days. Either party may cancel with 7 days’ written notice. Illinois law applies.";
const ACME_SIGNER = "Anthem Acme";
const LAWDOG_SIGNER = "Anthem LawDog";
const ACME_EMAIL = "cryptocurated21+acme@gmail.com";
const LAWDOG_EMAIL = "cryptocurated21+lawdog@gmail.com";
const SIGNER_TITLE = "Authorized Signer";

function padCorpus(body: string): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(40);
  return `${body.trim()}\n\n${pad}`;
}

/** Pre-signer first-review draft with placeholders + blank execution lines (staging repro). */
function buildLawDogAcmePreSignerCorpus(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${ACME} ("Client") and ${LAWDOG} ("Service Provider").`,
      "",
      "1. Services",
      "Provider will provide agreement-drafting software access to Client for one thousand dollars ($1,000) per month.",
      "2. Term",
      "The term is thirty (30) days from the Effective Date. Either party may cancel with seven (7) days' written notice.",
      "3. Fees and Payment",
      "Client will pay Provider the subscription fee monthly.",
      "4. Confidentiality",
      "Each party will protect Confidential Information disclosed under this Agreement.",
      "5. Representations",
      "Each party represents that it has authority to enter into this Agreement.",
      "6. Termination",
      "Either party may terminate for material breach after a seven (7) day cure period.",
      "7. Liability",
      "To the fullest extent permitted by law, aggregate liability is limited.",
      "8. General Provisions",
      "9. Independent Contractor",
      "Provider is an independent contractor and not an employee of Client.",
      "10. Notices",
      "10.4 Notices",
      "Notices under this Agreement shall be sent as follows:",
      `If to ${ACME}:`,
      ACME,
      "Attention: Authorized Signer",
      "Email: provided during signer setup",
      "Address: provided during signer setup",
      "",
      `If to ${LAWDOG}:`,
      LAWDOG,
      "Attention: Authorized Signer",
      "Email: provided during signer setup",
      "Address: provided during signer setup",
      "11. Governing Law",
      "This Agreement shall be governed by the laws of Illinois.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `CLIENT: ${ACME}`,
      "By: __________________________",
      "Name: __________________________",
      "Title: __________________________",
      "Date: __________________________",
      "",
      `SERVICE PROVIDER: ${LAWDOG}`,
      "By: __________________________",
      "Name: __________________________",
      "Title: __________________________",
      "Date: __________________________",
    ].join("\n"),
  );
}

function buildAcmeLawDogAuthority() {
  // Commercial authority orders Service Provider (LawDog) before Client (Acme).
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 2,
      recipient1Name: LAWDOG,
      recipient2Name: ACME,
      recipient1Email: LAWDOG_EMAIL,
      recipient2Email: ACME_EMAIL,
      extraPartyReviewEmails: [],
      partySignerNames: [LAWDOG_SIGNER, ACME_SIGNER],
      partySignerTitles: [SIGNER_TITLE, SIGNER_TITLE],
      partyAddresses: ["", ""],
    },
    "live_ui",
    {
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      draftPartyNames: [LAWDOG, ACME],
    },
  );
}

function reset() {
  resetPaidProPipelineTestIsolation();
  clearPaidProSourceOfTruth();
  clearAuthoritativeSigningSnapshot();
  clearPaidProPinnedSignerAppliedCorpus();
  clearConsumedPaidProSignerMetadataAuthority();
}

describe("LawDog/Acme signer finalize → signing-ready document hydration P0", () => {
  beforeEach(reset);
  afterEach(reset);

  it("finalizes into one hydrated authoritative corpus used by render, snapshot, and signature-link payload", () => {
    const frozen = buildLawDogAcmePreSignerCorpus();
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      reviewSessionId: "review-lawdog-acme-signer-finalize",
      generationOutcome: "ok",
    });

    const preSigner = getPaidProSourceOfTruthText();
    expect(preSigner).toMatch(/provided during signer setup/i);
    expect(preSigner).toMatch(/Name:\s*_{4,}/i);
    expect(preSigner).toContain(`CLIENT: ${ACME}`);
    expect(preSigner).toContain(`SERVICE PROVIDER: ${LAWDOG}`);

    const authority = buildAcmeLawDogAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const byEntity = new Map(authority.parties.map((p) => [p.partyLegalName, p]));
    expect(byEntity.get(ACME)?.signerName).toBe(ACME_SIGNER);
    expect(byEntity.get(ACME)?.signerEmail).toBe(ACME_EMAIL);
    expect(byEntity.get(ACME)?.signerTitle).toBe(SIGNER_TITLE);
    expect(byEntity.get(LAWDOG)?.signerName).toBe(LAWDOG_SIGNER);
    expect(byEntity.get(LAWDOG)?.signerEmail).toBe(LAWDOG_EMAIL);
    expect(byEntity.get(LAWDOG)?.signerTitle).toBe(SIGNER_TITLE);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: preSigner,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: LAWDOG_ACME_SYNTHETIC_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);
    expect(isPaidProSigningReadyHydratedCorpus(hydrated.corpus)).toBe(true);

    const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      draftPartyNames: [LAWDOG, ACME],
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata,
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const snapshotCorpus = readAuthoritativeSigningCorpus();
    const rendered = resolvePaidProPostFinalizeReviewPlain();
    const firstReviewPaint = resolvePaidProFirstReviewVisibleDisplayPlain({
      paidProActive: true,
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
    });
    const reviewLink = resolvePaidProReviewLinkCorpusPlain();

    expect(snapshotCorpus).not.toMatch(/provided during signer setup/i);
    expect(rendered).not.toMatch(/provided during signer setup/i);
    expect(firstReviewPaint.plain).not.toMatch(/provided during signer setup/i);
    expect(firstReviewPaint.source).toBe("authoritative_signing_snapshot");
    expect(reviewLink?.plain).toBeTruthy();
    expect(reviewLink!.plain).not.toMatch(/provided during signer setup/i);

    // One authoritative hash/version across render, saved snapshot, and signature-link payload.
    const authoritativeHash = hashPaidProCorpus(snapshotCorpus);
    expect(hashPaidProCorpus(rendered)).toBe(authoritativeHash);
    expect(hashPaidProCorpus(firstReviewPaint.plain)).toBe(authoritativeHash);
    expect(hashPaidProCorpus(reviewLink!.plain)).toBe(authoritativeHash);
    expect(getAuthoritativeSigningSnapshot()?.hash).toBe(authoritativeHash);

    // Visible signing-ready fields for both parties (role order preserved).
    expect(rendered).toContain(`CLIENT: ${ACME}`);
    expect(rendered).toContain(`SERVICE PROVIDER: ${LAWDOG}`);
    expect(rendered).toContain(ACME_SIGNER);
    expect(rendered).toContain(LAWDOG_SIGNER);
    expect(rendered).toContain(SIGNER_TITLE);
    expect(rendered).toContain(ACME_EMAIL);
    expect(rendered).toContain(LAWDOG_EMAIL);
    expect(rendered).toMatch(new RegExp(`Name:\\s*${ACME_SIGNER}`, "i"));
    expect(rendered).toMatch(new RegExp(`Title:\\s*${SIGNER_TITLE}`, "i"));
    expect(rendered).toMatch(new RegExp(`Name:\\s*${LAWDOG_SIGNER}`, "i"));
    expect(countBlankSignerMetadataLinesInExecutionBlock(rendered)).toBe(0);
    expect(detectExecutionBlockRoleInversion(rendered)).toBe(false);

    const handoff = evaluatePaidProSigningHandoffReadiness({
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      draftPartyNames: [LAWDOG, ACME],
      requiredPartyCount: 2,
    });
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      const handoffByEntity = new Map(handoff.recipients.map((r) => [r.partyLegalName, r]));
      expect(handoffByEntity.get(ACME)?.signerName).toBe(ACME_SIGNER);
      expect(handoffByEntity.get(ACME)?.email).toBe(ACME_EMAIL);
      expect(handoffByEntity.get(ACME)?.signerTitle).toBe(SIGNER_TITLE);
      expect(handoffByEntity.get(LAWDOG)?.signerName).toBe(LAWDOG_SIGNER);
      expect(handoffByEntity.get(LAWDOG)?.email).toBe(LAWDOG_EMAIL);
      expect(handoffByEntity.get(LAWDOG)?.signerTitle).toBe(SIGNER_TITLE);
    }

    expect(
      canProceedPaidProReviewFirstHandoffAfterFinalize({
        signersComplete: true,
        reviewPlain: rendered,
      }),
    ).toBe(true);

    const trust = resolvePaidProReviewTrustSteps({
      signersReady: true,
      signerMetadataFinalized: true,
      signingReadyHydrated: true,
    });
    expect(trust.find((s) => s.id === "signature_links_ready")?.label).toBe("Ready for signing");
  });
});
