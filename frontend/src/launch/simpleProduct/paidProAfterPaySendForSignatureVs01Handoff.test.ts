/** @vitest-environment jsdom */
/**
 * After-pay Send for signature: painted deal is <1500 chars. The existing
 * 1500-char session reader / VS01 corpus gate dropped it, revived a leftover
 * "Links created" packet, and fail-closed with "We could not open the e-sign workspace."
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGuidedVs01SigningHandoff } from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  writeGuidedVs01SigningHandoffSession,
  clearGuidedVs01SigningHandoffSession,
} from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import { executePaidProPostRecipientSetupHandoff } from "./paidProPostRecipientSetupHandoff";
import {
  clearAgreementVs01BridgeSession,
  readAgreementVs01BridgeSession,
} from "./agreementToVs01SigningBridge";
import type { AgreementDraft } from "../../agreement/agreementTypes";

const PAINTED =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Priya Shah of Northline Studio and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment $2,400 due on signing. Term 30 days. Governing law: Texas.";

const LEFTOVER =
  `${"LEFTOVER LINKS CREATED PACKET — stale review snapshot. ".repeat(40)}\nBy: ________________\nBy: ________________`;

function paintedDraft(): AgreementDraft {
  return {
    id: "ag_after_pay_priya_diego",
    title: "SERVICES AGREEMENT",
    jurisdiction: "Texas",
    parties: [
      {
        name: "Priya Shah of Northline Studio",
        role: "owner",
        email: "priya.shah.qa@example.com",
        signerName: "Priya Shah",
      },
      {
        name: "Diego Alvarez of Harbor Marks LLC",
        role: "signer",
        email: "diego.alvarez.qa@example.com",
        signerName: "Diego Alvarez",
      },
    ],
  } as AgreementDraft;
}

describe("after-pay Send for signature opens existing e-sign workspace", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearGuidedVs01SigningHandoffSession();
    clearAgreementVs01BridgeSession();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    clearGuidedVs01SigningHandoffSession();
    clearAgreementVs01BridgeSession();
    vi.unstubAllGlobals();
  });

  it("keeps the painted deal and opens /app/esign when leftover packet + seed fail", async () => {
    expect(PAINTED.length).toBeGreaterThanOrEqual(200);
    expect(PAINTED.length).toBeLessThan(1500);
    expect(LEFTOVER.length).toBeGreaterThanOrEqual(1500);

    writeGuidedVs01SigningHandoffSession(
      buildGuidedVs01SigningHandoff({
        corpusText: LEFTOVER,
        source: "finalized_signer_applied_guided_corpus",
        recipientEmails: ["stale@example.com"],
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: { code: "agreement_not_found" } }),
      }),
    );

    const routes: string[] = [];
    const paintedHandoff = buildGuidedVs01SigningHandoff({
      corpusText: PAINTED,
      source: "finalized_signer_applied_guided_corpus",
      recipientEmails: ["priya.shah.qa@example.com", "diego.alvarez.qa@example.com"],
    });

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: (to) => {
        routes.push(to);
      },
      agreementId: "ag_after_pay_priya_diego",
      draft: paintedDraft(),
      premiumSendIntent: "signature",
      logSource: "test_after_pay_send_for_signature",
      agreementCorpusText: PAINTED,
      guidedSigningHandoff: paintedHandoff,
      relaxPaidSessionCorpusAssert: true,
    });

    expect(result.ok, result.ok ? "" : result.failure.userMessage).toBe(true);
    if (result.ok) expect(result.destination).toBe("vs01");
    expect(routes.length).toBe(1);
    expect(routes[0]).toMatch(/^\/app\/esign\/[^?]+\?agreement_bridge=1$/);
    const bridge = readAgreementVs01BridgeSession();
    expect(bridge?.agreementCorpusText).toBe(PAINTED);
    expect(bridge?.agreementCorpusText).not.toContain("LEFTOVER LINKS CREATED");
    expect(bridge?.senderFirstLawdogHandoff).toBe(true);
  });

  it("Send for review path is unchanged (does not take the local signature bridge)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "paidProPostRecipientSetupHandoff.ts"), "utf8");
    const reviewStart = s.indexOf('if (options.premiumSendIntent === "review")');
    const signatureStart = s.indexOf("resolvePaidSessionSignatureTrackHandoff");
    expect(reviewStart).toBeGreaterThan(-1);
    expect(signatureStart).toBeGreaterThan(reviewStart);
    const reviewBlock = s.slice(reviewStart, signatureStart);
    expect(reviewBlock).toContain("mintAndPersistReviewLinksForHandoff");
    expect(reviewBlock).not.toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
    expect(reviewBlock).not.toContain("relaxPaidSessionCorpusAssert");
  });
});
