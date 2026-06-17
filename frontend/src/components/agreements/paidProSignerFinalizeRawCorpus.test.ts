import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { PAID_PRO_ACCEPTANCE_WITNESS_LINE } from "./paidProAcceptanceExecutionBlockInvariant";

const CLIENT = "Blue Canyon Analytics LLC";
const PROVIDER = "Iron Vale Systems Inc";

function starterCorpus(): string {
  return [
    "STARTER SERVICES AGREEMENT",
    "",
    `Between ${CLIENT} and ${PROVIDER}.`,
    "",
    "1. Services. As described.",
    "",
    "Signature:",
    "______________________________",
  ].join("\n");
}

function proCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${CLIENT} ("Client") and ${PROVIDER} ("Service Provider").`,
    "",
    "Section 4. Payment. Client shall pay fees within thirty (30) days of invoice.",
    "",
    ...Array.from(
      { length: 16 },
      (_, i) =>
        `Section ${i + 5}. Operative clause ${i + 1}. Each party shall perform its obligations in good faith and in accordance with applicable law.`,
    ),
    "",
    PAID_PRO_ACCEPTANCE_WITNESS_LINE,
    "",
    `CLIENT: ${CLIENT}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${PROVIDER}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

describe("resolvePaidProSignerFinalizeRawCorpus", () => {
  beforeEach(() => {
    clearFrozenCanonicalAgreementCorpus();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    clearFrozenCanonicalAgreementCorpus();
    clearPaidProSourceOfTruth();
  });

  it("prefers paid Pro SoT over stale starter frozen canonical", () => {
    const starterSnap = buildCanonicalAgreementSnapshot({
      surface: "test_starter_freeze",
      tier: "starter",
      candidates: [{ source: "free_starter", text: starterCorpus() }],
      intakeText: "consulting",
      parties: [
        { name: CLIENT, role: "Client", email: null },
        { name: PROVIDER, role: "Service Provider", email: null },
      ],
      signerState: { complete: false, signerCount: 2 },
      minLen: 120,
    });
    freezeCanonicalAgreementSnapshot(starterSnap, "free_starter");

    const proBody = proCorpus();
    establishPaidProSourceOfTruth({
      text: proBody,
      source: "server_full_draft",
      intakeText: "consulting",
    });

    const resolved = resolvePaidProSignerFinalizeRawCorpus();
    expect(resolved.source).toBe("paid_pro_source_of_truth");
    expect(resolved.corpus).toContain("MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT");
    expect(resolved.corpus).toMatch(/IN WITNESS WHEREOF/i);
    expect(resolved.corpus).not.toContain("STARTER SERVICES AGREEMENT");
  });

  it("immutableSourceOfTruthOnly ignores hydrated review plain candidates", () => {
    const proBody = proCorpus();
    establishPaidProSourceOfTruth({
      text: proBody,
      source: "server_full_draft",
      intakeText: "consulting",
    });
    const hydratedReview = proBody.replace(
      /Name: _+/,
      "Name: Sarah Mitchell",
    );
    const resolved = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: hydratedReview,
      immutableSourceOfTruthOnly: true,
    });
    expect(resolved.source).toBe("paid_pro_source_of_truth");
    expect(resolved.corpus).toBe(getPaidProSourceOfTruthText());
    expect(resolved.corpus).not.toMatch(/Sarah Mitchell/i);
  });
});
