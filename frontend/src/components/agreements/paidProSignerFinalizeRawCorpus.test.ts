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
    ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    PAID_PRO_ACCEPTANCE_WITNESS_LINE,
    "",
    "CLIENT:",
    CLIENT,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "",
    "SERVICE PROVIDER:",
    PROVIDER,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
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
});
