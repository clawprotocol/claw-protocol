/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { commitAcceptedPaidProCorpusHandoffSync } from "./enterCanonicalPaidProReviewFlow";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { beginPaidProPostFinalizeSignerDetailsReopen } from "./paidProPostFinalizeEditSignerDetails";
import {
  enrichPaidProPostFinalizeDisplayCorpus,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { PAID_PRO_ACCEPTANCE_WITNESS_LINE } from "./paidProAcceptanceExecutionBlockInvariant";
import {
  SHARED_HARBOR_PEAK,
  SHARED_RED_MESA,
  buildTwoPartyProfessionalServicesCorpus,
} from "./paidProSharedFixtureSystem";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { setOrgId } from "../../launch/orgContext";

const BATCH21_AGREEMENT_ID = "ag_batch21_frozen_legal";
const BATCH21_ORGANIZATION_ID = "org_batch21_frozen_legal";

const CLIENT = SHARED_RED_MESA;
const PROVIDER = SHARED_HARBOR_PEAK;
const SIGNER_A = "Jordan Hale";
const SIGNER_B = "Casey Quinn";
const EMAIL_A1 = "jordan.hale@example.test";
const EMAIL_A2 = "jordan.hale.corrected@example.test";
const EMAIL_B = "casey.quinn@example.test";

function buildSoTOnlyWorkingCorpus(): string {
  return [
    "MUTUAL CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${CLIENT} ("Client") and ${PROVIDER} ("Service Provider").`,
    "",
    ...Array.from(
      { length: 16 },
      (_, i) =>
        `Section ${i + 4}. Operative clause ${i + 1}. Each party shall perform its obligations in good faith and in accordance with applicable law.`,
    ),
    "",
    PAID_PRO_ACCEPTANCE_WITNESS_LINE,
    "",
    `CLIENT: ${CLIENT}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${PROVIDER}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Date: _____________________________",
  ].join("\n");
}

function liveAuthority(args: {
  signerNames: [string, string];
  signerTitles: [string, string];
  emails: [string, string];
}) {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: CLIENT,
    recipient2Name: PROVIDER,
    recipient1Email: args.emails[0],
    recipient2Email: args.emails[1],
    extraPartyReviewEmails: [],
    partySignerNames: [...args.signerNames],
    partySignerTitles: [...args.signerTitles],
    partyAddresses: ["100 Ridge Way, Boise, ID 83702", "200 Cedar Ave, Tacoma, WA 98402"],
  });
}

function finalizeFromAuthority(
  authority: ReturnType<typeof buildLivePaidProSignerMetadataAuthority>,
  intakeRaw = "",
  scope?: { agreementId: string; organizationId: string; expectedFrozenHash: string },
) {
  const raw = resolvePaidProSignerFinalizeRawCorpus({
    immutableSourceOfTruthOnly: true,
  });
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: raw.corpus,
    authority,
    intakeRaw,
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
    agreementId: scope?.agreementId,
    organizationId: scope?.organizationId,
    expectedFrozenHash: scope?.expectedFrozenHash,
  });
  const snapshot = createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({
      identities: hydrated.identities,
      signFirst: true,
    }),
    replaceExisting: true,
    preserveFrozenServerFullHydratedCorpus: true,
  });
  return { hydrated, snapshot, raw };
}

describe("Batch 2.1 frozen legal corpus vs signer metadata", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProSourceOfTruth();
    setOrgId(BATCH21_ORGANIZATION_ID);
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProSourceOfTruth();
  });

  it("validated accepted handoff keeps frozen legal bytes while signer metadata updates independently", () => {
    const accepted = buildTwoPartyProfessionalServicesCorpus(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const frozenHash = hashPaidProCorpus(accepted);
    markPaidProPipelineValidationPassed({
      text: accepted,
      source: "server_full_draft",
    });
    expect(
      commitAcceptedPaidProCorpusHandoffSync({
        corpusPlain: accepted,
        pipelineSource: "server_full_draft",
        agreementId: BATCH21_AGREEMENT_ID,
        organizationId: BATCH21_ORGANIZATION_ID,
      }),
    ).toBe(true);
    establishPaidProSourceOfTruth({
      text: accepted,
      source: "server_full_draft",
      intakeText: `Draft a services agreement between ${CLIENT} and ${PROVIDER}.`,
    });

    const frozenScope = {
      agreementId: BATCH21_AGREEMENT_ID,
      organizationId: BATCH21_ORGANIZATION_ID,
      expectedFrozenHash: frozenHash,
    };
    const first = finalizeFromAuthority(
      liveAuthority({
        signerNames: [SIGNER_A, SIGNER_B],
        signerTitles: ["CEO", "President"],
        emails: [EMAIL_A1, EMAIL_B],
      }),
      "",
      frozenScope,
    );
    expect(first.hydrated.corpus).toBe(accepted.trim());
    expect(hashPaidProCorpus(first.hydrated.corpus)).toBe(frozenHash);
    expect(first.snapshot.hash).toBe(frozenHash);
    expect(first.hydrated.corpus).not.toContain(SIGNER_A);
    expect(first.hydrated.corpus).not.toContain(EMAIL_A1);
    expect(first.snapshot.signerMetadata.partySignerNames).toEqual([SIGNER_A, SIGNER_B]);
    expect(first.snapshot.signerMetadata.recipient1Email).toBe(EMAIL_A1);

    const overlay = enrichPaidProPostFinalizeDisplayCorpus(first.hydrated.corpus);
    expect(overlay).toMatch(new RegExp(SIGNER_A, "i"));
    expect(overlay).toMatch(new RegExp(SIGNER_B, "i"));
    expect(overlay).toMatch(/\bCEO\b/);
    expect(overlay).toMatch(/\bPresident\b/);

    beginPaidProPostFinalizeSignerDetailsReopen();
    const second = finalizeFromAuthority(
      liveAuthority({
        signerNames: [SIGNER_A, SIGNER_B],
        signerTitles: ["CEO", "President"],
        emails: [EMAIL_A2, EMAIL_B],
      }),
      "",
      frozenScope,
    );
    expect(second.hydrated.corpus).toBe(accepted.trim());
    expect(hashPaidProCorpus(second.hydrated.corpus)).toBe(frozenHash);
    expect(getAuthoritativeSigningSnapshot()?.signerMetadata.recipient1Email).toBe(EMAIL_A2);
    expect(getAuthoritativeSigningSnapshot()?.signerMetadata.recipient2Email).toBe(EMAIL_B);
    expect(second.hydrated.corpus).not.toContain(EMAIL_A2);

    const correctedOverlay = resolvePaidProPostFinalizeReviewPlain();
    expect(correctedOverlay).toMatch(new RegExp(SIGNER_A, "i"));
    expect(correctedOverlay).toMatch(new RegExp(SIGNER_B, "i"));
    expect(getAuthoritativeSigningSnapshot()?.signerMetadata.recipient1Email).not.toBe(EMAIL_A1);
  });

  it("SoT-only finalize still hydrates signer metadata into the working corpus", () => {
    const working = buildSoTOnlyWorkingCorpus();
    establishPaidProSourceOfTruth({
      text: working,
      source: "server_full_draft",
      intakeText: "consulting",
    });
    const { hydrated } = finalizeFromAuthority(
      liveAuthority({
        signerNames: [SIGNER_A, SIGNER_B],
        signerTitles: ["CEO", "Member"],
        emails: [EMAIL_A1, EMAIL_B],
      }),
    );
    expect(hydrated.corpus).toMatch(new RegExp(SIGNER_A, "i"));
    expect(hydrated.corpus).toMatch(new RegExp(EMAIL_A1.replace(".", "\\.")));
    expect(hashPaidProCorpus(hydrated.corpus)).not.toBe(hashPaidProCorpus(working));
  });
});
