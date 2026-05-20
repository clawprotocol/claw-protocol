import { describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import {
  canonicalDocumentFingerprint,
  isCanonicalCommittedText,
  stripCanonicalCommitMarker,
} from "./canonicalAgreementDocument";
import { applyPaidProRenderPolish, clearPaidProRenderPolishCacheForTests } from "./paidProRenderPolish";
import { countWitnessBlocks } from "./signaturePreviewArchitecture";

const IRONCLAD_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
];

describe("premium output idempotency", () => {
  it("second polish pass is validate-only and preserves fingerprint", () => {
    clearPaidProRenderPolishCacheForTests();
    const body = buildIroncladPremiumFullDraftBody();
    const first = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "idempotency_test",
      skipCache: true,
    });
    expect(isCanonicalCommittedText(first.text)).toBe(true);
    const fp1 = canonicalDocumentFingerprint(first.text);
    const second = applyPaidProRenderPolish(first.text, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "idempotency_test_2",
      skipCache: true,
    });
    const fp2 = canonicalDocumentFingerprint(second.text);
    expect(fp2).toBe(fp1);
    expect(stripCanonicalCommitMarker(second.text)).toBe(stripCanonicalCommitMarker(first.text));
  });

  it("preserves five intake emails with zero mutation count", () => {
    clearPaidProRenderPolishCacheForTests();
    const withEmails = [
      buildIroncladPremiumFullDraftBody(),
      "",
      "Notices:",
      ...IRONCLAD_EMAILS.map((e) => `Contact: ${e}`),
    ].join("\n");
    const { text, emailGuard } = applyPaidProRenderPolish(withEmails, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "email_literal_test",
      skipCache: true,
    });
    expect(emailGuard.mutatedEmailCount).toBe(0);
    expect(emailGuard.originalEmailCount).toBe(5);
    for (const email of IRONCLAD_EMAILS) {
      expect(text).toContain(email);
    }
  });

  it("premium preview path has at most one witness block", () => {
    const body = buildIroncladPremiumFullDraftBody();
    const witness = "IN WITNESS WHEREOF\n\n" + body + "\n\nIN WITNESS WHEREOF\n\nSig lines";
    const { text } = applyPaidProRenderPolish(witness, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "sig_dedupe",
      skipCache: true,
    });
    expect(countWitnessBlocks(stripCanonicalCommitMarker(text))).toBeLessThanOrEqual(1);
  });
});
